# mycontext-sync

Notion とローカル Markdown を TiDB へ保存し、同期結果を検証する TypeScript CLI です。
埋め込みや文字数による分割は行いません。見出しや意味のまとまりを保存し、MCP Worker が用途に応じて必要な本文を読み取ります。

## Author Style の現行構成

文体ガイドの正本は Notion です。[同期 Worker](../mycontext-sync-worker/README.md) が `Ready` のページを受け取り、検証した内容を次の2テーブルへ反映します。

- `author_style_documents`: 原文、SHA-256、用途とセクションの対応表、件数を持つ現在の文書。
- `author_style_current_sections`: 配信する意味単位と、その単位を探すための検索用セクション。

同期 Worker は各処理を `context_sync_state_log` に記録します。Author Style だけを使う場合も、
`pnpm migrate-author-style` と `pnpm migrate-sync-state-log` の両方を先に実行してください。
一般検索や resource 一覧まで使う場合は、[全体のセットアップ](../README.md)に従って他のナレッジ用スキーマも作成します。

CLI はテーブル作成、保存内容の再検証、バックアップ、緊急復元を担当します。
旧版の `pull-author-style` と `AUTHOR_STYLE_SOURCE_ROOT` は廃止しました。
タイトルと本文の document ID は `example-title-style` / `example-body-style`、著者キーは `example-author` です。

parser は例示ガイドのアウトラインを検証し、文字数で機械的には切りません。
タイトルには固定の `context-key` を付け、本文は見出しから固定キーを割り当てます。
長文用のルールも用途に含め、取得結果が45,000字を超える場合は切り捨てずエラーにします。

## セットアップ

1. `.env.example` を `.env` にコピーし、自分の Notion / TiDB 設定を入れます。実 `.env` は Git 管理から除外されます。
2. 通常の Notion ページ同期には `.env` の `MIRROR_CONFIG_JSON`、またはローカルの `mirror.config.json` で対象を指定します。
3. ローカルのナレッジ同期を使う場合だけ、対応する `*_SOURCE_ROOT` を設定します。元のナレッジ本文はこのリポジトリには含みません。
4. 依存をインストールします。

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
```

実データを使わず構成を確認するには、[合成 Author Style サンプル](examples/author-style/README.md)を参照してください。
このサンプルを Notion に配置した後の自動同期設定は、同期 Worker の README に記載しています。

## コマンド

次のコマンドは設定した接続先を操作します。`migrate*` はスキーマを変更し、`pull*` は同期先へ書き込みます。
開発時に実データへ接続する必要はありません。

```bash
# 通常の Notion ページ
pnpm migrate
pnpm pull -- --dry-run
pnpm pull
pnpm doctor
pnpm run search -- --query "検索語" --top-k 5

# ローカルの editor / business / metaskill ナレッジ
pnpm migrate-editor-knowledge
pnpm pull-editor-knowledge -- --dry-run
pnpm pull-editor-knowledge
pnpm doctor-editor-knowledge
pnpm migrate-business-knowledge
pnpm pull-business-knowledge
pnpm doctor-business-knowledge
pnpm migrate-metaskill
pnpm pull-metaskill
pnpm doctor-metaskill

# Notion を正本にする Author Style
pnpm migrate-author-style
pnpm doctor-author-style
pnpm preflight-author-style-notion -- --document-id example-body-style --page-id <your-page-id>

# 同期ログ用のテーブル作成と状態の確認
pnpm migrate-sync-state-log
pnpm audit-sync-state

# TiDB に保存された通常の Notion ページをローカルへ書き出す
pnpm export-obsidian
```

`pnpm run search` を使ってください。`pnpm search` は pnpm のパッケージ検索です。
`preflight-author-style-notion` は Notion と保存済み snapshot の読み取りだけを行い、差分の内容を本文ごと表示せず比較します。
`doctor-author-style` は snapshot を再解析し、ハッシュ、セクション、全用途の組み合わせを検証します。

## Author Style のバックアップと緊急復元

```bash
pnpm export-author-style-markdown -- --document-id example-body-style
pnpm restore-author-style-markdown -- --document-id example-body-style --input-path <snapshot.md> --dry-run
```

export はデフォルトで Git 管理対象外の `private-exports/` に Markdown と `.md.json` メタデータを書き出します。
復元は両ファイルのハッシュ、parser / routing のバージョン、件数を検証します。
実際に TiDB の snapshot を更新する場合だけ `--activate-emergency` を指定します。
通常の更新は Notion の `Ready` → 同期 Worker の経路を使います。

## その他の保存先

| 入力 | 保存先 |
| --- | --- |
| 通常の Notion ページ | `notion_pages` に1ページ1行 |
| 固定8件のローカル editor knowledge | `editor_knowledge_documents` に全文 |
| Notion の編集・校正・メディア設計プレイブック | `editor_knowledge_documents` に全文 |
| Notion の企画プレイブック・カタログ・全文資料 | 文書と `editor_knowledge_sections` に意味単位 |
| 固定の business knowledge | `business_knowledge_documents` と revision 付き `business_knowledge_sections` |
| Metaskill | `metaskill_documents` / `metaskill_revisions` / `metaskill_sections` |

`migrate-editor-knowledge` は必要な列と section テーブルを追加します。
固定ローカルファイルの一覧は `src/editorKnowledge.ts`、`src/businessKnowledge.ts`、`src/metaskill.ts` で管理します。
参照先の Markdown は利用者が用意します。本や私的な文書の内容は配布していません。

## 旧 Author Style スキーマから更新する場合

`migrate-author-style` は current snapshot 用の列と新しい section テーブルを追加します。
旧 `author_style_revisions` / `author_style_sections` の削除や既存データの自動変換は行いません。
Notion に例示フォーマットのガイドを用意し、同期 Worker で再同期した後、`doctor-author-style` で検証してください。
current snapshot が揃うまで MCP の接続先を切り替えず、既存データのバックアップを保持します。

## Obsidian export

`export-obsidian` は TiDB の保存済み Notion ページを読み取り、ローカルの `_notion_pages/` に Markdown を書き出します。
Notion API は呼びません。出力先は `--vault-path` / `--output-dir` で指定できます。
`scripts/run-obsidian-sync.sh` は通常ページの `pull` と export を順に実行するため、実行環境の認証設定が必要です。
個人環境の LaunchAgent、生成された本文、状態ファイルはコミットしないでください。
