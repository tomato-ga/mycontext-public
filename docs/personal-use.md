# 公開リポジトリと自分のデータを分ける

このリポジトリには実装と合成サンプルを置き、実際のデータや接続情報は利用者の環境で管理します。

## ローカルに置くもの

- `mycontext-sync/.env` と、必要に応じて `mirror.config.json`
- 各 Worker の `.dev.vars`
- 実際の Notion page / data source ID、文書名、同期元の絶対パス
- 同期済み Markdown、Obsidian export、緊急復旧用 snapshot
- DB、ログ、memory、デプロイ用の設定

これらを公開用のファイルへコピーしないでください。`.env.example` / `.dev.vars.example` は空欄やダミー値を使います。公開サンプルの著者は `example-author`、文書 ID は `example-title-style` / `example-body-style` です。

## CLI の設定

`mycontext-sync/.env` では、たとえば次の設定を使用します。下記の値は説明用のプレースホルダーです。

```env
MIRROR_CONFIG_JSON={"pages":[{"pageId":"your-private-page-id","title":"your-private-page-title"}]}
EDITOR_KNOWLEDGE_SOURCE_ROOT=/absolute/path/to/editor-knowledge-library
BUSINESS_KNOWLEDGE_SOURCE_ROOT=/absolute/path/to/business-knowledge-library
METASKILL_SOURCE_ROOT=/absolute/path/to/metaskill-library
```

`MIRROR_CONFIG_JSON` は `mirror.config.json` より優先されます。各 `*_SOURCE_ROOT` はローカル専用で、取り込みは実装が許可する固定の相対パスに限定されます。

Author Style は Notion を正本とします。通常同期に `AUTHOR_STYLE_SOURCE_ROOT` や `pull-author-style` は使いません。[合成サンプル](../mycontext-sync/examples/author-style/)を自分の Notion ページに置き、同期 Worker の `AUTHOR_STYLE_TITLE_PAGE_ID` / `AUTHOR_STYLE_BODY_PAGE_ID` に許可するページを設定します。Notion の管理プロパティと初回 webhook 登録は [同期 Worker の README](../mycontext-sync-worker/README.md) を参照してください。

Author Style の `source_path_key` は同期元を識別する `notion:<page-id>` です。これは実行先 DB に保存する運用データであり、公開用のサンプルやテストには実際の page ID を含めません。

## スキーマの準備

Notion から Author Style だけを同期する場合も、CLI の `migrate-author-style` と `migrate-sync-state-log` を実行します。後者は同期処理が毎回記録する状態ログのテーブルです。MCP の一般検索・文書取得・Resource 一覧を併用する場合は、[root README の全 migration](../README.md#cli-とその他の文書) で空テーブルも準備してください。

分析スキル用の `skill_context_documents` は任意です。migration と取り込みコマンドは同梱していないため、その機能を使う利用者が別途用意します。Author Style の専用取得には必要ありません。

## 認証情報の分離

MCP Worker は読み取り専用の TiDB 接続と OAuth 用 secret を持ちます。同期 Worker は別の TiDB writer と Notion integration を持ちます。それぞれの `.dev.vars.example` と README に従って設定してください。

ローカル用 `.dev.vars` は gitignored なファイルとして作成し、デプロイ時はプラットフォームの secret を使用します。origin、KV namespace ID、Queue、Notion の許可ページも自分の環境の値へ変更します。実値を公開リポジトリへ commit しないでください。

## Export と緊急復旧

Notion 文書のローカル export は `pnpm export-obsidian` です。Author Style の緊急 snapshot は次のコマンドで書き出します。

```bash
cd mycontext-sync
pnpm export-author-style-markdown -- --document-id example-body-style
```

export ファイルは私的な本文を含むため、公開対象の外に保管してください。復旧はまず dry-run で検証します。

```bash
pnpm restore-author-style-markdown -- --document-id example-body-style   --input-path /private/path/snapshot.md --dry-run
```

実際の復旧には `--activate-emergency` が必要です。通常の同期は、Notion 上の正しい本文を確認して `Ready` に戻す運用を続けます。

## 公開前の確認

```bash
./scripts/check-public-safety.sh
```

このチェックは追跡済みファイルと、未追跡で ignore されていないファイルを検査します。各サブプロジェクトの型検査・テスト・dry-run は [root README](../README.md#ローカル検証) を参照してください。

追加したサンプルや fixture が実際の個人データから作られていないことも確認します。値を置換しただけの私的なガイド本文や書籍の文字起こしを、公開サンプルとして含めないでください。
