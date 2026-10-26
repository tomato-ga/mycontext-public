import { describe, expect, it } from "vitest";
import {
  AUTHOR_STYLE_DOCUMENTS,
  parseAuthorStyleMarkdown,
  type AuthorStyleDocumentDefinition
} from "../src/authorStyle.js";
import {
  buildAuthorStyleContext,
  enumerateAuthorStyleSelectors,
  parseAuthorStyleRoutingManifest
} from "../src/authorStyleRouting.js";

const TITLE_KEYS = [
  "example-title/bootstrap",
  "example-title/core",
  "example-title/input-contract",
  "example-title/router",
  "example-title/mode/news",
  "example-title/mode/reaction-explanation",
  "example-title/mode/uncertainty",
  "example-title/mode/experience",
  "example-title/mode/interview",
  "example-title/mode/practical",
  "example-title/mode/sale",
  "example-title/mode/narrative",
  "example-title/notation",
  "example-title/anti-patterns",
  "example-title/evaluator",
  "example-title/output-contract",
  "example-title/retrieval-ops",
  "example-title/maintenance",
  "example-title/evidence"
];

describe("author style semantic storage", () => {
  it("keeps both document definitions and rejects the removed analysis outline", () => {
    expect(AUTHOR_STYLE_DOCUMENTS.map((source) => source.documentId)).toEqual([
      "example-title-style",
      "example-body-style"
    ]);
    expect(() => parseAuthorStyleMarkdown({
      source: authorStyleDocument("body"),
      markdown: "# Old analysis\n\n## Executive Summary\n\nRemoved.\n",
      sourcePathKey: "notion:body-page",
      sourceMtimeMs: 0
    })).toThrow("example-body-style H2 outline changed");
  });

  it("parses all 19 title delivery units and ignores headings inside fences", () => {
    const document = parseAuthorStyleMarkdown({
      source: authorStyleDocument("title"),
      markdown: titleMarkdown(),
      sourcePathKey: "notion:title-page",
      sourceMtimeMs: 123
    });

    expect(document.deliverySectionCount).toBe(19);
    expect(document.searchSpanCount).toBe(1);
    expect(document.sectionCount).toBe(20);
    expect(document.sections.filter((section) => section.contextKey !== null)
      .map((section) => section.contextKey)).toEqual(TITLE_KEYS);
    expect(document.sections.some((section) => section.title === "fenced fake heading")).toBe(false);
  });

  it("parses the current Notion body outline with the persisted routing contract", () => {
    const document = parseAuthorStyleMarkdown({
      source: authorStyleDocument("body"),
      markdown: currentBodyMarkdown(),
      sourcePathKey: "notion:body-page",
      sourceMtimeMs: 123
    });
    const manifest = parseAuthorStyleRoutingManifest(document.routingManifest);
    const sectionMap = new Map(document.sections.flatMap((section) => section.contextKey === null
      ? []
      : [[section.contextKey, {
          contextKey: section.contextKey,
          title: section.title,
          markdown: section.deliveryMarkdown
        }] as const]));
    const packs = enumerateAuthorStyleSelectors(manifest).map((selectors) =>
      buildAuthorStyleContext({
        documentId: document.documentId,
        displayName: document.displayName,
        revisionSha256: document.revisionSha256,
        manifest,
        selectors,
        sections: sectionMap
      })
    );

    expect(document.parserVersion).toBe("author-style-parser-v4");
    expect(document.routingVersion).toBe("single-context-pack-v3");
    expect(document.deliverySectionCount).toBe(20);
    expect(document.searchSpanCount).toBe(19);
    expect(document.sections.some((section) => section.contentLayer === "profile")).toBe(false);
    expect(document.sections.some((section) => section.contextKey?.includes("/profile/"))).toBe(false);
    expect(document.sections.find(
      (section) => section.contextKey === "example-body/composition/explanatory"
    )).toMatchObject({ title: "8.1 標準記事", sectionType: "delivery" });
    expect(document.sections.find(
      (section) => section.contextKey === "example-body/longform/guidance"
    )).toMatchObject({ title: "14. 長文記事の特長", sectionType: "delivery" });
    expect(document.sections.some((section) => section.contextKey === "example-body/flow")).toBe(false);
    expect(manifest.operations["edit-structure"]?.base).toEqual([
      "example-body/contract",
      "example-body/structure/opening",
      "example-body/structure/closing",
      "example-body/evaluator"
    ]);
    expect(packs).toHaveLength(320);
    expect(packs.every((pack) => pack.contextChars <= manifest.maxContextChars)).toBe(true);
  });

  it("rejects the legacy 15-chapter body outline that still carries the 導線 chapter", () => {
    expect(() => parseAuthorStyleMarkdown({
      source: authorStyleDocument("body"),
      markdown: legacyBodyMarkdownWithFlowChapter(),
      sourcePathKey: "notion:body-page",
      sourceMtimeMs: 123
    })).toThrow(/author_style_body_outline_mismatch|example-body-style H2 outline changed/);
  });

  it("parses Notion-provided Markdown without requiring a local file", () => {
    const document = parseAuthorStyleMarkdown({
      source: authorStyleDocument("title"),
      markdown: titleMarkdown(),
      sourcePathKey: "notion:page-1",
      sourceMtimeMs: 123
    });

    expect(document.sourcePathKey).toBe("notion:page-1");
    expect(document.sourceMtimeMs).toBe(123);
    expect(document.deliverySectionCount).toBe(19);
  });
});

function authorStyleDocument(styleScope: "title" | "body"): AuthorStyleDocumentDefinition {
  const source = AUTHOR_STYLE_DOCUMENTS.find((candidate) => candidate.styleScope === styleScope);
  if (source === undefined) {
    throw new Error(`missing ${styleScope} author style document definition`);
  }
  return source;
}

function titleMarkdown(): string {
  return [
    "# Title style",
    "",
    ...TITLE_KEYS.flatMap((key, index) => [
      `## Section ${index + 1}`,
      "",
      `\`context-key: ${key}\``,
      "",
      `Rules for ${key}.`,
      ...(key === "example-title/core"
        ? [
            "",
            "```md",
            "### fenced fake heading",
            "```",
            "",
            "### real child",
            "Child evidence."
          ]
        : []),
      ""
    ])
  ].join("\n");
}

function currentBodyMarkdown(): string {
  const chapters: Array<[string, string[]]> = [
    ["1. 基本リズム", []],
    ["2. 文体・語尾", ["2.1 敬体が基調", "2.2 語尾の変化"]],
    ["3. 会話性と人称", ["3.1 一人称", "3.2 口語"]],
    ["4. 接続と論理の運び方", ["4.1 接続語", "4.2 基本の論理順序"]],
    [
      "5. 不確実性・評価・感情",
      ["5.1 不確実性を明示する", "5.2 強い断定は限定的に使う", "5.3 感情語"]
    ],
    ["6. 疑問・感嘆・記号", ["6.1 疑問と感嘆", "6.2 その他の記号"]],
    ["7. 冒頭の作り方", ["7.1 冒頭テンプレート"]],
    [
      "8. 本論の組み立て",
      ["8.1 標準記事", "8.2 レビュー・体験", "8.3 インタビュー・長文", "8.4 翻訳・紹介"]
    ],
    ["9. 結びの作り方", []],
    ["10. 読者への距離", []],
    ["11. 公開本文の構造要素", []],
    [
      "12. 本文生成のスタイル契約",
      ["12.1 共通の必須条件", "12.2 推奨条件", "12.3 避ける"]
    ],
    ["13. 本文評価チェックリスト", []],
    [
      "14. 長文記事の特長",
      [
        "14.1 長文の基本方針",
        "14.2 伝聞と自分の判断を分ける",
        "14.3 長文の熱量は、問いと検討で作る",
        "14.4 見出しは「話題名」ではなく「読者の判断軸」にする",
        "14.5 長文記事専用のスタイル契約",
        "14.6 長文で避けること"
      ]
    ]
  ];
  return renderBodyChapters(chapters);
}

// Reject the legacy outline that contains a chapter outside the current body-style contract.
function legacyBodyMarkdownWithFlowChapter(): string {
  const chapters: Array<[string, string[]]> = [
    ["1. 基本リズム", []],
    ["2. 文体・語尾", ["2.1 敬体が基調", "2.2 語尾の変化"]],
    ["3. 会話性と人称", ["3.1 一人称", "3.2 口語"]],
    ["4. 接続と論理の運び方", ["4.1 接続語", "4.2 基本の論理順序"]],
    [
      "5. 不確実性・評価・感情",
      ["5.1 不確実性を明示する", "5.2 強い断定は限定的に使う", "5.3 感情語"]
    ],
    ["6. 疑問・感嘆・記号", ["6.1 疑問と感嘆", "6.2 その他の記号"]],
    ["7. 冒頭の作り方", ["7.1 冒頭テンプレート"]],
    [
      "8. 本論の組み立て",
      ["8.1 標準記事", "8.2 レビュー・体験", "8.3 インタビュー・長文", "8.4 翻訳・紹介"]
    ],
    ["9. 結びの作り方", []],
    [
      "10. 導線・流れを自然に見せる編集技法",
      [
        "10.1 この章の役割",
        "10.2 接続詞ではなく「読者の次の疑問」で並べる",
        "10.3 通読と拾い読みを両立させる",
        "10.4 タイトルから結びまで「約束」を管理する",
        "10.5 一段落に一つの中心論点を置く",
        "10.6 記事形式ごとの疑問の階段",
        "10.7 話題転換の大きさに合わせて接続を変える",
        "10.8 既知の情報から新しい情報へ渡す",
        "10.9 情報を「事実と意味」の二拍で動かす",
        "10.10 見出し・引用・画像・データを本文から浮かせない",
        "10.11 文長と段落長で速度を制御する",
        "10.12 結びは要約ではなく「回収」にする",
        "10.13 逆アウトラインで最後に構造を点検する",
        "10.14 導線チェックリスト"
      ]
    ],
    ["11. 読者への距離", []],
    ["12. 公開本文の構造要素", []],
    [
      "13. 本文生成のスタイル契約",
      ["13.1 共通の必須条件", "13.2 推奨条件", "13.3 避ける"]
    ],
    ["14. 本文評価チェックリスト", []],
    [
      "15. 長文記事の特長",
      [
        "15.1 長文の基本方針",
        "15.2 伝聞と自分の判断を分ける",
        "15.3 長文の熱量は、問いと検討で作る",
        "15.4 見出しは「話題名」ではなく「読者の判断軸」にする",
        "15.5 長文記事専用のスタイル契約",
        "15.6 長文で避けること"
      ]
    ]
  ];
  return renderBodyChapters(chapters);
}

function renderBodyChapters(chapters: Array<[string, string[]]>): string {
  return [
    "# Compact body style",
    "",
    ...chapters.flatMap(([chapter, children]) => [
      `## ${chapter}`,
      "",
      `${chapter} rules.`,
      "",
      ...children.flatMap((child) => [`### ${child}`, "", `${child} rules.`, ""])
    ])
  ].join("\n");
}
