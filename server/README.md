# MCP server source

This directory contains the source for the public Xmanmobi MCP gateway. The gateway exposes 15 read-only analysis tools plus three guarded proposal, execution, and audit tools, and forwards authenticated requests to the hosted Xmanmobi API.

The business API, advertising-platform credentials, and customer database are not part of this repository. They remain server-side and are protected by Xmanmobi authorization rules.

## Run locally

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm test:smoke
pnpm test:http
```

Create `.env` from `.env.example` only when running the server manually. Never commit a real token.

The HTTP process accepts the caller's OAuth bearer token. Production deployments must leave `ADVANBI_API_TOKEN` empty so requests cannot inherit an administrator identity.
