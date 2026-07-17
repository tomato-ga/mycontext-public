# Security Review

Date: 2026-07-17

## Executive Summary

This sanitized sample repository is ready to remain private until its owner
chooses to make it public. The repository contains no real credentials,
machine-local source roots, personal author IDs, Worker hostname, or Cloudflare
KV namespace IDs. The committed runtime configuration uses explicit
placeholders, and the public-safety script scans both tracked and untracked
non-ignored files.

The Worker is a read-only MCP surface. `/healthz` is public and returns only
`ok`; `/mcp` is protected by OAuth 2.1, S256 PKCE, the `context:read` scope, and
an allowlisted immutable GitHub user ID. SQL input is parameterized, selector
values are allowlisted, and tools are declared read-only and non-destructive.

This review covers repository publication, not a live production deployment.
Before deploying, the operator must supply their own secrets, origin, KV IDs,
database permissions, and Cloudflare edge rate limits.

## Findings

### SEC-001: Private files and source content could be published accidentally

- Severity: High
- Location: `.gitignore`, `scripts/check-public-safety.sh`
- Evidence: local `.env`, `.dev.vars`, `mirror.config.json`, databases, logs,
  generated memory files, dependency folders, and build output are ignored.
  The safety script enumerates tracked plus untracked non-ignored files and
  reports filenames only when it detects a likely secret or private identifier.
- Fix: keep only example configuration in git and run the safety check in CI.
- Status: Fixed and verified with a deliberately untracked path-leak probe.

### SEC-002: Deployment identifiers were tied to one private environment

- Severity: High
- Location: `mycontext-mcp-worker/src/constants.ts`,
  `mycontext-mcp-worker/wrangler.jsonc`
- Evidence: the Worker origin uses the reserved documentation hostname
  `mycontext-mcp.example.workers.dev`; both KV namespace IDs use explicit
  `REPLACE_WITH_*` placeholders. The sample cron is generic.
- Fix: require each operator to create their own OAuth/Auth KV namespaces and
  replace the example origin before deployment.
- Status: Fixed for publication.

### SEC-003: Runtime data access must remain read-only and authenticated

- Severity: High
- Location: `mycontext-mcp-worker/src/index.ts`, `src/tidb.ts`, `src/tools/`
- Evidence: `/mcp` is routed through the OAuth provider, all MCP tools require
  `context:read`, all tool annotations declare read-only/non-destructive
  behavior, and the Worker SQL contains SELECT-only retrieval paths. Baseline
  security headers wrap Worker responses.
- Fix: retain a database user with SELECT-only grants for every context table.
- Status: Fixed by design and covered by tests.

### SEC-004: Specialized corpora could leak into broad search paths

- Severity: High
- Location: dedicated `business_knowledge_*`, `author_style_*`, and
  `metaskill_*` schemas, parsers, resources, and tools
- Evidence: business, author-style, and metaskill data use fixed relative
  source allowlists and dedicated tables. Author-style and metaskill revisions
  activate transactionally and use dedicated retrieval tools; machine-local
  source roots are never stored.
- Fix: preserve separate retrieval paths, active-revision joins, and semantic
  delivery sections rather than exposing arbitrary filesystem or SQL access.
- Status: Fixed by design and covered by tests.

### SEC-005: User-controlled selectors and limits require validation

- Severity: Medium
- Location: Worker tool schemas and `mycontext-mcp-worker/src/tidb.ts`
- Evidence: structured tool inputs are schema-validated, selector values are
  allowlisted, search terms use query parameters, and numeric limits pass
  through `validateTopK` before SQL interpolation.
- Fix: continue rejecting unknown selector values and invalid limits before DB
  access; do not add a raw SQL tool.
- Status: Fixed and covered by tests.

### SEC-006: Abuse controls depend on the deployment edge

- Severity: Medium
- Location: deployment configuration outside this repository
- Evidence: the sample intentionally does not contain account-specific
  Cloudflare WAF or rate-limiting rules.
- Fix: before Internet deployment, configure rate limits for `/oauth/*`,
  `/authorize`, `/token`, `/register`, and `/mcp`, and monitor authentication
  failures without logging tokens or private context.
- Status: Required before production deployment; not a repository-publication
  blocker.

### SEC-007: CI should use least privilege and reject vulnerable dependencies

- Severity: Low
- Location: `.github/workflows/ci.yml`
- Evidence: workflow permissions are restricted to `contents: read`; both
  subprojects run frozen installs, typecheck, tests, moderate-level dependency
  audits, and the repository safety check.
- Status: Fixed.

## Verification Results

Executed on 2026-07-17:

```bash
./scripts/check-public-safety.sh

cd mycontext-sync
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm audit --audit-level moderate

cd ../mycontext-mcp-worker
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm audit --audit-level moderate
```

Results:

- Public-safety check: passed; an untracked path-leak probe was rejected.
- `mycontext-sync`: typecheck passed; 16 test files / 34 tests passed; no known
  moderate-or-higher dependency vulnerabilities.
- `mycontext-mcp-worker`: typecheck passed; 12 test files / 46 tests passed;
  two live smoke files (two tests) were skipped because they require a private
  `TIDB_DATABASE_URL`; no known moderate-or-higher dependency vulnerabilities.
- No live deployment, private database, or real OAuth flow was used during this
  publication review.
