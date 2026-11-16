# OAuth reference implementation

This directory documents the OAuth 2.1 + PKCE implementation used by the Xmanmobi MCP connection. It is published for review and interoperability, not as a drop-in authentication product.

The reference provides:

- Authorization-code flow with PKCE S256.
- Dynamic client registration for HTTPS and loopback redirect URIs.
- Short-lived access tokens and rotating refresh tokens.
- SHA-256 storage for authorization codes and refresh tokens.
- Protected-resource and authorization-server metadata.
- The read-only `ad_diagnosis:read` scope.

Before adapting it, add your framework's rate limiting, CSRF controls, login lockout, security monitoring, key rotation, and account-session policies. Keep `JWT_SECRET` outside source control. Do not reuse the Xmanmobi issuer, audience, domains, or database tables in another deployment.

The hosted Xmanmobi OAuth service remains authoritative. This reference does not include production secrets or customer records.
