# Implemented write-action security design

Version 1.3 implements narrow budget and delivery-status changes plus confirmed creation of paused Google Search resources. Changes remain behind separate OAuth scope, role permission, explicit confirmation, stale-state checks, idempotent execution, and audit logging.

## Required separation

- Keep `ad_diagnosis:read` for reporting and analysis.
- Add a separate `ad_management:write` OAuth scope.
- Do not grant the write scope during the normal read-only connection.
- Require role and customer checks in the business API for every operation.
- Never accept an ad account, customer, or campaign solely because the model supplied its ID.

## Safe workflow

1. Read current remote state and report freshness.
2. Create a proposed action containing the resource, old value, new value, reason, evidence, and idempotency key.
3. Validate account ownership, platform permissions, allowed range, and change percentage server-side.
4. Return a preview. Do not mutate anything yet.
5. Require explicit user confirmation for the exact action immediately before execution.
6. Re-read remote state and reject stale proposals.
7. Execute once using the idempotency key.
8. Store requester, approver, before/after values, platform response, timestamp, and rollback guidance.

## Implemented write-tool scope

The public MCP exposes three guarded change tools:

- `propose_ad_change`: creates a 15-minute proposal and one-time confirmation token without changing the platform.
- `execute_ad_change`: executes one explicitly confirmed proposal with `ad_management:write` and `deliver.ad.write`.
- `list_ad_change_audit`: returns the connected user's proposal and execution history.

Google supports campaign daily budget and enabled/paused status. Facebook supports campaign or ad-set daily budget and campaign/ad-set/ad active or paused status. Budget changes above 50% are blocked.

Five Google creation tools require `confirm=true` and create only paused resources: Search Campaign, Ad Group, responsive search ad, keyword, and Campaign targeting. Creative text, keyword text/match type, and landing-page changes use paused replacement resources instead of overwriting historical objects.

Do not expose unrestricted “auto optimize all campaigns” tools. Scheduled automation remains in the BI backend with administrator-configured CPA/ROAS targets, 20% action cap, daily limit, cooldown, report-freshness guard, global kill switch, audited queue, low-efficiency pause, and budget rollback.
