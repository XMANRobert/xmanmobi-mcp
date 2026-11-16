# Guarded advertising changes

`AiAdActions.php` is the ThinkPHP reference controller behind the three write/audit MCP tools. `ad-ai-action-audit.sql` creates the proposal and audit tables.

The controller enforces:

- OAuth scope `ad_management:write`.
- Role permission `deliver.ad.write` (administrators bypass the role permission, not the OAuth scope).
- Assigned-customer ownership checks.
- Narrow resource and field allowlists.
- A 15-minute proposal and one-time confirmation token.
- A 50% budget-change safety limit.
- Stale-value rejection and atomic execution claiming.
- Before/after and outcome audit records without storing the confirmation token.

Deploy this only with the matching routes, JWT scope extraction, platform services, and database schema from the Xmanmobi backend. It is not a standalone server.
