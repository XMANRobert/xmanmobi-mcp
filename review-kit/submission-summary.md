# Xmanmobi MCP review submission summary

## Production service and OAuth

- MCP endpoint: `https://ai.xmanmobi.com/mcp`
- Transport: Streamable HTTP
- Authorization: OAuth 2.1 authorization code flow with PKCE
- Public gateway source: `server/src/`
- OAuth reference backend and schema: `oauth-reference/`
- Guarded write backend reference and audit schema: `backend-reference/`
- Trust boundaries and private components: `docs/architecture.md`

Secrets, advertising-platform refresh tokens, customer data, and production infrastructure configuration are intentionally excluded from the public repository.

## Professional methodology

- `ad-performance-diagnosis`: KPI decomposition, evidence gates, prioritization, and optimization SOP.
- `ad-creative-analysis`: creative evidence, fatigue, metadata, and controlled testing.
- `ad-data-quality-audit`: binding, freshness, completeness, consistency, and attribution checks.
- `ad-change-management`: proposal, separate confirmation, execution, stale-state protection, and audit.
- `google-ads-operations`: paused resource creation, replacement creative and landing page, keyword/targeting operations, automation controls, and rollback SOP.

## Implemented operations

- Guarded Google Campaign budget and status changes.
- Confirmed creation of paused Google Search Campaigns.
- Confirmed creation of paused Ad Groups, responsive search ads, and keywords.
- Confirmed location, language, and device targeting.
- Replacement-ad workflow for creative text and landing-page changes.
- BI-managed automatic budget adjustment, low-efficiency Campaign pause, audited rollback, daily limits, cooldown, report-freshness protection, notifications, and a global emergency stop.

New resources are never automatically enabled. Deletion, billing changes, and unrestricted model-controlled automation are not supported.

## Reviewer evidence

- Dedicated reviewer-account requirements: `docs/review-readiness.md`.
- Simulated-data contract: `review-kit/simulated-data-spec.json`.
- Continuous recording script: `review-kit/recording-script.md`.
- Test report template: `review-kit/test-report-template.md`.
- Local MCP registration smoke test: 23 tools passed.
- HTTP authentication and MCP initialization smoke test: passed.

The reviewer username/password and recording URL must be supplied privately in the review form. They must not be committed to this repository.
