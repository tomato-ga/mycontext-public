# mycontext-sync-worker

Notion の管理データソースで `Ready` にした文書を、TiDB の検証済みスナップショットへ同期する Cloudflare Worker です。読み取り専用の MCP Worker とは別にデプロイし、Notion と TiDB の書き込み権限を分離します。

```text
Notion Status = Ready
  -> signed webhook: POST /webhooks/notion
  -> Cloudflare Queue
  -> 文書・管理プロパティを2回取得して同一 fingerprint を確認
  -> 意味単位の parser / routing 検証
  -> TiDB transaction
  -> Notion Status = Synced / Error / Conflict
```

検証に失敗した文書は現在のスナップショットを置換しません。文書と現行セクションの更新は同じトランザクションで行います。処理途中の通信エラーは Queue で再試行し、再試行を使い切ると dead-letter Queue で Notion を `Error` にします。MCP Worker は保存済みの文書を読み続けられます。

## Notion の管理プロパティ

対象 data source に次の名前と型でプロパティを用意します。

| Property | Type | Values / purpose |
| --- | --- | --- |
| `Name` | Title | 人間向け文書名 |
| `Document ID` | Rich text | 文書ごとの固定 ID。重複禁止 |
| `Category` | Select | `Personal Context` / `AI Skill` / `Author Style` / `Business Knowledge` / `Editor Knowledge` / `Metaskill` |
| `Status` | Status | `Draft` / `Review` / `Ready` / `Syncing` / `Synced` / `Error` / `Conflict` / `Archived` |
| `Active` | Checkbox | 同期対象なら有効化 |
| `Schema Version` | Select | 下表の schema version |
| `Sync Source` | Select | 通常 `Notion`。Metaskill の管理用表示は `TiDB` |
| `TiDB Tables` | Multi-select | Worker が保存先を記録 |
| `Last Synced` | Date | Worker が同期日時を記録 |
| `Synced Hash` | Rich text | Worker が入力のハッシュを記録 |
| `Active Revision` | Rich text | Worker 管理。Author Style では空欄 |
| `Validation Error` | Rich text | Worker が検証エラーを記録 |
| `Original Page ID` | Rich text | ページ移行を明示する場合だけ使用 |

通常は `Draft` で編集し、確定後 `Ready` にします。Worker は `Syncing` を経て `Synced`、`Error`、`Conflict` を記録します。定期ポーリングはありません。

| Schema Version | 保存先 |
| --- | --- |
| `personal-context-v1`, `ai-skill-v1` | `notion_pages` |
| `author-style-v1` | `author_style_documents`, `author_style_current_sections` |
| `business-knowledge-v1` | `business_knowledge_documents`, `business_knowledge_sections` |
| `editor-knowledge-v1` | `editor_knowledge_documents`, 必要な文書では `editor_knowledge_sections` |
| `metaskill-v1` | TiDB の既存 snapshot を管理用に表示。Notion からの上書きは禁止 |

Author Style は `example-title-style` と `example-body-style` に対応します。同期元のページは `AUTHOR_STYLE_TITLE_PAGE_ID` / `AUTHOR_STYLE_BODY_PAGE_ID` で指定し、それ以外のページから同じ文書 ID へ書き込むことを拒否します。Notion が H1 をページタイトルに移した場合は `Name` から H1 を復元して parser に渡します。

Business Knowledge の Notion 同期は `example-business-guide` の合成サンプルです。H2 を意味の完結する配信単位、H3 を親の H2 へ展開する検索単位として扱います。実際の書籍・個人文書の本文や専用目次は含めていません。Editor Knowledge の公開 ID は `planning-playbook`、`editing-playbook`、`editing-playbook-v2`、`proofreading-playbook`、`planning-catalog`、`media-design-playbook`、`planning-fulltext-*` です。

## ローカル検証

先に共有 parser を持つ同期 CLI の依存関係をインストールします。テストは合成データとモックを使い、実 Notion / TiDB を更新しません。

```bash
cd mycontext-sync
pnpm install --frozen-lockfile
cd ../mycontext-sync-worker
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run deploy:dry-run
```

`GET /healthz` は外部サービスを呼ばない liveness endpoint です。同期状態のログ契約は [docs/SYNC_STATE_LOG.md](docs/SYNC_STATE_LOG.md) を参照してください。

## 自分の環境で使う

`wrangler.jsonc` の `REPLACE_WITH_*` を自分のページ ID に置き換え、[.dev.vars.example](.dev.vars.example) を参考にローカルの `.dev.vars` または Cloudflare の secrets を設定します。実値は Git に追加しません。

必要な secrets は `TIDB_DATABASE_URL`、`NOTION_API_TOKEN`、`NOTION_DATA_SOURCE_ID`、`NOTION_WEBHOOK_BOOTSTRAP_SECRET`、`NOTION_WEBHOOK_VERIFICATION_TOKEN` です。Notion integration には対象データソースの読み取りとページプロパティ更新だけを許可します。Worker は Notion の本文を変更しません。

TiDB の schema は `mycontext-sync` の migration コマンドで事前に作成します。Author Style だけを同期する場合も、文体用2テーブルと、実行ごとに追記する状態ログテーブルが必要です。

```bash
cd ../mycontext-sync
pnpm migrate-author-style
pnpm migrate-sync-state-log
cd ../mycontext-sync-worker
```

一般検索・他カテゴリ・resource 一覧も使う場合は、[同期 CLI の README](../mycontext-sync/README.md) に従って対象カテゴリの schema も作成します。Worker の writer には利用する read model の `SELECT` / `INSERT` / `UPDATE`、現行 section の入れ替えに必要な `DELETE`、`context_sync_state_log` への `INSERT` を付与します。DDL や他のテーブルへの権限は不要です。

次のコマンドは自分の Cloudflare 環境を変更します。必要な設定と権限を用意した後に実行してください。

```bash
pnpm exec wrangler queues create mycontext-sync
pnpm exec wrangler queues create mycontext-sync-dead-letter
pnpm exec wrangler secret put TIDB_DATABASE_URL
pnpm exec wrangler secret put NOTION_API_TOKEN
pnpm exec wrangler secret put NOTION_DATA_SOURCE_ID
pnpm exec wrangler secret put NOTION_WEBHOOK_BOOTSTRAP_SECRET
pnpm run deploy
```

Notion webhook の URL は `https://<sync-worker>/webhooks/notion?bootstrap=<bootstrap-secret>` です。最初の verification request は bootstrap secret を照合し、受け取った verification token を Worker log に一度だけ出します。それを `pnpm exec wrangler secret put NOTION_WEBHOOK_VERIFICATION_TOKEN` で保存して再デプロイすると、その後のイベントは `X-Notion-Signature` の HMAC-SHA256 検証を通ったものだけが Queue に入ります。ログには secrets が含まれる可能性があるため公開しません。

Author Style の緊急 export / 明示復旧と同期状態の確認は、同期 CLI の `export-author-style-markdown`、`restore-author-style-markdown`、`audit-sync-state` を使用します。export やログの実データはこの公開リポジトリには含めません。
