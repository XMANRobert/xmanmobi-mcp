<?php
namespace app\controller;

use app\service\GoogleAdsBiService;
use app\support\CustomerAccess;
use think\facade\Db;
use think\Request;

/** Guarded MCP advertising changes with explicit confirmation and audit logs. */
class AiAdActions
{
    use CustomerAccess;

    private const WRITE_SCOPE = 'ad_management:write';
    private const PROPOSAL_TTL = 900;

    private GoogleAdsBiService $google;

    public function __construct(GoogleAdsBiService $google)
    {
        $this->google = $google;
    }

    public function propose(Request $request)
    {
        if ($error = $this->authorizeWrite($request)) return $error;
        $input = $this->jsonInput($request);
        try {
            $target = $this->resolveTarget($request, $input);
            $action = $this->normalizeAction($target, $input);
            $risk = $this->risk($action['action_type'], $action['old_value'], $action['new_value']);
            if ($risk['blocked']) return $this->response(422, ['risk' => $risk], $risk['message']);

            $plainToken = $this->randomToken(32);
            $proposalKey = $this->randomToken(32);
            $now = date('Y-m-d H:i:s');
            $proposal = [
                'proposal_key' => $proposalKey,
                'user_id' => $this->accessUserId($request),
                'platform' => $target['platform'],
                'customer_id' => $target['customer_id'],
                'account_id' => $target['account']['id'],
                'resource_type' => $target['resource_type'],
                'resource_id' => $target['resource']['id'],
                'remote_id' => $target['remote_id'],
                'action_type' => $action['action_type'],
                'old_value' => json_encode($action['old_value'], JSON_UNESCAPED_UNICODE),
                'new_value' => json_encode($action['new_value'], JSON_UNESCAPED_UNICODE),
                'reason' => mb_substr(trim((string)($input['reason'] ?? '')), 0, 1000),
                'evidence_json' => json_encode($input['evidence'] ?? [], JSON_UNESCAPED_UNICODE),
                'risk_level' => $risk['level'],
                'status' => 'proposed',
                'confirmation_token_hash' => hash('sha256', $plainToken),
                'idempotency_key' => 'mcp_' . $proposalKey,
                'expires_at' => date('Y-m-d H:i:s', time() + self::PROPOSAL_TTL),
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $proposalId = (int)Db::name('ad_ai_action_proposals')->insertGetId($proposal);
            $this->audit($request, $proposal + ['id' => $proposalId], 'propose', $target['snapshot'], [], $input, ['risk' => $risk], 'success');

            return $this->response(0, [
                'proposal_id' => $proposalId,
                'proposal_key' => $proposalKey,
                'confirmation_token' => $plainToken,
                'expires_at' => $proposal['expires_at'],
                'risk' => $risk,
                'change' => [
                    'platform' => $target['platform'], 'resource_type' => $target['resource_type'],
                    'resource_id' => $target['resource']['id'], 'remote_id' => $target['remote_id'],
                    'resource_name' => (string)($target['resource']['name'] ?? ''),
                    'action_type' => $action['action_type'], 'old_value' => $action['old_value'], 'new_value' => $action['new_value'],
                ],
                'requires_explicit_confirmation' => true,
                'confirmation_instruction' => 'Show this exact change to the user. Call execute_ad_change only after the user explicitly confirms it.',
            ], 'change proposal created; no advertising resource was modified');
        } catch (\InvalidArgumentException $e) {
            return $this->response(422, [], $e->getMessage());
        } catch (\Throwable $e) {
            return $this->response(500, [], 'unable to create change proposal: ' . $e->getMessage());
        }
    }

    public function execute(Request $request)
    {
        if ($error = $this->authorizeWrite($request)) return $error;
        $input = $this->jsonInput($request);
        $proposalId = (int)($input['proposal_id'] ?? 0);
        $token = (string)($input['confirmation_token'] ?? '');
        if (empty($input['confirm']) || !$proposalId || $token === '') {
            return $this->response(422, [], 'proposal_id, confirmation_token and confirm=true are required');
        }

        $proposal = Db::name('ad_ai_action_proposals')->where('id', $proposalId)->find();
        if (!$proposal || (int)$proposal['user_id'] !== $this->accessUserId($request)) return $this->response(404, [], 'proposal not found');
        if ($proposal['status'] === 'executed') return $this->response(0, $this->proposalResult($proposal), 'proposal was already executed');
        if ($proposal['status'] !== 'proposed') return $this->response(409, [], 'proposal is not executable');
        if (strtotime((string)$proposal['expires_at']) < time()) {
            Db::name('ad_ai_action_proposals')->where('id', $proposalId)->update(['status' => 'expired', 'updated_at' => date('Y-m-d H:i:s')]);
            $this->audit($request, $proposal, 'reject', [], [], $input, [], 'rejected', 'proposal expired');
            return $this->response(409, [], 'proposal expired; create a new proposal');
        }
        if (!hash_equals((string)$proposal['confirmation_token_hash'], hash('sha256', $token))) {
            $this->audit($request, $proposal, 'reject', [], [], $input, [], 'rejected', 'invalid confirmation token');
            return $this->response(403, [], 'invalid confirmation token');
        }

        $claimed = Db::name('ad_ai_action_proposals')->where('id', $proposalId)->where('status', 'proposed')->update([
            'status' => 'executing', 'updated_at' => date('Y-m-d H:i:s'),
        ]);
        if ($claimed !== 1) return $this->response(409, [], 'proposal is already being executed');

        try {
            $target = $this->resolveStoredTarget($request, $proposal);
            $before = $target['snapshot'];
            $expected = json_decode((string)$proposal['old_value'], true);
            $current = $this->currentValue($target, (string)$proposal['action_type']);
            if ($current !== $expected) throw new \RuntimeException('resource changed after proposal; create a new proposal');

            $newValue = json_decode((string)$proposal['new_value'], true);
            $platformResult = $target['platform'] === 'google'
                ? $this->executeGoogle($target, (string)$proposal['action_type'], $newValue)
                : $this->executeFacebook($target, (string)$proposal['action_type'], $newValue);
            $after = $this->reloadSnapshot($target);
            Db::name('ad_ai_action_proposals')->where('id', $proposalId)->update([
                'status' => 'executed', 'executed_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s'),
            ]);
            $this->audit($request, $proposal, 'execute', $before, $after, $input, $platformResult, 'success');
            return $this->response(0, [
                'proposal_id' => $proposalId, 'status' => 'executed', 'before' => $before, 'after' => $after,
                'platform_result' => $platformResult, 'audit_recorded' => true,
            ], 'advertising change executed and audited');
        } catch (\Throwable $e) {
            Db::name('ad_ai_action_proposals')->where('id', $proposalId)->update(['status' => 'failed', 'updated_at' => date('Y-m-d H:i:s')]);
            $this->audit($request, $proposal, 'execute', [], [], $input, [], 'failed', $e->getMessage());
            return $this->response(500, [], 'advertising change failed: ' . $e->getMessage());
        }
    }

    public function auditLogs(Request $request)
    {
        if ($error = $this->authorizeWrite($request)) return $error;
        $limit = min(100, max(1, (int)$request->param('limit', 30)));
        $query = Db::name('ad_ai_action_audit_logs')->where('user_id', $this->accessUserId($request));
        foreach (['platform', 'resource_type', 'status'] as $field) {
            $value = trim((string)$request->param($field, ''));
            if ($value !== '') $query->where($field, $value);
        }
        $items = $query->order('id', 'desc')->limit($limit)->select()->toArray();
        foreach ($items as &$item) {
            foreach (['before_json', 'after_json', 'request_json', 'response_json'] as $field) {
                $item[$field] = json_decode((string)($item[$field] ?? ''), true);
            }
        }
        unset($item);
        return $this->response(0, ['items' => $items, 'total' => count($items)], 'success');
    }

    private function authorizeWrite(Request $request)
    {
        $scopes = (array)($request->oauthScopes ?? []);
        if (!in_array(self::WRITE_SCOPE, $scopes, true)) return $this->response(403, [], 'OAuth scope ad_management:write is required');
        $uid = $this->accessUserId($request);
        if (!$uid) return $this->response(401, [], 'authenticated user is required');
        if ($this->isCustomerAdmin($request)) return null;
        $hasPermission = Db::name('sys_user_role')->alias('ur')
            ->join('sys_role_permission rp', 'rp.role_id=ur.role_id')
            ->where('ur.user_id', $uid)->where('rp.permission_code', 'deliver.ad.write')->count() > 0;
        return $hasPermission ? null : $this->response(403, [], 'role permission deliver.ad.write is required');
    }

    private function resolveTarget(Request $request, array $input): array
    {
        $platform = strtolower(trim((string)($input['platform'] ?? '')));
        $type = strtolower(trim((string)($input['resource_type'] ?? 'campaign')));
        $id = (int)($input['resource_id'] ?? 0);
        if (!in_array($platform, ['google', 'facebook'], true) || !$id) throw new \InvalidArgumentException('platform and positive resource_id are required');
        if ($platform === 'google' && $type !== 'campaign') throw new \InvalidArgumentException('Google write actions currently support campaign only');
        if ($platform === 'facebook' && !in_array($type, ['campaign', 'adset', 'ad'], true)) throw new \InvalidArgumentException('Facebook resource_type must be campaign, adset or ad');

        $table = $this->resourceTable($platform, $type);
        $resource = Db::name($table)->find($id);
        if (!$resource) throw new \InvalidArgumentException('advertising resource not found');
        $account = Db::name($platform === 'google' ? 'ad_gbi_accounts' : 'ad_fbbi_accounts')->find((int)$resource['account_id']);
        if (!$account) throw new \InvalidArgumentException('advertising account not found');
        $customerId = $this->targetCustomerId($platform, $account);
        if (!$customerId) throw new \InvalidArgumentException('advertising account is not bound to a customer delivery project');
        if (!$this->canAccessCustomer($request, $customerId)) throw new \InvalidArgumentException('customer access denied');
        return [
            'platform' => $platform, 'resource_type' => $type, 'table' => $table,
            'resource' => $resource, 'account' => $account, 'customer_id' => $customerId,
            'remote_id' => (string)($resource[$platform === 'google' ? 'campaign_id' : 'remote_id'] ?? ''),
            'snapshot' => $this->snapshot($resource),
        ];
    }

    private function resolveStoredTarget(Request $request, array $proposal): array
    {
        return $this->resolveTarget($request, [
            'platform' => $proposal['platform'], 'resource_type' => $proposal['resource_type'], 'resource_id' => $proposal['resource_id'],
        ]);
    }

    private function normalizeAction(array $target, array $input): array
    {
        $action = strtolower(trim((string)($input['action_type'] ?? '')));
        if (!in_array($action, ['set_daily_budget', 'set_status'], true)) throw new \InvalidArgumentException('action_type must be set_daily_budget or set_status');
        if ($action === 'set_daily_budget' && $target['resource_type'] === 'ad') throw new \InvalidArgumentException('daily budget is not available on an individual ad');
        if (!array_key_exists('new_value', $input)) throw new \InvalidArgumentException('new_value is required');
        $old = $this->currentValue($target, $action);
        if ($action === 'set_daily_budget') {
            $new = round((float)$input['new_value'], 2);
            if ($new < 1 || $new > 100000) throw new \InvalidArgumentException('daily budget must be between 1 and 100000');
        } else {
            $requested = strtoupper(trim((string)$input['new_value']));
            if (!in_array($requested, ['ENABLED', 'ACTIVE', 'PAUSED'], true)) throw new \InvalidArgumentException('status must be ENABLED, ACTIVE or PAUSED');
            $new = $target['platform'] === 'facebook' && $requested === 'ENABLED' ? 'ACTIVE' : ($target['platform'] === 'google' && $requested === 'ACTIVE' ? 'ENABLED' : $requested);
        }
        if ($old === $new) throw new \InvalidArgumentException('new value is identical to the current value');
        return ['action_type' => $action, 'old_value' => $old, 'new_value' => $new];
    }

    private function risk(string $action, $old, $new): array
    {
        if ($action === 'set_status') return ['level' => 'HIGH', 'blocked' => false, 'requires_confirmation' => true, 'message' => 'status changes can immediately affect delivery'];
        if (!is_numeric($old) || (float)$old <= 0) return ['level' => 'HIGH', 'blocked' => true, 'requires_confirmation' => true, 'message' => 'current budget is unknown or zero'];
        $percent = round(abs((float)$new - (float)$old) / (float)$old * 100, 2);
        if ($percent > 50) return ['level' => 'BLOCKED', 'blocked' => true, 'requires_confirmation' => true, 'change_percent' => $percent, 'message' => 'budget change exceeds the 50% safety limit'];
        return ['level' => $percent > 20 ? 'HIGH' : 'MEDIUM', 'blocked' => false, 'requires_confirmation' => true, 'change_percent' => $percent, 'message' => 'explicit confirmation is required'];
    }

    private function executeGoogle(array $target, string $action, $value): array
    {
        $input = $action === 'set_daily_budget' ? ['daily_budget' => $value] : ['status' => $value];
        return $this->google->updateCampaign($target['account'], $target['resource'], $input);
    }

    private function executeFacebook(array $target, string $action, $value): array
    {
        $tokenId = (int)($target['account']['access_token_id'] ?? 0);
        $accessToken = Db::name('ad_fb_accounts')->where('id', $tokenId)->where('status', 1)->value('access_token');
        $isDemo = strpos((string)$target['remote_id'], 'demo_') === 0;
        if (!$isDemo && !$accessToken) throw new \RuntimeException('Facebook access token is missing or expired');
        $field = $action === 'set_daily_budget' ? 'daily_budget' : 'status';
        $remoteValue = $field === 'daily_budget' ? (int)round((float)$value * 100) : $value;
        $response = ['simulated' => $isDemo];
        if (!$isDemo) $response = $this->facebookPost('/' . rawurlencode((string)$target['remote_id']), [$field => $remoteValue, 'access_token' => $accessToken]);
        Db::name($target['table'])->where('id', $target['resource']['id'])->update([$field => $value, 'updated_at' => date('Y-m-d H:i:s')]);
        return $response;
    }

    private function facebookPost(string $path, array $params): array
    {
        $curl = curl_init('https://graph.facebook.com/v25.0' . $path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($params), CURLOPT_TIMEOUT => 30]);
        $body = curl_exec($curl); $error = curl_error($curl); curl_close($curl);
        if ($body === false || $error) throw new \RuntimeException($error ?: 'Facebook request failed');
        $data = json_decode($body, true);
        if (!is_array($data) || isset($data['error'])) throw new \RuntimeException((string)($data['error']['message'] ?? 'Facebook API error'));
        return $data;
    }

    private function targetCustomerId(string $platform, array $account): int
    {
        $deliveryIds = [];

        // ad_gbi_accounts.did is maintained when an account is assigned in Deliver.
        // Older synchronized rows may not have it, so fall back to the legacy binding table.
        if ($platform === 'google') {
            $accountDeliveryId = (int)($account['did'] ?? 0);
            if ($accountDeliveryId > 0) $deliveryIds[] = $accountDeliveryId;
            if (!$deliveryIds) {
                $customerId = preg_replace('/\D+/', '', (string)($account['customer_id'] ?? ''));
                if ($customerId !== '') {
                    $deliveryIds = Db::name('ad_gg_ggz_user')
                        ->where('customer_id', $customerId)->where('did', '>', 0)->column('did');
                }
            }
        } else {
            $accountId = preg_replace('/^act_/', '', trim((string)($account['account_id'] ?? '')));
            if ($accountId !== '') {
                $deliveryIds = Db::name('ad_fb_account_user')
                    ->where(function ($query) use ($accountId) {
                        $query->where('account_id', $accountId)->whereOr('account_id', 'act_' . $accountId);
                    })
                    ->where('status', 1)->where('did', '>', 0)->column('did');
            }
        }

        $deliveryIds = array_values(array_unique(array_filter(array_map('intval', $deliveryIds))));
        if (count($deliveryIds) > 1) {
            throw new \RuntimeException('advertising account has multiple customer delivery bindings; resolve the binding before changing ads');
        }
        if (!$deliveryIds) return 0;

        return (int)Db::name('deliver')->where('id', $deliveryIds[0])->value('cid');
    }

    private function currentValue(array $target, string $action)
    {
        return $action === 'set_daily_budget' ? round((float)($target['resource']['daily_budget'] ?? 0), 2) : strtoupper((string)($target['resource']['status'] ?? ''));
    }

    private function reloadSnapshot(array $target): array
    {
        return $this->snapshot(Db::name($target['table'])->find((int)$target['resource']['id']) ?: []);
    }

    private function snapshot(array $resource): array
    {
        return [
            'id' => (int)($resource['id'] ?? 0), 'name' => (string)($resource['name'] ?? ''),
            'status' => (string)($resource['status'] ?? ''), 'daily_budget' => isset($resource['daily_budget']) ? (float)$resource['daily_budget'] : null,
            'updated_at' => $resource['updated_at'] ?? ($resource['last_synced_at'] ?? null),
        ];
    }

    private function resourceTable(string $platform, string $type): string
    {
        if ($platform === 'google') return 'ad_gbi_campaigns';
        return ['campaign' => 'ad_fbbi_campaigns', 'adset' => 'ad_fbbi_adsets', 'ad' => 'ad_fbbi_ads'][$type];
    }

    private function audit(Request $request, array $proposal, string $phase, array $before, array $after, array $input, array $response, string $status, string $error = ''): void
    {
        $safeInput = $input;
        unset($safeInput['confirmation_token']);
        Db::name('ad_ai_action_audit_logs')->insert([
            'proposal_id' => (int)($proposal['id'] ?? 0), 'user_id' => $this->accessUserId($request),
            'platform' => (string)$proposal['platform'], 'customer_id' => (int)$proposal['customer_id'], 'account_id' => (int)$proposal['account_id'],
            'resource_type' => (string)$proposal['resource_type'], 'resource_id' => (int)$proposal['resource_id'], 'remote_id' => (string)$proposal['remote_id'],
            'action_type' => (string)$proposal['action_type'], 'phase' => $phase,
            'before_json' => json_encode($before, JSON_UNESCAPED_UNICODE), 'after_json' => json_encode($after, JSON_UNESCAPED_UNICODE),
            'request_json' => json_encode($safeInput, JSON_UNESCAPED_UNICODE), 'response_json' => json_encode($response, JSON_UNESCAPED_UNICODE),
            'status' => $status, 'error_message' => $error,
            'ip_address' => (string)$request->ip(), 'user_agent' => mb_substr((string)$request->header('user-agent', ''), 0, 500),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    private function proposalResult(array $proposal): array
    {
        return ['proposal_id' => (int)$proposal['id'], 'status' => $proposal['status'], 'executed_at' => $proposal['executed_at'], 'audit_recorded' => true];
    }

    private function randomToken(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private function jsonInput(Request $request): array
    {
        $decoded = json_decode((string)$request->getContent(), true);
        return is_array($decoded) ? $decoded : (array)$request->post();
    }

    private function response(int $code, $data, string $message)
    {
        return json(['code' => $code, 'data' => $data, 'msg' => $message], $code >= 100 ? $code : 200);
    }
}
