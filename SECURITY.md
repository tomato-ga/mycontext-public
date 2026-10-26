# Security Policy

This repository publishes reusable implementation and synthetic examples. Do not commit real credentials, personal context, synced Markdown, local environment files, database exports, backups, generated memory, operational logs, machine-local paths, or deployment identifiers.

## Configuration and secrets

Keep development values in ignored files:

- `mycontext-sync/.env`
- `mycontext-sync/mirror.config.json`, if used instead of `MIRROR_CONFIG_JSON`
- `mycontext-mcp-worker/.dev.vars`
- `mycontext-sync-worker/.dev.vars`

Commit only example configuration with empty values or explicit placeholders. Use platform secrets for deployed Workers. Configure your own Worker origin, KV namespaces, Notion page IDs and data source, Queue bindings, OAuth application, and database credentials.

Run the repository publication check before pushing:

```bash
./scripts/check-public-safety.sh
```

The scan reports filenames instead of printing matched values. Its patterns are a publication safeguard; review new corpora, fixtures, documentation, and generated files before including them.

## Runtime boundaries

The MCP Worker exposes a public `GET /healthz` liveness endpoint and an authenticated `/mcp` endpoint. MCP access requires the `context:read` scope. GitHub OAuth is restricted to the configured immutable user ID, and authorization code flows use S256 PKCE.

Use a TiDB account with read-only grants for the MCP Worker. It provides no raw SQL, migrations, Notion writes, or local filesystem access.

The separate sync Worker owns Notion API access and TiDB writes. It verifies `X-Notion-Signature`, queues supported events, validates the latest document and management properties, and applies the validated snapshot in a transaction. Failed validation keeps the current snapshot available to the MCP Worker. Its Notion permission includes management-property updates; it does not write page bodies.

Create the synchronization state-log table before starting the sync Worker, even when synchronizing Author Style only. Grant the sync database account access only to the read-model tables it owns and the append-only state log. Author Style section replacement needs `DELETE` on `author_style_current_sections`; schema creation belongs to the CLI migration step. Use different credentials for synchronization and retrieval.

During initial webhook setup, the verification token is emitted once to Worker logs so the operator can configure it as a secret. Restrict access to those logs and keep them outside the repository.

## Deployment controls

Configure authentication and MCP rate limits at your Cloudflare edge for the endpoints enabled by the OAuth provider, including `/oauth/*`, `/authorize`, `/token`, `/register`, and `/mcp`. The sample does not contain account-specific WAF rules.

The checked-in deployment configuration uses placeholders. A successful local dry-run verifies the build, not live credentials, database permissions, authentication, webhook delivery, or edge policies.

## Reporting an exposure

If a secret is exposed, revoke or rotate it first. Report the affected component with a redacted description; do not include the secret or private document body in an issue. Remove leaked content and, when necessary, coordinate a history cleanup before republishing.
