#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mycontext-public-safety.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT
test_count=0

new_case() {
  test_count=$((test_count + 1))
  case_dir="$TEST_DIR/$test_count"
  mkdir -p "$case_dir/scripts"
  cp "$ROOT_DIR/scripts/check-public-safety.sh" "$case_dir/scripts/"
  cp "$ROOT_DIR/.gitignore" "$case_dir/.gitignore"
  git -C "$case_dir" init --quiet
}

assert_passes() {
  local output
  if ! output="$(cd "$case_dir" && bash scripts/check-public-safety.sh 2>&1)"; then
    printf 'FAIL: %s\n%s\n' "$1" "$output" >&2
    exit 1
  fi
}

assert_rejects() {
  local output
  if output="$(cd "$case_dir" && bash scripts/check-public-safety.sh 2>&1)"; then
    printf 'FAIL: %s was accepted\n' "$1" >&2
    exit 1
  fi
  if [[ "$output" != *"Public safety check failed:"* || "$output" != *"$2"* ]]; then
    printf 'FAIL: %s failed for an unexpected reason\n%s\n' "$1" "$output" >&2
    exit 1
  fi
}

# Values are generated in an isolated repository so no token-like test data is published.
dummy_secret="$(printf 'A%.0s' {1..40})"
dummy_short_secret="$(printf 'B%.0s' {1..16})"
dummy_id="$(printf 'b%.0s' {1..32})"
dummy_upper_id="$(printf 'B%.0s' {1..32})"
dummy_upper_uuid="${dummy_upper_id:0:8}-${dummy_upper_id:8:4}-${dummy_upper_id:12:4}-${dummy_upper_id:16:4}-${dummy_upper_id:20:12}"

new_case
mkdir -p "$case_dir/mycontext-sync" "$case_dir/mycontext-sync-worker"
printf 'NOTION_API_KEY=<integration-secret>\n' > "$case_dir/mycontext-sync/.env.example"
printf 'NOTION_WEBHOOK_SECRET=<webhook-secret>\n' > "$case_dir/mycontext-sync-worker/.dev.vars.example"
for secret_name in NOTION_API_TOKEN NOTION_WEBHOOK_BOOTSTRAP_SECRET NOTION_WEBHOOK_VERIFICATION_TOKEN; do
  printf '%s=<example-secret>\n' "$secret_name" >> "$case_dir/mycontext-sync-worker/.dev.vars.example"
done
printf '{"pageId":"REPLACE_WITH_PAGE_ID","authorKey":"example-author"}\n' > "$case_dir/example.json"
printf 'NOTION_WEBHOOK_VERIFICATION_TOKEN: config.notionWebhookVerificationToken,\n' > "$case_dir/config-reference.ts"
printf 'GITHUB_ALLOWED_USER_ID=12345678\n' > "$case_dir/example-user.txt"
printf '%s\n' 'https://service.example.workers.dev' > "$case_dir/example-origin.txt"
assert_passes 'placeholder examples and generic author keys'

new_case
mkdir -p "$case_dir/mycontext-sync-worker" "$case_dir/private-exports" "$case_dir/backups"
printf '%s\n' "$dummy_secret" > "$case_dir/.env"
printf '%s\n' "$dummy_secret" > "$case_dir/mycontext-sync-worker/.dev.vars.preview"
printf '%s\n' "$dummy_secret" > "$case_dir/private-exports/snapshot.json"
printf '%s\n' "$dummy_secret" > "$case_dir/backups/recovery.sql"
assert_passes 'ignored local environments and recovery data'

new_case
printf '%s%s\n' 'ntn_' "$dummy_secret" > "$case_dir/untracked.txt"
assert_rejects 'untracked token' 'untracked.txt'

new_case
printf 'NOTION_WEBHOOK_SECRET=%s\n' "$dummy_secret" > "$case_dir/.env"
git -C "$case_dir" add --force .env
assert_rejects 'staged environment file despite ignore rules' '.env'

new_case
mkdir -p "$case_dir/mycontext-sync-worker"
printf 'value\n' > "$case_dir/mycontext-sync-worker/.dev.vars.production"
git -C "$case_dir" add --force mycontext-sync-worker/.dev.vars.production
assert_rejects 'staged environment variant' '.dev.vars.production'

new_case
mkdir -p "$case_dir/backups"
printf 'private data\n' > "$case_dir/backups/recovery.sql"
git -C "$case_dir" add --force backups/recovery.sql
assert_rejects 'staged recovery export' 'backups/recovery.sql'

new_case
printf '{"NOTION_WEBHOOK_SECRET":"%s"}\n' "$dummy_secret" > "$case_dir/config.json"
assert_rejects 'quoted webhook signing secret' 'config.json'

new_case
printf '{"GITHUB_CLIENT_SECRET":"%s"}\n' "$dummy_secret" > "$case_dir/config.json"
assert_rejects 'quoted OAuth secret' 'config.json'

for secret_name in NOTION_API_TOKEN NOTION_WEBHOOK_BOOTSTRAP_SECRET NOTION_WEBHOOK_VERIFICATION_TOKEN; do
  new_case
  printf '%s=%s\n' "$secret_name" "$dummy_short_secret" > "$case_dir/worker-settings.txt"
  assert_rejects "$secret_name without a token prefix" 'worker-settings.txt'

  new_case
  printf '{"%s":"%s"}\n' "$secret_name" "$dummy_secret" > "$case_dir/config.json"
  assert_rejects "quoted $secret_name" 'config.json'

  new_case
  printf '%s: '\''%s'\''\n' "$secret_name" "$dummy_secret" > "$case_dir/config.ts"
  assert_rejects "single-quoted $secret_name" 'config.ts'
done

new_case
printf '{"TIDB_DATABASE_URL":"%s%s:%s@%s"}\n' 'mysql://' 'reader' "$dummy_secret" 'database.example.invalid/example_context' > "$case_dir/config.json"
assert_rejects 'quoted database URL containing credentials' 'config.json'

new_case
printf 'accountId: '\''%s'\''\n' "$dummy_id" > "$case_dir/cloudflare.config.ts"
assert_rejects 'deployment ID in TypeScript config' 'cloudflare.config.ts'

new_case
printf 'AUTHOR_STYLE_TITLE_PAGE_ID: bindings.text("%s"),\n' "$dummy_id" > "$case_dir/cloudflare.config.ts"
assert_rejects 'Notion page ID in TypeScript config' 'cloudflare.config.ts'

new_case
printf 'NOTION_DATA_SOURCE_ID="%s"\n' "$dummy_id" > "$case_dir/worker-settings.txt"
assert_rejects 'Notion data source ID in worker settings' 'worker-settings.txt'

new_case
printf '%s%s\n' 'secret_' "$dummy_secret" > "$case_dir/legacy-token.txt"
assert_rejects 'legacy integration token' 'legacy-token.txt'

new_case
printf '%s%s\n' '/Users/' 'example/private-library' > "$case_dir/absolute-path.txt"
assert_rejects 'personal absolute path' 'absolute-path.txt'

new_case
ln -s "$TEST_DIR" "$case_dir/external-link"
assert_rejects 'external symlink' 'external-link'

new_case
printf '%s%s\n' 'ntn_' "$dummy_secret" > "$case_dir/staged.txt"
git -C "$case_dir" add staged.txt
printf 'clean working copy\n' > "$case_dir/staged.txt"
assert_rejects 'staged secret behind a cleaned working copy' 'staged.txt (index)'

new_case
ln -s "$TEST_DIR" "$case_dir/staged-link"
git -C "$case_dir" add staged-link
rm "$case_dir/staged-link"
printf 'clean working copy\n' > "$case_dir/staged-link"
assert_rejects 'staged symlink behind a regular working copy' 'staged-link (index)'

new_case
mkdir -p "$case_dir/mycontext-sync"
printf '%s%s\n' 'ntn_' "$dummy_secret" > "$case_dir/mycontext-sync/pnpm-lock.yaml"
assert_rejects 'token in dependency metadata' 'pnpm-lock.yaml'

new_case
printf '\n# %s%s\n' 'ntn_' "$dummy_secret" >> "$case_dir/scripts/check-public-safety.sh"
assert_rejects 'token in the safety checker itself' 'scripts/check-public-safety.sh'

new_case
printf '\n# %s%s\n' 'ntn_' "$dummy_secret" >> "$case_dir/scripts/check-public-safety.sh"
git -C "$case_dir" add scripts/check-public-safety.sh
cp "$ROOT_DIR/scripts/check-public-safety.sh" "$case_dir/scripts/check-public-safety.sh"
assert_rejects 'staged token in a cleaned safety checker' 'scripts/check-public-safety.sh (index)'

new_case
printf 'GITHUB_ALLOWED_USER_ID=%s\n' '98765432' > "$case_dir/user-id.txt"
git -C "$case_dir" add user-id.txt
printf 'GITHUB_ALLOWED_USER_ID=<numeric-github-user-id>\n' > "$case_dir/user-id.txt"
assert_rejects 'staged user ID behind a placeholder' 'user-id.txt (index)'

new_case
printf 'GITHUB_ALLOWED_USER_ID=%s; GITHUB_ALLOWED_USER_ID=%s\n' '12345678' '98765432' > "$case_dir/user-id.txt"
assert_rejects 'user ID sharing a line with an allowed example' 'user-id.txt'

for dummy_user_id in 912345678 123456789; do
  new_case
  printf 'GITHUB_ALLOWED_USER_ID=%s\n' "$dummy_user_id" > "$case_dir/user-id.txt"
  assert_rejects 'user ID containing the allowed example as a substring' 'user-id.txt'
done

new_case
printf 'accountId: "%s"\n' "$dummy_upper_id" > "$case_dir/config.ts"
assert_rejects 'uppercase deployment ID' 'config.ts'

new_case
printf 'NOTION_DATA_SOURCE_ID="%s"\n' "$dummy_upper_id" > "$case_dir/config.txt"
assert_rejects 'uppercase compact Notion ID' 'config.txt'

new_case
printf 'AUTHOR_STYLE_TITLE_PAGE_ID="%s"\n' "$dummy_upper_uuid" > "$case_dir/config.txt"
assert_rejects 'uppercase UUID Notion ID' 'config.txt'

new_case
printf '%s%s%s\n' 'https://service.' 'synthetic-tenant' '.workers.dev' > "$case_dir/origin.txt"
assert_rejects 'deployment Worker origin' 'origin.txt'

printf 'Public safety regression checks passed: %s cases.\n' "$test_count"
