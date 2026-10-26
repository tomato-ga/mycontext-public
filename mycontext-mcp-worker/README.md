# mycontext-mcp-worker

TiDB に同期されたコンテキストを、Cloudflare Workers の読み取り専用 Remote MCP で配信します。データの書き込みは `../mycontext-sync-worker/` とローカル CLI が担当します。この公開版の文書 ID・Worker origin・KV 設定はサンプルです。個人の文書本文やデプロイ設定は含みません。

## 実装とプロトコル

- MCP stable `2026-07-28`。[`Streamable HTTP`](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) と [`Tools`](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) を参照。
- `@modelcontextprotocol/server` / `@modelcontextprotocol/client` `2.3.1`、`agents` `0.28.1`。旧クライアントの互換テストには SDK `1.32.1` を使用します。
- `/mcp` は OAuth bearer token で保護します。GitHub OAuth、PKCE S256、許可する GitHub user ID を利用します。
- 現行の `server/discover` と旧来の `initialize` を、stateless HTTP で扱います。ブラウザの Origin 構文と Host を検証し、認証済みリクエストに同じ読み取り専用ツールを提供します。
- `GET /healthz` は認証不要の生存確認です。DB の内容を返しません。

## Author Style

`get_author_style_context` は、文書・操作・用途・長さを指定すると、必要な意味セクションをまとめて返します。

```json
{
  "name": "get_author_style_context",
  "arguments": {
    "documentId": "example-body-style",
    "operation": "generate",
    "mode": "explanatory",
    "lengthBand": "2001plus"
  }
}
```

`author_style_documents` と `author_style_current_sections` の current snapshot を使用します。H3 で根拠を検索した場合も、配信は親の意味単位を返します。routing manifest の上限を超えた場合は、選んだセクションを切り捨てずエラーにします。`search_author_style_evidence` と `mycontext://author-style/...` resources は根拠・原文の確認用です。

## その他の取得ツール

- `search_personal_context` / `read_context`: 同期済み文書の検索・全文取得。
- `get_planning_playbook_context`, `get_editing_playbook_context`, `get_kosei_playbook_context`, `get_media_playbook_context`: 用途別プレイブックの一括取得。
- `get_metaskill_context` / `search_metaskill_evidence`: topic / intent / depth に応じた取得と根拠検索。
- `get_analysis_skill_context`: 保存済み分析スキルの取得。

これらは利用者が自分の文書を同期して初めて内容を返します。公開用サンプルに私的な教材・書籍本文・文体ガイドは含めていません。

## ローカル検証

```bash
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run typecheck
pnpm test
pnpm run deploy:dry-run
```

テストは合成データと mock を使います。実環境の env や TiDB には接続しません。

## データベースの準備

Author Style の専用取得は `author_style_documents` と `author_style_current_sections` を使います。一般検索・`read_context`・`resources/list` も使う場合は、`../mycontext-sync/` で必要な全テーブルを準備してください。

```bash
pnpm migrate
pnpm migrate-editor-knowledge
pnpm migrate-business-knowledge
pnpm migrate-author-style
pnpm migrate-metaskill
pnpm migrate-sync-state-log
```

これらの migration は空の構造を作ります。文書本文は利用者が自分で同期します。`skill_context_documents` の schema と取り込みはこのサンプルに含めていません。`get_analysis_skill_context`、分析スキルIDでの検索・`read_context` は、そのテーブルを別途準備した場合に利用できます。

## 自分の環境で使う

1. `src/constants.ts` のサンプル origin を自分の Worker URL に置き換える。GitHub OAuth callback はその origin の `/oauth/github/callback` とする。
2. `wrangler.jsonc` の KV namespace プレースホルダーを自分の namespace に置き換える。`OAUTH_KV` と `AUTH_KV` は分ける。
3. `.dev.vars.example` を参考にローカル `.dev.vars` または Cloudflare secrets を設定する。MCP 用 TiDB user は読み取り権限だけにする。
4. 必要なら `PERSONAL_SYNONYMS` に自分の検索別名を設定する。未設定なら別名展開なしで動作する。
5. デプロイ前に repository root の `scripts/check-public-safety.sh` と上記の検証を実行する。

`pnpm deploy` は `scripts/release.mjs` のガード付きリリースです。事前検証、公開 endpoint の transport 確認、失敗時の rollback を行います。既存の active version を前提とするため、初回の作成は自分の Cloudflare アカウントと設定を確認してから行ってください。公開 endpoint の検証は `pnpm run verify:public-mcp` で行えます。repository の更新やテストだけでは本番デプロイは行いません。

OAuth/DCR endpoint の rate limit は、公開運用する Cloudflare 側で設定してください。実際の secret、KV ID、個人の文書や検索別名は commit しないでください。
