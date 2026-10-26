#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

list_public_files() {
  git ls-files -z --cached --others --exclude-standard
}

is_scannable_text() {
  local file="$1"

  case "$file" in
    scripts/check-public-safety.sh)
      return 1
      ;;
  esac

  [[ -f "$file" ]] && LC_ALL=C grep -Iq . "$file"
}

scan_pattern() {
  local pattern="$1"
  local file

  while IFS= read -r -d '' file; do
    if is_scannable_text "$file" && LC_ALL=C grep -Eq "$pattern" "$file"; then
      printf '%s\n' "$file"
    fi
  done < <(list_public_files)

  # A cleaned working copy must not hide an older staged value.
  while IFS= read -r -d '' file; do
    case "$file" in
      scripts/check-public-safety.sh)
        continue
        ;;
    esac
    if git show ":$file" 2>/dev/null | LC_ALL=C grep -IE "$pattern" >/dev/null; then
      printf '%s (index)\n' "$file"
    fi
  done < <(git diff --name-only -z)
}

disallowed_files="$(
  while IFS= read -r -d '' entry; do
    case "$entry" in
      "120000 "*) printf '%s (index)\n' "${entry#*$'\t'}" ;;
    esac
  done < <(git ls-files --stage -z)

  while IFS= read -r -d '' file; do
    if [[ -L "$file" ]]; then
      printf '%s\n' "$file"
      continue
    fi
    case "$file" in
      MEMORY.md|*/MEMORY.md|WORK_LOG.md|*/WORK_LOG.md|.env|*/.env|.env.*|*/.env.*|.dev.vars|*/.dev.vars|.dev.vars.*|*/.dev.vars.*|mirror.config.json|*/mirror.config.json|*.log|logs/*|*/logs/*|private-exports/*|*/private-exports/*|exports/*|*/exports/*|backups/*|*/backups/*|.ai/*|*/.ai/*|.project-memory/*|*/.project-memory/*|.longtermMemory/*|*/.longtermMemory/*|*.db|*.sqlite|*.sqlite3|*.dump|*.sql.gz|*.pem|*.key|*.p12|*.pfx)
        case "$file" in
          .env.example|*/.env.example|.dev.vars.example|*/.dev.vars.example)
            ;;
          *)
            printf '%s\n' "$file"
            ;;
        esac
        ;;
    esac
  done < <(list_public_files)
)"

if [[ -n "$disallowed_files" ]]; then
  echo "Public safety check failed: local/private files found." >&2
  printf '%s\n' "$disallowed_files" >&2
  exit 1
fi

# Object properties require a quoted value; env assignments may be unquoted.
# This keeps references such as `KEY: config.key` distinct from secret literals.
secret_16_keys='GITHUB_CLIENT_SECRET|TIDB_PASSWORD|NOTION_API_KEY|NOTION_API_TOKEN|NOTION_WEBHOOK_BOOTSTRAP_SECRET|NOTION_WEBHOOK_VERIFICATION_TOKEN'
secret_32_keys='NOTION_TOKEN|NOTION_WEBHOOK_SECRET|MCP_BEARER_TOKEN|MCP_AUTH_TOKEN|CLOUDFLARE_API_TOKEN'
secret_16_assignment="($secret_16_keys)[\"']?[[:space:]]*(=[[:space:]]*[\"']?|:[[:space:]]*[\"'])[A-Za-z0-9_./+-]{16,}"
secret_32_assignment="($secret_32_keys)[\"']?[[:space:]]*(=[[:space:]]*[\"']?|:[[:space:]]*[\"'])[A-Za-z0-9_./+-]{32,}"
secret_hits="$(scan_pattern "(ntn_[A-Za-z0-9]{16,}|gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|secret_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|mysql://[^<[:space:]]+:[^<[:space:]]+@|$secret_16_assignment|$secret_32_assignment|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{16,}|BEGIN ([A-Z ]+ )?PRIVATE KEY)" || true)"

if [[ -n "$secret_hits" ]]; then
  echo "Public safety check failed: possible secret values found." >&2
  printf '%s\n' "$secret_hits" >&2
  exit 1
fi

private_identifier_hits="$(scan_pattern '(/Users/[A-Za-z0-9._-]+|/Volumes/[A-Za-z0-9._ -]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+|[A-Za-z0-9._%+-]+@(gmail|icloud|me|outlook|yahoo)\.[A-Za-z]{2,}|servicedake\.workers\.dev|noteAI|(^|[^A-Za-z0-9_])ore-(title|body)([^A-Za-z0-9_]|$)|authorKey["'"'"']?[[:space:]]*[=:][[:space:]]*["'"'"']ore["'"'"'])' || true)"

if [[ -n "$private_identifier_hits" ]]; then
  echo "Public safety check failed: possible personal or local identifiers found." >&2
  printf '%s\n' "$private_identifier_hits" >&2
  exit 1
fi

environment_id_hits="$(scan_pattern '["'"'"']?(id|account_id|accountId|namespace_id|namespaceId)["'"'"']?[[:space:]]*[=:][[:space:]]*["'"'"'][a-f0-9]{32}["'"'"']' || true)"

notion_id_hits="$(
  scan_pattern '(PAGE_ID|DATABASE_ID|DATA_SOURCE_ID|pageId|page_id|databaseId|database_id|dataSourceId|data_source_id)[^[:cntrl:]]{0,48}["'"'"']([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})["'"'"']' || true
)"

if [[ -n "$notion_id_hits" ]]; then
  echo "Public safety check failed: possible real Notion page or database IDs found." >&2
  printf '%s\n' "$notion_id_hits" >&2
  exit 1
fi

if [[ -n "$environment_id_hits" ]]; then
  echo "Public safety check failed: possible deployment namespace IDs found." >&2
  printf '%s\n' "$environment_id_hits" >&2
  exit 1
fi

github_user_id_hits="$(
  while IFS= read -r -d '' file; do
    if is_scannable_text "$file" &&
      LC_ALL=C grep -E 'GITHUB_ALLOWED_USER_ID[^0-9]*[0-9]{6,}' "$file" |
        LC_ALL=C grep -Ev '12345678' >/dev/null; then
      printf '%s\n' "$file"
    fi
  done < <(list_public_files)
)"

if [[ -n "$github_user_id_hits" ]]; then
  echo "Public safety check failed: possible real GitHub user IDs found." >&2
  printf '%s\n' "$github_user_id_hits" >&2
  exit 1
fi

for local_path in \
  "mycontext-sync/.env" \
  "mycontext-sync/mirror.config.json" \
  "mycontext-mcp-worker/.dev.vars" \
  "mycontext-sync-worker/.dev.vars" \
  "MEMORY.md" \
  "WORK_LOG.md"; do
  if [[ -e "$local_path" ]] && ! git check-ignore -q "$local_path"; then
    echo "Public safety check failed: $local_path exists but is not ignored." >&2
    exit 1
  fi
done

git diff --check
git diff --cached --check
echo "Public safety check passed."
