# Implemented write-action security design

Version 1.2 implements narrow budget and delivery-status changes behind a separate OAuth scope, role permission, proposal, explicit confirmation, stale-state check, idempotent execution claim, and audit log. Campaign creation remains out of scope.

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

The public MCP exposes three narrow tools:

- `propose_ad_change`: creates a 15-minute proposal and one-time confirmation token without changing the platform.
- `execute_ad_change`: executes one explicitly confirmed proposal with `ad_management:write` and `deliver.ad.write`.
- `list_ad_change_audit`: returns the connected user's proposal and execution history.

Google supports campaign daily budget and enabled/paused status. Facebook supports campaign or ad-set daily budget and campaign/ad-set/ad active or paused status. Budget changes above 50% are blocked. Campaign creation should be last because it requires substantially more validation: objective, billing account, conversion event, geography, audience, creative, destination URL, budget, schedule, and platform policy checks.

Do not expose unrestricted “auto optimize all campaigns” tools. Scheduled automation belongs in the BI backend with administrator-configured limits, kill switches, per-customer opt-in, and an audit queue.
