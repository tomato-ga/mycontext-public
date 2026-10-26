# Author Style: 記事と実装の対応

更新日: 2026-10-26

[技術記事](https://hfm.tokyo/blog/author-style-context-mcp)で扱うのは、意味が完結する単位で文体ガイドを保存し、AI が用途に応じたルールを1回で受け取る仕組みです。公開版では著者・文書・本文をサンプルへ置き換えています。

| 記事のポイント | 実装 |
| --- | --- |
| 見出しと固定キーで意味単位に分ける | [`mycontext-sync/src/authorStyle.ts`](../mycontext-sync/src/authorStyle.ts) |
| 用途とセクションの対応表 | [`mycontext-sync/src/authorStyleRouting.ts`](../mycontext-sync/src/authorStyleRouting.ts) |
| 現在の文書とセクションの2テーブル | [`mycontext-sync/author-style-schema.sql`](../mycontext-sync/author-style-schema.sql) |
| 用途指定で1つのコンテキストを取得 | [`getAuthorStyleContext.ts`](../mycontext-mcp-worker/src/tools/getAuthorStyleContext.ts) |
| 根拠だけを必要時に検索 | [`searchAuthorStyleEvidence.ts`](../mycontext-mcp-worker/src/tools/searchAuthorStyleEvidence.ts) |
| `Ready` からの同期と検証 | [`mycontext-sync-worker/src/sync.ts`](../mycontext-sync-worker/src/sync.ts) |
| Webhook の署名確認 | [`mycontext-sync-worker/src/webhook.ts`](../mycontext-sync-worker/src/webhook.ts) |

## 保存と配信の単位

`author_style_documents` は現在の原文、routing manifest、hash、parser の version などを持ちます。`author_style_current_sections` は配信用の section と、検索用の小さな span を持ちます。

H3 の検索用 span は `delivery_section_id` で意味が完結する配信用 section を指します。通常は H2 のまとまりを返しますが、本文の構成別ルールなどには parser が明示的に配信単位を定義しています。文字数による機械的な分割や連結はしません。

`context_key` は配信対象を指定する固定キーです。たとえば `example-title/core` をタイトルの基本ルールに割り当てます。見出しの文言を検索して選ぶ処理を AI に任せず、サーバーが routing manifest を使って決定します。

## 通常の取得

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

本文では `lengthBand` が必須です。タイトル用の `example-title-style` では省略します。操作・mode・profile の対応しない組み合わせは拒否します。

選択したキーに対応するセクションを順番にまとめ、Markdown と取得メタデータを返します。対象のセクションがない場合や、結果が `maxContextChars` を超えた場合はエラーにします。現行 manifest の上限は45,000字です。ルールの一部だけを切り取って返すことはありません。

`search_author_style_evidence` は根拠を調べるための別の経路です。統計や分析結果を、通常の生成ルールへ毎回混ぜないために分けています。

## 更新時の動き

```text
Notion Ready
  -> signed webhook
  -> Queue
  -> read and validate document / properties
  -> parse sections and routing
  -> replace current snapshot in TiDB transaction
  -> Notion Synced
```

同期 Worker は許可したタイトル用・本文用ページだけを受け付けます。本文と管理プロパティの fingerprint を確認し、更新中の競合を検知します。本文や routing の検証で失敗した場合、現在配信中の snapshot は更新しません。

文書の現在値と section の入れ替えは同じトランザクションで行います。同じ内容の再送は hash で判断します。通常 Queue の再試行を使い切った message は dead-letter Queue で処理します。

MCP Worker と同期 Worker の接続情報は別です。Notion や同期側に問題があっても、MCP Worker は最後に反映できた snapshot を読み取れます。

## サンプルから試す

[`mycontext-sync/examples/author-style/`](../mycontext-sync/examples/author-style/) の `title.md` と `body.md` は、parser が要求するアウトラインとキーを持つ合成データです。個人の分析・統計・実際の記事は含めません。

1. 自分の Notion data source に2つの文書を作ります。
2. サンプル本文と、同期 Worker の README にある管理プロパティを設定します。
3. 自分の接続先で `pnpm migrate-author-style` と `pnpm migrate-sync-state-log` を実行し、文体データと状態ログのテーブルを用意します。同期 Worker は各処理の状態をログに記録するため、後者も必須です。
4. 自分のページ ID、Queue、Worker を設定し、各文書を `Ready` にします。
5. `mycontext-sync` の `pnpm doctor-author-style` で保存内容と routing を検査します。
6. 認証済み MCP クライアントから `get_author_style_context` を呼び出します。

上記は Author Style 専用ツールを使う構成です。一般検索・`read_context`・Resource 一覧も使う場合は、[root README](../README.md#cli-とその他の文書) にある全 migration を実行してください。分析スキル用の任意テーブル `skill_context_documents` は別途利用者が用意するもので、この専用構成には不要です。

この parser は文書のアウトラインを検証します。自分のガイドの見出し構成を変える場合は、parser、routing、fixture を同じ変更として更新してください。
