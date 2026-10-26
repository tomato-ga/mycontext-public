import { describe, expect, it } from "vitest";
import { parseEditorKnowledgeSectionedMarkdown } from "../src/editorKnowledge.js";
import {
  createPlanningCatalogFixture,
  createPlanningFulltextFixture,
  createPlanningPlaybookFixture,
  createPlanningSourceFixture
} from "./fixtures/editorKnowledgeSectionedFixture.js";

describe("parseEditorKnowledgeSectionedMarkdown (text-based, used by mycontext-sync-worker)", () => {
  it("parses Notion-fetched Markdown text directly, with no file I/O", () => {
    const markdown = [
      "# 企画構成プレイブック テスト版",
      "",
      "## 1. 企画の立て方",
      "第1章の本文。",
      ""
    ].join("\n");

    const document = parseEditorKnowledgeSectionedMarkdown({
      documentId: "planning-playbook",
      markdown,
      sourcePathKey: "notion:abc123"
    });

    expect(document).toMatchObject({
      documentId: "planning-playbook",
      title: "企画構成プレイブック テスト版",
      sourcePathKey: "notion:abc123",
      sectionCount: 1,
      searchSpanCount: 1
    });
    expect(document.sections[0]).toMatchObject({ sectionId: "chapter-01" });
  });

  it("keeps media-design-playbook as one whole-document record", () => {
    const markdown = [
      "# メディア設計・運営プレイブック",
      "",
      "テーマ: メディア設計・運営",
      "",
      "## 1. メディアを持つ前に決めること",
      "第1章の本文。",
      "",
      "## 2. 届ける価値とやらないことを決める",
      "第2章の本文。",
      ""
    ].join("\n");

    const document = parseEditorKnowledgeSectionedMarkdown({
      documentId: "media-design-playbook",
      markdown,
      sourcePathKey: "notion:media-design"
    });

    expect(document).toMatchObject({
      documentId: "media-design-playbook",
      title: "メディア設計・運営プレイブック",
      storageMode: "whole_document",
      sectionCount: 0,
      searchSpanCount: 0
    });
    expect(document.sections).toEqual([]);
    expect(document.sectionRevisionSha256).toBe(document.markdownSha256);
    expect(document.markdown).toBe(markdown);
  });

  it("keeps editing-playbook-v2 as one whole-document record", () => {
    const markdown = [
      "# 編集プレイブック v2",
      "",
      "記事を編集する工程の順に、研修スライドの本文を組み直したもの。",
      "",
      "## 00 常時読む要約",
      "`context-key: editing/always`",
      "",
      "## 01 編集とは・心構え・編集十訓",
      "第1章の本文。",
      ""
    ].join("\n");

    const document = parseEditorKnowledgeSectionedMarkdown({
      documentId: "editing-playbook-v2",
      markdown,
      sourcePathKey: "notion:editing-v2"
    });

    expect(document).toMatchObject({
      documentId: "editing-playbook-v2",
      title: "編集プレイブック v2",
      storageMode: "whole_document",
      sectionCount: 0,
      searchSpanCount: 0
    });
    expect(document.sections).toEqual([]);
    expect(document.sectionRevisionSha256).toBe(document.markdownSha256);
    expect(document.markdown).toBe(markdown);
  });

  it("keeps editing-playbook as one whole-document record", () => {
    const markdown = [
      "# 編集プレイブック",
      "",
      "原稿が上がってから公開するまでの編集作業を作業の順番に再編成したもの。",
      "",
      "## 1. このプレイブックの使い方",
      "第1章の本文。",
      "",
      "## 2. 編集の原則（判断の土台）",
      "第2章の本文。",
      ""
    ].join("\n");

    const document = parseEditorKnowledgeSectionedMarkdown({
      documentId: "editing-playbook",
      markdown,
      sourcePathKey: "notion:editing"
    });

    expect(document).toMatchObject({
      documentId: "editing-playbook",
      title: "編集プレイブック",
      storageMode: "whole_document",
      sectionCount: 0,
      searchSpanCount: 0
    });
    expect(document.sections).toEqual([]);
    expect(document.sectionRevisionSha256).toBe(document.markdownSha256);
    expect(document.markdown).toBe(markdown);
  });

  it("parses fixture Markdown directly while preserving its supplied source key", () => {
    const fixture = createPlanningCatalogFixture();
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);
    expect(document).toMatchObject({
      documentId: "planning-catalog",
      sourcePathKey: fixture.sourcePathKey,
      sectionCount: 6,
      searchSpanCount: 4
    });
  });

  it("rejects empty or NUL-containing Markdown", () => {
    expect(() => parseEditorKnowledgeSectionedMarkdown({
      documentId: "planning-catalog",
      markdown: "   ",
      sourcePathKey: "notion:abc123"
    })).toThrow(expect.objectContaining({ code: "editor_knowledge_invalid_markdown" }));
  });
});

describe("planning composition playbook parsing (editor knowledge, sectioned)", () => {
  it("treats each numbered ## chapter as one atomic, self-delivering detail section", () => {
    const fixture = createPlanningPlaybookFixture();
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);

    expect(document.sectionCount).toBe(3);
    expect(document.searchSpanCount).toBe(3);
    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "chapter-01",
      "chapter-02",
      "chapter-03"
    ]);

    const first = document.sections.find((section) => section.sectionId === "chapter-01");
    expect(first).toMatchObject({
      parentSectionId: null,
      deliverySectionId: "chapter-01",
      contentLayer: "detail",
      isSearchable: true,
      sectionNumber: "1",
      freshnessClass: "static_framework"
    });
    // a stylistic ### sub-heading inside a chapter is not split into its own section
    expect(first?.sectionMarkdown).toContain("### 補足メモ");
  });

  it("rejects a source with no ## chapter headings", () => {
    const fixture = createPlanningSourceFixture(
      "planning-playbook",
      "# 空のプレイブック\n\n本文のみ、章見出しなし。\n"
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_playbook_no_chapters" })
    );
  });

  it("rejects non-sequential chapter numbering", () => {
    const fixture = createPlanningSourceFixture(
      "planning-playbook",
      "# プレイブック\n\n## 1. 導入\n本文\n\n## 3. 飛び番\n本文\n"
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "business_knowledge_heading_sequence_mismatch" })
    );
  });
});

describe("planning db catalog parsing (editor knowledge, sectioned)", () => {
  it("splits groups into an index layer and entries into a searchable detail layer", () => {
    const fixture = createPlanningCatalogFixture();
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);

    expect(document.sectionCount).toBe(6);
    expect(document.searchSpanCount).toBe(4);
    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "group-a",
      "no-001",
      "no-002",
      "group-b",
      "no-003",
      "x-01"
    ]);

    const groupA = document.sections.find((section) => section.sectionId === "group-a");
    expect(groupA).toMatchObject({
      contentLayer: "index",
      isSearchable: false,
      deliverySectionId: "group-a",
      sectionNumber: null,
      freshnessClass: "static_framework"
    });

    const entry = document.sections.find((section) => section.sectionId === "no-001");
    expect(entry).toMatchObject({
      contentLayer: "detail",
      isSearchable: true,
      deliverySectionId: "no-001",
      sectionNumber: "1",
      freshnessClass: "dated_example"
    });
    expect(entry?.retrievalText).toBe(entry?.sectionMarkdown);
    expect(entry?.retrievalText.startsWith("### No.1 ｜ 最初の企画")).toBe(true);

    const unnumbered = document.sections.find((section) => section.sectionId === "x-01");
    expect(unnumbered).toMatchObject({ sectionNumber: null, contentLayer: "detail", isSearchable: true });
  });

  it("rejects a source with zero ### entries", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      "# 空のカタログ\n\n## グループのみ\nエントリなし。\n"
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_no_entries" })
    );
  });

  it("rejects a duplicate No. across entries", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      [
        "# 重複カタログ",
        "",
        "## グループA",
        "### No.1 ｜ 一つ目",
        "本文",
        "",
        "### No.1 ｜ 重複",
        "本文",
        ""
      ].join("\n")
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "duplicate_business_knowledge_section_id" })
    );
  });

  it("rejects an entry heading that appears before any group heading", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      [
        "# 階層違反カタログ",
        "",
        "### No.1 ｜ グループ前のエントリ",
        "本文",
        "",
        "## グループA",
        "### No.2 ｜ 通常のエントリ",
        "本文",
        ""
      ].join("\n")
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_orphan_entry" })
    );
  });

  it("rejects entries with no ## group heading anywhere in the document", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      [
        "# グループなしカタログ",
        "",
        "### No.1 ｜ グループのないエントリ",
        "本文",
        "",
        "### No.2 ｜ もう一つ",
        "本文",
        ""
      ].join("\n")
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_orphan_entry" })
    );
  });

  it("rejects a document with no ## or ### headings at all", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      "# 見出しが一切ないカタログ\n\n本文だけがある。\n"
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_no_entries" })
    );
  });

  it("rejects a heading level deeper than ### inside the catalog", () => {
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      [
        "# 深すぎる見出しカタログ",
        "",
        "## グループA",
        "### No.1 ｜ 通常のエントリ",
        "#### 深すぎる小見出し",
        "本文",
        ""
      ].join("\n")
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_heading_level_invalid" })
    );
  });

  it("rejects more than 10 group headings", () => {
    const groups = Array.from({ length: 11 }, (_, index) => {
      return [`## グループ${index + 1}`, `### No.${index + 1} ｜ エントリ${index + 1}`, "本文", ""].join("\n");
    }).join("\n");
    const fixture = createPlanningSourceFixture(
      "planning-catalog",
      `# 群が多すぎるカタログ\n\n${groups}`
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "planning_catalog_too_many_groups" })
    );
  });
});

describe("planning fulltext parsing (editor knowledge, sectioned)", () => {
  it("splits a preamble, numbered entries, and a no-number entry, keeping the source verbatim", () => {
    const fixture = createPlanningFulltextFixture();
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);

    expect(document.sectionCount).toBe(4);
    expect(document.searchSpanCount).toBe(3);
    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "preamble",
      "no-097",
      "no-098",
      "x-01"
    ]);

    const preamble = document.sections.find((section) => section.sectionId === "preamble");
    expect(preamble).toMatchObject({
      contentLayer: "index",
      isSearchable: false,
      freshnessClass: "static_framework"
    });
    expect(preamble?.directMarkdown).toContain("コンテンツ企画案DBの根拠ノート本文");

    const entry = document.sections.find((section) => section.sectionId === "no-097");
    expect(entry).toMatchObject({
      contentLayer: "detail",
      isSearchable: true,
      deliverySectionId: "no-097",
      sectionNumber: "97",
      freshnessClass: "dated_example"
    });
    expect(entry?.retrievalText).toBe(entry?.sectionMarkdown);
    expect(entry?.retrievalText.startsWith("## No.97 ｜ 最初の企画")).toBe(true);
    // a ### sub-heading inside an entry (part of the fixed document format) is not a boundary
    expect(entry?.sectionMarkdown).toContain("### 根拠ノート全文（マスキング済み）");

    const unnumbered = document.sections.find((section) => section.sectionId === "x-01");
    expect(unnumbered).toMatchObject({ sectionNumber: null, contentLayer: "detail", isSearchable: true });
  });

  it("does not treat unpatterned headings of any level, or a fenced entry-shaped line, as boundaries", () => {
    const markdown = [
      "# 見出しノイズ入り全文集",
      "前書き行。",
      "",
      "## No.1 ｜ 一つ目",
      "本文中に見出しっぽい行が混ざる。",
      "",
      "## 小見出し（境界ではない）",
      "これは本文の一部。",
      "",
      "### さらに深い見出し",
      "これも本文。",
      "",
      "#### もっと深い",
      "本文。",
      "",
      "```",
      "コードフェンス内のダミー:",
      "## No.9 ｜ dummy",
      "```",
      "",
      "## No.2 ｜ 二つ目",
      "本文2。",
      ""
    ].join("\n");
    const fixture = createPlanningSourceFixture("planning-fulltext-1", markdown);
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);

    expect(document.sections.map((section) => section.sectionId)).toEqual([
      "preamble",
      "no-001",
      "no-002"
    ]);
    const first = document.sections.find((section) => section.sectionId === "no-001");
    expect(first?.sectionMarkdown).toContain("## 小見出し（境界ではない）");
    expect(first?.sectionMarkdown).toContain("### さらに深い見出し");
    expect(first?.sectionMarkdown).toContain("#### もっと深い");
    expect(first?.sectionMarkdown).toContain("## No.9 ｜ dummy");
  });

  it("rejects a duplicate No. across entries", () => {
    const fixture = createPlanningSourceFixture(
      "planning-fulltext-1",
      [
        "# 重複全文集",
        "",
        "## No.1 ｜ 一つ目",
        "本文",
        "",
        "## No.1 ｜ 重複",
        "本文",
        ""
      ].join("\n")
    );
    expect(() => parseEditorKnowledgeSectionedMarkdown(fixture)).toThrow(
      expect.objectContaining({ code: "duplicate_business_knowledge_section_id" })
    );
  });

  it("does not error on zero entries", () => {
    const fixture = createPlanningSourceFixture(
      "planning-fulltext-1",
      "# エントリなし全文集\n\n見出しのないただの本文。\n"
    );
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);
    expect(document.sectionCount).toBe(1);
    expect(document.sections[0]).toMatchObject({ sectionId: "preamble", isSearchable: false });
  });

  it("produces no preamble section when the first entry immediately follows the title", () => {
    const fixture = createPlanningSourceFixture(
      "planning-fulltext-1",
      ["# 前書きなし全文集", "", "## No.1 ｜ 一つ目", "本文", ""].join("\n")
    );
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);
    expect(document.sectionCount).toBe(1);
    expect(document.sections[0]).toMatchObject({ sectionId: "no-001" });
  });

  it("keeps a body-less entry (heading line only) as a single-line section", () => {
    const fixture = createPlanningSourceFixture(
      "planning-fulltext-1",
      ["# 空エントリ全文集", "", "## No.1 ｜ 本文なし", "## No.2 ｜ 次のエントリ", "本文2。", ""].join("\n")
    );
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);
    const first = document.sections.find((section) => section.sectionId === "no-001");
    expect(first?.sectionMarkdown).toBe("## No.1 ｜ 本文なし");
  });

  it("accepts an entry approaching 70KB without hitting the storage guard", () => {
    const longBody = "本文の一行。".repeat(7000); // well over 70,000 bytes in UTF-8
    const fixture = createPlanningSourceFixture(
      "planning-fulltext-1",
      ["# 長文全文集", "", "## No.1 ｜ 長い企画", longBody, "", "## No.2 ｜ 次の企画", "本文2。", ""].join("\n")
    );
    const document = parseEditorKnowledgeSectionedMarkdown(fixture);
    const first = document.sections.find((section) => section.sectionId === "no-001");
    expect(Buffer.byteLength(first?.sectionMarkdown ?? "", "utf8")).toBeGreaterThan(70_000);
  });
});
