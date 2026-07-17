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
    scripts/check-public-safety.sh|*/pnpm-lock.yaml)
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
}

disallowed_files="$(
  while IFS= read -r -d '' file; do
    case "$file" in
      MEMORY.md|*/MEMORY.md|.env|*/.env|.env.*|*/.env.*|.dev.vars|*/.dev.vars|mirror.config.json|*/mirror.config.json|*.log|*/logs/*|*.db|*.sqlite|*.sqlite3|*.pem|*.key|*.p12|*.pfx)
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

secret_hits="$(scan_pattern '(ntn_[A-Za-z0-9]{16,}|gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|mysql://[^<[:space:]]+:[^<[:space:]]+@|GITHUB_CLIENT_SECRET[=:][[:space:]]*[A-Za-z0-9_./+-]{16,}|TIDB_PASSWORD[=:][[:space:]]*[A-Za-z0-9_./+-]{16,}|NOTION_API_KEY[=:][[:space:]]*[A-Za-z0-9_./+-]{16,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{16,}|BEGIN ([A-Z ]+ )?PRIVATE KEY)' || true)"

if [[ -n "$secret_hits" ]]; then
  echo "Public safety check failed: possible secret values found." >&2
  printf '%s\n' "$secret_hits" >&2
  exit 1
fi

private_identifier_hits="$(scan_pattern '(/Users/[A-Za-z0-9._-]+|/Volumes/[A-Za-z0-9._ -]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+|[A-Za-z0-9._%+-]+@(gmail|icloud|me|outlook|yahoo)\.[A-Za-z]{2,}|servicedake\.workers\.dev|noteAI|(^|[^A-Za-z0-9_])ore-(title|body)([^A-Za-z0-9_]|$)|authorKey["'"'"']?[[:space:]]*:[[:space:]]*["'"'"']ore["'"'"'])' || true)"

if [[ -n "$private_identifier_hits" ]]; then
  echo "Public safety check failed: possible personal or local identifiers found." >&2
  printf '%s\n' "$private_identifier_hits" >&2
  exit 1
fi

environment_id_hits="$(scan_pattern '"id"[[:space:]]*:[[:space:]]*"[a-f0-9]{32}"' || true)"

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
  "MEMORY.md"; do
  if [[ -e "$local_path" ]] && ! git check-ignore -q "$local_path"; then
    echo "Public safety check failed: $local_path exists but is not ignored." >&2
    exit 1
  fi
done

git diff --check
echo "Public safety check passed."
