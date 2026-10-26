import { describe, expect, it } from "vitest";
import {
  canonicalExampleBusinessKnowledgeMarkdown,
  parseExampleBusinessKnowledgeMarkdown
} from "../src/exampleBusinessKnowledge.js";

const parse = (markdown: string) => parseExampleBusinessKnowledgeMarkdown({
  title: "Example business guide",
  markdown,
  sourcePathKey: "notion:example-page",
  sourceMtimeMs: 0
});

describe("example Business Knowledge parser", () => {
  it("keeps H2 delivery sections complete and routes H3 matches to their parent", () => {
    const document = parse("## Plan\nChoose one question.\n\n### Check\nRecord one observation.\n\n## Review\nCompare the result.\n");
    expect(document.documentId).toBe("example-business-guide");
    expect(document.sections).toHaveLength(3);
    expect(document.sections[0].sectionMarkdown).toContain("### Check\nRecord one observation.");
    expect(document.sections[1].deliverySectionId).toBe(document.sections[0].sectionId);
    expect(document.sections[1].parentSectionId).toBe(document.sections[0].sectionId);
    expect(document.sections[2].deliverySectionId).toBe(document.sections[2].sectionId);
  });

  it("restores the Notion title without interpreting fenced example headings", () => {
    const body = "## Plan\n````markdown\n## Code heading\n```\n### Still code\n````\nUse one real section.\n";
    const document = parse(body);
    expect(document.markdown.startsWith("# Example business guide\n")).toBe(true);
    expect(document.sections).toHaveLength(1);
    expect(canonicalExampleBusinessKnowledgeMarkdown("Example guide", "```md\n# Code title\n```\n").startsWith("# Example guide\n")).toBe(true);
  });

  it("rejects an unexpected source title and invalid heading structure", () => {
    expect(() => parse("# Different title\n\n## Plan\nText\n")).toThrow("unexpected H1");
    expect(() => parse("### Orphan\nText\n")).toThrow("requires an H2");
    expect(() => parse("## Plan\nText\0\n")).toThrow("contains NUL");
  });

  it("fails instead of truncating an oversized semantic section", () => {
    expect(() => parse(`## Plan\n${"x".repeat(12_001)}\n`)).toThrow("no truncation was applied");
  });
});
