# Author Style の合成サンプル

この2つの Markdown は、parser と routing の動作を確認するための架空のデータです。
個人の文体、過去記事の本文、分析結果、私的なガイドは含みません。

| ファイル | document ID | 著者キー |
| --- | --- | --- |
| [title.md](title.md) | `example-title-style` | `example-author` |
| [body.md](body.md) | `example-body-style` | `example-author` |

## 認証やデータベースを使わずに試す

`mycontext-sync/` で次を実行すると、サンプルを解析し、長い解説記事向けの13セクションを1つの Markdown にまとめて表示します。

```bash
pnpm install --frozen-lockfile
pnpm exec tsx scripts/inspect-author-style-example.ts
```

このスクリプトは例示ファイルだけを読み、Notion や TiDB へ接続しません。
タイトルと本文の全368通りの routing は `pnpm test` で確認できます。

## Notion と同期 Worker で使う

1. 自分の Notion に2つのページを作り、各 Markdown を配置します。
2. [同期 Worker の設定](../../../mycontext-sync-worker/README.md)で、自分のページと document ID の対応を定義します。
3. TiDB にスキーマを用意し、同期 Worker の認証と Queue を設定します。
4. ページの Status を `Ready` にして同期し、`pnpm doctor-author-style` で確認します。

タイトルの `context-key` と本文の見出しは parser の入力契約です。
見出しを変える場合は `src/authorStyle.ts` の対応表・routing とテストも合わせて更新します。
本文のサンプルには規則の内容を入れていません。実際に使うときは、自分で用意したガイドへ置き換えてください。
