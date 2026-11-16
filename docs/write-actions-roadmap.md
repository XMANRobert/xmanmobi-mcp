# Write-action security design

The public release is intentionally read-only. Budget changes, campaign status changes, and campaign creation should be introduced as a separate capability after the read-only plugin has stable review evidence.

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

## Initial write-tool scope

Start with two narrow tools:

- `propose_campaign_budget_change`: read-only proposal generation.
- `execute_campaign_budget_change`: write operation requiring `ad_management:write` and a valid proposal ID.

Add pause/resume only after budget updates have audit evidence. Campaign creation should be last because it requires substantially more validation: objective, billing account, conversion event, geography, audience, creative, destination URL, budget, schedule, and platform policy checks.

Do not expose unrestricted “auto optimize all campaigns” tools. Scheduled automation belongs in the BI backend with administrator-configured limits, kill switches, per-customer opt-in, and an audit queue.
