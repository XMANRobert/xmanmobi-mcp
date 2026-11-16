<?php
namespace app\controller;

use app\model\User;
use Firebase\JWT\JWT;
use think\facade\Db;
use think\facade\Env;
use think\Request;

/** OAuth 2.1 authorization server for the Xmanmobi MCP connection. */
class AiOAuth
{
    private const READ_SCOPE = 'ad_diagnosis:read';
    private const WRITE_SCOPE = 'ad_management:write';
    private const CODE_TTL = 600;
    private const ACCESS_TTL = 3600;
    private const REFRESH_TTL = 2592000;

    public function protectedResource()
    {
        return json([
            'resource' => 'https://ai.xmanmobi.com/mcp',
            'authorization_servers' => ['https://bis.joinaws.xyz'],
            'bearer_methods_supported' => ['header'],
            'scopes_supported' => [self::READ_SCOPE, self::WRITE_SCOPE],
        ]);
    }

    public function metadata()
    {
        return json([
            'issuer' => 'https://bis.joinaws.xyz',
            'authorization_endpoint' => 'https://bis.joinaws.xyz/oauth/authorize',
            'token_endpoint' => 'https://bis.joinaws.xyz/oauth/token',
            'registration_endpoint' => 'https://bis.joinaws.xyz/oauth/register',
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'code_challenge_methods_supported' => ['S256'],
            'token_endpoint_auth_methods_supported' => ['none'],
            'scopes_supported' => [self::READ_SCOPE, self::WRITE_SCOPE],
        ]);
    }

    public function register(Request $request)
    {
        $input = $this->jsonInput($request);
        $redirectUris = array_values(array_unique(array_filter((array)($input['redirect_uris'] ?? []))));
        if (!$redirectUris || count($redirectUris) > 10) {
            return $this->oauthError('invalid_client_metadata', 'redirect_uris is required', 400);
        }
        foreach ($redirectUris as $uri) {
            if (!$this->validRedirectUri((string)$uri)) {
                return $this->oauthError('invalid_redirect_uri', 'Only HTTPS or loopback HTTP redirect URIs are allowed', 400);
            }
        }

        $clientId = 'mcp_' . $this->randomToken(24);
        Db::name('ad_ai_oauth_clients')->insert([
            'client_id' => $clientId,
            'client_name' => mb_substr(trim((string)($input['client_name'] ?? 'MCP Client')), 0, 120),
            'redirect_uris' => json_encode($redirectUris, JSON_UNESCAPED_SLASHES),
            'grant_types' => json_encode(['authorization_code', 'refresh_token']),
            'status' => 1,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        return json([
            'client_id' => $clientId,
            'client_name' => (string)($input['client_name'] ?? 'MCP Client'),
            'redirect_uris' => $redirectUris,
            'grant_types' => ['authorization_code', 'refresh_token'],
            'response_types' => ['code'],
            'token_endpoint_auth_method' => 'none',
        ], 201);
    }

    public function authorize(Request $request)
    {
        $params = $request->method() === 'POST' ? $request->post() : $request->get();
        $validation = $this->validateAuthorizationRequest($params);
        if (isset($validation['error'])) {
            return response($this->errorPage($validation['error']), 400, ['Content-Type' => 'text/html; charset=utf-8']);
        }
        $client = $validation['client'];

        if ($request->method() !== 'POST') {
            return response($this->authorizationPage($params, $client), 200, ['Content-Type' => 'text/html; charset=utf-8']);
        }

        if (($params['decision'] ?? '') !== 'allow') {
            return redirect($this->appendQuery((string)$params['redirect_uri'], [
                'error' => 'access_denied',
                'state' => (string)($params['state'] ?? ''),
            ]));
        }

        $username = trim((string)($params['username'] ?? ''));
        $password = (string)($params['password'] ?? '');
        $user = User::where('username', $username)->find();
        if (!$user || !password_verify($password, (string)$user->password)) {
            return response($this->authorizationPage($params, $client, '用户名或密码错误'), 401, ['Content-Type' => 'text/html; charset=utf-8']);
        }
        $requestedScopes = $validation['scopes'];
        if (in_array(self::WRITE_SCOPE, $requestedScopes, true) && !$this->userCanWriteAds((int)$user->id)) {
            return response($this->authorizationPage($params, $client, '当前账号没有 AI 修改广告权限'), 403, ['Content-Type' => 'text/html; charset=utf-8']);
        }
        $grantedScope = implode(' ', $requestedScopes);

        $plainCode = $this->randomToken(32);
        Db::name('ad_ai_oauth_codes')->insert([
            'code_hash' => hash('sha256', $plainCode),
            'client_id' => (string)$params['client_id'],
            'user_id' => (int)$user->id,
            'redirect_uri' => (string)$params['redirect_uri'],
            'scope' => $grantedScope,
            'code_challenge' => (string)$params['code_challenge'],
            'code_challenge_method' => 'S256',
            'expires_at' => date('Y-m-d H:i:s', time() + self::CODE_TTL),
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return redirect($this->appendQuery((string)$params['redirect_uri'], [
            'code' => $plainCode,
            'state' => (string)($params['state'] ?? ''),
        ]));
    }

    public function token(Request $request)
    {
        $grantType = (string)$request->post('grant_type', '');
        if ($grantType === 'authorization_code') return $this->exchangeCode($request);
        if ($grantType === 'refresh_token') return $this->refresh($request);
        return $this->oauthError('unsupported_grant_type', 'Supported grants: authorization_code, refresh_token', 400);
    }

    private function exchangeCode(Request $request)
    {
        $code = (string)$request->post('code', '');
        $clientId = (string)$request->post('client_id', '');
        $redirectUri = (string)$request->post('redirect_uri', '');
        $verifier = (string)$request->post('code_verifier', '');
        if ($code === '' || $clientId === '' || $redirectUri === '' || $verifier === '') {
            return $this->oauthError('invalid_request', 'code, client_id, redirect_uri and code_verifier are required', 400);
        }

        $row = Db::name('ad_ai_oauth_codes')->where('code_hash', hash('sha256', $code))->find();
        if (!$row || $row['used_at'] || strtotime((string)$row['expires_at']) < time()) {
            return $this->oauthError('invalid_grant', 'Authorization code is invalid or expired', 400);
        }
        if (!hash_equals((string)$row['client_id'], $clientId) || !hash_equals((string)$row['redirect_uri'], $redirectUri)) {
            return $this->oauthError('invalid_grant', 'Authorization code client or redirect URI mismatch', 400);
        }
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        if (!hash_equals((string)$row['code_challenge'], $challenge)) {
            return $this->oauthError('invalid_grant', 'PKCE verification failed', 400);
        }

        Db::name('ad_ai_oauth_codes')->where('id', $row['id'])->update(['used_at' => date('Y-m-d H:i:s')]);
        return $this->issueTokens((int)$row['user_id'], $clientId, (string)$row['scope']);
    }

    private function refresh(Request $request)
    {
        $plainToken = (string)$request->post('refresh_token', '');
        $clientId = (string)$request->post('client_id', '');
        $row = Db::name('ad_ai_oauth_refresh_tokens')->where('token_hash', hash('sha256', $plainToken))->find();
        if (!$row || $row['revoked_at'] || strtotime((string)$row['expires_at']) < time() || !hash_equals((string)$row['client_id'], $clientId)) {
            return $this->oauthError('invalid_grant', 'Refresh token is invalid or expired', 400);
        }
        Db::name('ad_ai_oauth_refresh_tokens')->where('id', $row['id'])->update(['revoked_at' => date('Y-m-d H:i:s')]);
        return $this->issueTokens((int)$row['user_id'], $clientId, (string)$row['scope']);
    }

    private function issueTokens(int $userId, string $clientId, string $scope)
    {
        $user = User::find($userId);
        if (!$user) return $this->oauthError('invalid_grant', 'User no longer exists', 400);
        $scopes = array_values(array_unique(array_filter(preg_split('/\s+/', trim($scope)))));
        if (!$this->userCanWriteAds($userId)) {
            $scopes = array_values(array_filter($scopes, function ($item) { return $item !== self::WRITE_SCOPE; }));
        }
        if (!in_array(self::READ_SCOPE, $scopes, true)) $scopes[] = self::READ_SCOPE;
        $scope = implode(' ', $scopes);
        $now = time();
        $payload = [
            'iss' => 'https://bis.joinaws.xyz',
            'aud' => 'https://ai.xmanmobi.com/mcp',
            'iat' => $now,
            'exp' => $now + self::ACCESS_TTL,
            'scope' => $scope,
            'client_id' => $clientId,
            'data' => ['id' => (int)$user->id, 'username' => (string)$user->username],
        ];
        $accessToken = JWT::encode($payload, Env::get('JWT_SECRET'), 'HS256');
        $refreshToken = $this->randomToken(48);
        Db::name('ad_ai_oauth_refresh_tokens')->insert([
            'token_hash' => hash('sha256', $refreshToken),
            'client_id' => $clientId,
            'user_id' => $userId,
            'scope' => $scope,
            'expires_at' => date('Y-m-d H:i:s', $now + self::REFRESH_TTL),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return json([
            'access_token' => $accessToken,
            'token_type' => 'Bearer',
            'expires_in' => self::ACCESS_TTL,
            'refresh_token' => $refreshToken,
            'scope' => $scope,
        ])->header(['Cache-Control' => 'no-store', 'Pragma' => 'no-cache']);
    }

    private function validateAuthorizationRequest(array $params): array
    {
        foreach (['client_id', 'redirect_uri', 'code_challenge'] as $field) {
            if (empty($params[$field])) return ['error' => $field . ' is required'];
        }
        if (($params['response_type'] ?? '') !== 'code') return ['error' => 'response_type must be code'];
        if (($params['code_challenge_method'] ?? '') !== 'S256') return ['error' => 'PKCE S256 is required'];
        $client = Db::name('ad_ai_oauth_clients')->where('client_id', (string)$params['client_id'])->where('status', 1)->find();
        if (!$client) return ['error' => 'Unknown OAuth client'];
        $redirectUris = json_decode((string)$client['redirect_uris'], true) ?: [];
        if (!in_array((string)$params['redirect_uri'], $redirectUris, true)) return ['error' => 'redirect_uri is not registered'];
        $scope = trim((string)($params['scope'] ?? self::READ_SCOPE));
        $requestedScopes = array_values(array_unique(array_filter(preg_split('/\s+/', $scope))));
        if (!$requestedScopes) $requestedScopes = [self::READ_SCOPE];
        $supported = [self::READ_SCOPE, self::WRITE_SCOPE];
        foreach ($requestedScopes as $requestedScope) {
            if (!in_array($requestedScope, $supported, true)) return ['error' => 'unsupported scope: ' . $requestedScope];
        }
        if (!in_array(self::READ_SCOPE, $requestedScopes, true)) $requestedScopes[] = self::READ_SCOPE;
        return ['client' => $client, 'scopes' => $requestedScopes];
    }

    private function authorizationPage(array $params, array $client, string $error = ''): string
    {
        $hidden = '';
        foreach (['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method'] as $name) {
            $hidden .= '<input type="hidden" name="' . $name . '" value="' . $this->e((string)($params[$name] ?? '')) . '">';
        }
        $errorHtml = $error ? '<div class="error">' . $this->e($error) . '</div>' : '';
        $clientName = $this->e((string)($client['client_name'] ?? 'AI Assistant'));
        $requested = preg_split('/\s+/', trim((string)($params['scope'] ?? self::READ_SCOPE)));
        $writeRequested = in_array(self::WRITE_SCOPE, $requested, true);
        $writeHtml = $writeRequested
            ? '<div class="scope write"><strong>修改权限</strong><br>允许在你明确确认后修改已授权广告的预算和启停状态。每次操作都会记录审计日志。</div>'
            : '<div class="scope">当前仅申请只读权限，不会修改广告。</div>';
        return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 Xmanmobi</title><style>body{margin:0;background:#f4f6f8;color:#17202a;font-family:Arial,"Microsoft YaHei",sans-serif}.box{width:min(460px,calc(100% - 32px));margin:8vh auto;background:#fff;border:1px solid #dfe3e8;border-radius:8px;padding:28px;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}p{color:#56616f;line-height:1.6}.scope{background:#f7f8fa;border-left:3px solid #1677ff;padding:12px;margin:12px 0;line-height:1.6}.scope.write{background:#fff7e6;border-color:#d97706;color:#7c2d12}label{display:block;font-size:14px;margin:14px 0 6px}input[type=text],input[type=password]{width:100%;height:40px;border:1px solid #c8ced6;border-radius:4px;padding:0 10px;box-sizing:border-box}.actions{display:flex;gap:10px;margin-top:22px}button{height:40px;border-radius:4px;border:1px solid #c8ced6;padding:0 18px;background:#fff;cursor:pointer}.primary{border-color:#1677ff;background:#1677ff;color:#fff;flex:1}.error{background:#fff1f0;color:#b42318;padding:10px;border-radius:4px;margin:12px 0}</style></head><body><main class="box"><h1>连接 Xmanmobi</h1><p><strong>' . $clientName . '</strong> 请求连接你的广告数据。</p><div class="scope"><strong>读取权限</strong><br>查看 Facebook 和 Google 广告表现、指标及诊断建议。</div>' . $writeHtml . $errorHtml . '<form method="post" action="/oauth/authorize">' . $hidden . '<label>Xmanmobi 用户名</label><input name="username" type="text" autocomplete="username" required><label>密码</label><input name="password" type="password" autocomplete="current-password" required><div class="actions"><button type="submit" name="decision" value="deny" formnovalidate>取消</button><button class="primary" type="submit" name="decision" value="allow">登录并允许</button></div></form></main></body></html>';
    }

    private function userCanWriteAds(int $userId): bool
    {
        $roles = Db::name('sys_user_role')->alias('ur')->join('sys_role r', 'r.id=ur.role_id')
            ->where('ur.user_id', $userId)->field('r.id,r.value,r.type,r.name')->select()->toArray();
        foreach ($roles as $role) {
            $value = strtolower((string)($role['value'] ?? ''));
            $type = strtolower((string)($role['type'] ?? ''));
            if (in_array($value, ['admin', 'super_admin', 'superadmin'], true) || in_array($type, ['admin', 'super_admin', 'superadmin'], true)) return true;
            if (Db::name('sys_role_permission')->where('role_id', $role['id'])->where('permission_code', 'deliver.ad.write')->count()) return true;
        }
        return false;
    }

    private function errorPage(string $message): string
    {
        return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>授权失败</title><body><h2>无法完成授权</h2><p>' . $this->e($message) . '</p></body></html>';
    }

    private function jsonInput(Request $request): array
    {
        $decoded = json_decode((string)$request->getContent(), true);
        return is_array($decoded) ? $decoded : $request->post();
    }

    private function validRedirectUri(string $uri): bool
    {
        $parts = parse_url($uri);
        if (!$parts || empty($parts['scheme']) || empty($parts['host']) || isset($parts['fragment'])) return false;
        if (strtolower($parts['scheme']) === 'https') return true;
        return strtolower($parts['scheme']) === 'http' && in_array(strtolower($parts['host']), ['127.0.0.1', 'localhost', '::1'], true);
    }

    private function appendQuery(string $uri, array $params): string
    {
        $params = array_filter($params, function ($value) { return $value !== ''; });
        return $uri . (strpos($uri, '?') === false ? '?' : '&') . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    private function randomToken(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private function oauthError(string $error, string $description, int $status)
    {
        return json(['error' => $error, 'error_description' => $description], $status)
            ->header(['Cache-Control' => 'no-store', 'Pragma' => 'no-cache']);
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
