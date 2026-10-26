# Publication Security Review

Updated: 2026-10-26

This document describes the public sample's publication boundaries. It does not certify a live deployment or access to private Notion / TiDB data.

## Published contents

The public repository contains reusable code, schemas, example configuration, and synthetic fixtures. It excludes real environment files, credentials, private document bodies, machine-local paths, production origin / namespace identifiers, exports, operational incident logs, and generated memory.

Author Style uses `example-author`, `example-title-style`, `example-body-style`, and the `example-title/` / `example-body/` key prefixes. Sample Markdown is authored for this repository; it is not a redacted copy of a private style guide.

The source repository's Git history is not merged into the public history. Publication changes are applied as sanitized files to this repository.

## Implementation boundaries

| Area | Boundary to preserve |
| --- | --- |
| Public file selection | `.gitignore` and `scripts/check-public-safety.sh` cover local data and scan tracked plus untracked non-ignored files. Inspect new fixture and document contents as well. |
| MCP retrieval | OAuth, S256 PKCE, `context:read`, and the configured immutable GitHub user ID protect access. The database credential must have read-only grants. |
| Notion synchronization | A separate Worker verifies signed webhooks, queues work, validates document ownership and content, and updates workflow properties rather than page bodies. |
| Snapshot replacement | Author Style documents and current sections change in the same transaction. Validation failure keeps the previous snapshot. |
| SQL and selectors | Parameters, supported document IDs, selector validation, and bounded limits restrict query inputs. No raw SQL tool is exposed. |
| State log | Sync metadata belongs in an append-only operational table. Private runtime logs and exported snapshots stay outside Git. |
| Deployment | Origin, KV IDs, page IDs, Queue bindings, secrets, DB grants, and edge rate limits must be supplied for each deployment. |

Author Style uses `author_style_documents` and `author_style_current_sections`. It no longer uses the public sample's old Author Style revision / active-revision storage path. Metaskill keeps its own revision model.

The sync Worker always writes `context_sync_state_log`, including Author Style-only synchronization. Bootstrap that table alongside the Author Style tables. General search, document retrieval, and Resource listing also require the other context schemas, even if their tables are empty. The optional `skill_context_documents` table is not provisioned by a bundled migration or import command; operators enabling analysis-skill retrieval must provide it separately. Author Style-specific retrieval does not depend on it.

## Verification scope

Local checks should cover the public-safety scan, frozen dependency installation, typecheck and tests for all three subprojects, and Worker deployment dry-runs. The synthetic tests can verify parsing, routing, over-limit errors, authentication boundaries, and synchronization behavior without connecting to private data.

These checks do not verify live OAuth, real secrets, Notion integration permissions, webhook delivery, TiDB grants, or Cloudflare rate limits. A dry-run confirms that the Worker builds; it does not deploy it.

### Verification record for this update

The following checks were completed for the sanitized publication update. They use synthetic data and do not connect to private services.

- Existing public history: both existing commits / 140 unique blobs were scanned during this update; no known secret, private identifier, prohibited runtime file, or private commit identity was detected.
- Publication safety: tracked, untracked, and staged contents are scanned, including dependency metadata. The safety scanner has 27 isolated regression cases.
- CLI: pnpm 11.7.0 frozen installation, typecheck, and 81 tests passed.
- MCP Worker: frozen strict-peer installation, typecheck, 191 tests, and Wrangler deployment dry-run passed.
- Sync Worker: frozen installation, typecheck, 68 tests, and Wrangler deployment dry-run passed.
- Cross-component contract: synthetic Markdown was parsed into stored-row shapes and read through the MCP reader for all 368 selector combinations. Complete sections and identical routing were verified; oversized packs and missing sections were rejected. The long explanatory body example returned 13 sections.
- Dependency audits: all three projects reported no known vulnerabilities after patched dependency updates. The scoped Undici overrides in the Worker workspaces replace Miniflare's pinned vulnerable patch with a compatible fix.
- Documentation: relative links resolve, and initialization distinguishes Author Style synchronization from the full MCP schema requirements.
- Live deployment or private data operations: outside the publication update scope.
