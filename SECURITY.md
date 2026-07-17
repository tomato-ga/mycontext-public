# Security Policy

This repository is intended to be safe to publish publicly. It must not contain real Notion API keys, TiDB credentials, MCP bearer tokens, local `.env` files, `.dev.vars`, generated memory files, logs, deployment IDs, machine-local paths, or synced private Markdown content.

## Secrets

Use local environment files for development and platform secrets for production:

- `mycontext-sync/.env`
- `mycontext-mcp-worker/.dev.vars`
- Wrangler secrets for deployed Workers

Only example files should be committed:

- `mycontext-sync/.env.example`
- `mycontext-sync/mirror.config.example.json`
- `mycontext-mcp-worker/.dev.vars.example`

For personal use, prefer `MIRROR_CONFIG_JSON` inside `mycontext-sync/.env`
for private Notion page IDs and titles. `mirror.config.json` remains supported
as an ignored local file.

Run this before pushing:

```bash
./scripts/check-public-safety.sh
```

If a real credential is accidentally committed or shared in logs, rotate it before relying on this project in production.

## Public Surface

The Remote MCP Worker exposes:

- `GET /healthz`: public liveness check with no sensitive data.
- `/mcp`: bearer-token protected Streamable HTTP MCP endpoint.

The Worker is read-only. It does not expose raw SQL, migrations, Notion API writes, or Obsidian file access.

Before exposing a deployment to the Internet, configure rate limiting for
`/oauth/*`, `/authorize`, `/token`, `/register`, and `/mcp` at the Cloudflare
edge. Keep production KV namespace IDs in deployment-specific configuration;
the committed `wrangler.jsonc` intentionally contains placeholders.

## Reporting

For private deployments, rotate affected credentials first, then open an issue with a redacted description of the problem and the affected component.
