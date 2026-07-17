# Personal Use With a Public Repository

This repository is designed to be public, while personal runtime data stays local.

## Keep These Local

Do not commit these files:

- `mycontext-sync/.env`
- `mycontext-sync/mirror.config.json`
- `mycontext-mcp-worker/.dev.vars`
- `MEMORY.md`
- `**/MEMORY.md`
- `logs/`
- `node_modules/`
- `.wrangler/`

They are ignored by git. They can contain Notion page IDs, private page titles,
absolute local Markdown source paths, Notion API keys, TiDB credentials, OAuth
secrets, local logs, or generated memory summaries.

## Recommended Local Setup

Keep personal Notion seed pages in `.env`:

```env
MIRROR_CONFIG_JSON={"pages":[{"pageId":"your-private-page-id","title":"your-private-page-title"}]}
EDITOR_KNOWLEDGE_SOURCE_ROOT=/absolute/path/to/editor-knowledge-library
BUSINESS_KNOWLEDGE_SOURCE_ROOT=/absolute/path/to/business-knowledge-library
AUTHOR_STYLE_SOURCE_ROOT=/absolute/path/to/author-style-library
METASKILL_SOURCE_ROOT=/absolute/path/to/metaskill-library
```

`MIRROR_CONFIG_JSON` takes precedence over `mirror.config.json`. This lets you
keep the sync target and credentials together in the ignored `.env` file.

Existing local `mirror.config.json` files still work. If `MIRROR_CONFIG_JSON`
is absent, the CLI reads `mirror.config.json` as before.

`BUSINESS_KNOWLEDGE_SOURCE_ROOT` is used only with a fixed two-file allowlist.
The absolute value is never stored in TiDB or exposed by MCP; TiDB stores only
the public-safe relative source key.

`AUTHOR_STYLE_SOURCE_ROOT` is also local-only. The author-style sync reads only
the fixed title/body paths under `knowledge/`; TiDB stores relative source keys,
full Markdown revisions, and semantic sections, never the machine-local root.

`METASKILL_SOURCE_ROOT` follows the same rule: the sync reads one fixed relative
Markdown path and never stores or returns the machine-local root.

For the business corpus, use the dedicated migration and sync commands. They
only create/write `business_knowledge_documents` and
`business_knowledge_sections`; the sync path contains no `DELETE`, `TRUNCATE`,
`DROP`, or writes to the existing Notion/editor tables.

```bash
pnpm migrate-business-knowledge
pnpm pull-business-knowledge
pnpm doctor-business-knowledge
pnpm migrate-author-style
pnpm pull-author-style
pnpm doctor-author-style
pnpm migrate-metaskill
pnpm pull-metaskill
pnpm doctor-metaskill
```

## Production Secrets

Use platform secrets for deployed Worker values:

```bash
wrangler secret put TIDB_DATABASE_URL
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_ALLOWED_USER_ID
```

Local Worker development can use `mycontext-mcp-worker/.dev.vars`, which is
ignored by git.

## Before Pushing

Run:

```bash
./scripts/check-public-safety.sh
```

Then run the subproject checks:

```bash
cd mycontext-sync
pnpm run typecheck
pnpm test
pnpm audit --audit-level moderate

cd ../mycontext-mcp-worker
pnpm run typecheck
pnpm test
pnpm audit --audit-level moderate
```

The public safety check scans tracked and untracked non-ignored files for local
secret files, common token patterns, machine-local paths, environment IDs,
generated memory files, and known private-project identifiers.

## If Something Leaks

1. Rotate the affected secret first.
2. Remove the value from the repository.
3. Rewrite public history if the value was pushed.
4. Re-run `./scripts/check-public-safety.sh`.
