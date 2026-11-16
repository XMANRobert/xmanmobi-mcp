# Architecture and trust boundaries

```text
Codex / MCP client
        |
        | OAuth 2.1 + PKCE
        v
Xmanmobi authorization server
        |
        | scoped bearer token
        v
Public MCP gateway (this repository)
        |
        | authenticated API request
        v
Private Xmanmobi BI API
        |
        +-- customer permission checks
        +-- Google Ads reporting store
        +-- Meta Ads reporting store
        +-- material and conversion data
```

## Public components

- Portable and Codex plugin manifests.
- MCP gateway source and smoke tests.
- OAuth 2.1 + PKCE reference implementation and schema.
- Advertising-analysis skills and methodology references.

## Private components

- Advertising platform credentials and refresh tokens.
- Customer records and report data.
- Production infrastructure and secrets.
- Internal BI API implementation.

Keeping the business API private does not make the MCP connection opaque: tool schemas, transport, OAuth contract, scopes, gateway behavior, and analysis methodology are reviewable here. Authorization is enforced again by the private API, not only by the AI client or MCP gateway.
