# mycontext-public

Notion とローカル Markdown のコンテキストを TiDB に保存し、Cloudflare Workers の Remote MCP から AI クライアントへ配信する公開サンプルです。2026-10-26 時点の構成を反映しています。

[HF.M](https://hfm.tokyo/) の[技術記事「記事再現ガイドを TiDB と Cloudflare Workers のリモート MCP サーバーにしてみた」](https://hfm.tokyo/blog/author-style-context-mcp)で紹介した、文体ガイドの意味単位での保存、用途別の取得、Notion からの同期を実装しています。著者の文体ガイドや個人データは含めず、サンプルの著者 ID、本文、設定値を使用します。

## 全体像

```text
Notion documents (Status = Ready)
  -> mycontext-sync-worker: signed webhook + Queue
  -> validate Markdown and routing
  -> TiDB current snapshots / sections
  -> mycontext-mcp-worker: read-only MCP
  -> AI clients

Local Markdown / configured Notion pages
  -> mycontext-sync: CLI import and validation
  -> dedicated TiDB context tables

TiDB notion_pages
  -> mycontext-sync export-obsidian
  -> local Markdown export
```

読む Worker と書く Worker を分け、Notion API と TiDB の書き込み権限は同期側だけに持たせます。MCP Worker は同期済みのデータを読むだけです。対象は明示的に設定した文書に限定し、embedding は使用しません。

| Path | 役割 |
| --- | --- |
| [`mycontext-sync/`](mycontext-sync/README.md) | スキーマ作成、ローカル文書の取り込み、整合性検査、Markdown export / 緊急復旧を行う CLI。Author Style の parser と routing もここにあります。 |
| [`mycontext-sync-worker/`](mycontext-sync-worker/README.md) | Notion の `Ready` を webhook と Queue で受け、検証済み文書を TiDB へ反映する同期 Worker。 |
| [`mycontext-mcp-worker/`](mycontext-mcp-worker/README.md) | 認証付き Remote MCP。検索、文書取得、用途に応じたコンテキストの取得を提供します。 |
| [`docs/author-style-context.md`](docs/author-style-context.md) | 記事の各ポイントと実装の対応、Author Style のデータモデルとサンプル。 |

## Author Style の仕組み

文書は `example-title-style` と `example-body-style` の2種類です。用途を指定すると、サーバーが必要なセクションを選び、1つの Markdown として返します。

```json
{
  "name": "get_author_style_context",
  "arguments": {
    "documentId": "example-body-style",
    "operation": "generate",
    "mode": "explanatory",
    "lengthBand": "2001plus",
    "profile": "neutral"
  }
}
```

- 意味が完結する見出し単位を配信し、細かな検索ヒットは配信用の親セクションへ展開します。
- `example-title/core` などの固定キーと routing manifest で、操作・記事の種類・長さから取得対象を決めます。
- 通常の生成・編集用ルールと、統計などの根拠を分けます。根拠確認には `search_author_style_evidence` を使います。
- 選択結果が上限45,000字を超えた場合はエラーにします。末尾の切り捨ては行いません。

保存先は現在の文書を持つ `author_style_documents` と、現在のセクションを持つ `author_style_current_sections` の2テーブルです。更新時は同じトランザクションで置き換え、検証失敗時には前の内容を維持します。`context_sha256` は同一性の確認に使い、Author Style の履歴テーブルは作りません。

合成サンプルは [`mycontext-sync/examples/author-style/`](mycontext-sync/examples/author-style/) にあります。parser は所定のアウトラインとキーを検証します。独自のガイドへ変更するときは、本文と parser / routing の契約をそろえて変更してください。

## Notion からの同期

1. 同期 Worker の [README](mycontext-sync-worker/README.md)に従い、Notion data source と管理プロパティを作成します。
2. タイトル用・本文用のサンプルを Notion に置き、それぞれの文書 ID と許可するページ ID を設定します。
3. `mycontext-sync` で `pnpm migrate-author-style` と `pnpm migrate-sync-state-log` を実行し、Queue、Worker の環境設定を用意します。同期処理は Author Style だけの場合も状態ログへ書き込みます。
4. Notion で編集を終え、Status を `Ready` にします。
5. Worker が署名を検証したイベントを Queue へ送り、最新の本文・プロパティを検証して同期します。成功すると `Synced`、失敗すると `Error` または `Conflict` になります。

同期 Worker は Notion の管理プロパティを更新します。ページ本文は更新しません。通常の Author Style 同期にローカル Markdown は使いません。

## CLI とその他の文書

CLI のセットアップは [`mycontext-sync/README.md`](mycontext-sync/README.md) を参照してください。

```bash
cd mycontext-sync
pnpm install --frozen-lockfile
cp .env.example .env
```

ローカルの `.env` に接続情報を設定してから、スキーマを作成します。MCP の一般検索・文書取得・Resource 一覧は複数の保存先を参照するため、全体を使う場合は空のテーブルも含めて次の migration を実行してください。

```bash
pnpm migrate
pnpm migrate-editor-knowledge
pnpm migrate-business-knowledge
pnpm migrate-author-style
pnpm migrate-metaskill
pnpm migrate-sync-state-log
```

`get_author_style_context` だけを使う場合の読み取り先は Author Style の2テーブルです。Notion からの同期には状態ログも必要なので、専用構成でも `migrate-author-style` と `migrate-sync-state-log` の両方を実行します。この構成で他の保存先を参照する一般検索や Resource 一覧を使う場合は、上記の全スキーマも用意してください。

通常の Notion ページを取り込むには `pnpm pull`、取り込み結果の検査には `pnpm doctor` を使います。Author Style は Notion 同期後に `pnpm doctor-author-style` で検査できます。`migrate*` はスキーマを変更し、`pull` は設定した Notion ページを読み取って TiDB を更新します。

文書の保存先は用途で分けています。

| 文書 | 保存先 |
| --- | --- |
| 設定した Notion 文書・AI スキル | `notion_pages` |
| 編集知識・プレイブック | `editor_knowledge_documents`、文書種別により `editor_knowledge_sections` |
| Business knowledge | `business_knowledge_documents`、`business_knowledge_sections` |
| Author Style | `author_style_documents`、`author_style_current_sections` |
| Metaskill | `metaskill_documents`、`metaskill_revisions`、`metaskill_sections` |
| 同期の状態遷移 | `context_sync_state_log` |

Notion 文書は `pnpm run search -- --query "検索語" --top-k 5` で確認できます。`pnpm search` はパッケージ検索になるため、`run` を付けます。`pnpm export-obsidian` は TiDB の文書をローカルへ書き出し、Notion API を呼びません。

## Remote MCP

接続先と OAuth のセットアップは [`mycontext-mcp-worker/README.md`](mycontext-mcp-worker/README.md) を参照してください。

- `GET /healthz`: 外部サービスを呼ばない liveness check。
- `/mcp`: OAuth と `context:read` scope で保護された MCP endpoint。
- 本人確認: GitHub OAuth と、設定した不変の数値 user ID による許可。

一般の文書検索には `search_personal_context`、取得には `read_context` を使います。Author Style と Metaskill は専用のコンテキスト取得・根拠検索ツールを持ちます。企画・編集・校正・メディア設計・分析スキルの取得ツールも提供します。全11ツールの引数と接続方法は Worker の README を参照してください。

分析スキルの `get_analysis_skill_context` と、その文書への検索・取得には任意の `skill_context_documents` が必要です。このテーブルの migration と取り込みコマンドは同梱していません。使う場合は利用者が別途用意してください。Author Style 専用ツールはこのテーブルを参照しません。

## 設定と公開範囲

実際の `.env`、`.dev.vars`、Notion page / data source ID、秘密情報、デプロイ先 ID、同期済み本文、バックアップは commit しません。各 Worker の設定例をローカルへコピーし、運用先ごとの値を設定してください。公開用の origin と KV ID はプレースホルダーのままです。

詳細は [`docs/personal-use.md`](docs/personal-use.md)、権限と認証の境界は [`SECURITY.md`](SECURITY.md) を参照してください。

## ローカル検証

Node.js 22.22.3、pnpm 11.7.0 を使用します。

```bash
./scripts/check-public-safety.sh

cd mycontext-sync
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test

cd ../mycontext-mcp-worker
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run deploy:dry-run

cd ../mycontext-sync-worker
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run deploy:dry-run
```

これらは型・テスト・公開対象・ビルドの検証です。実際の Notion / TiDB 接続や OAuth の疎通は、利用者自身の環境設定後に確認してください。
