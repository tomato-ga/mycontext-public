import {
  assertStorageLimits,
  assertUniqueSectionIds,
  splitContentLines,
  type BusinessKnowledgeSection,
  type LoadedBusinessKnowledgeDocument
} from "../../mycontext-sync/src/businessKnowledge.js";
import { sha256 } from "./hash.js";
import { hasNonFencedH1 } from "./markdown.js";
import { SyncFailure } from "./types.js";

// The public sample uses an invented guide instead of any private source material.
export const EXAMPLE_BUSINESS_GUIDE_DOCUMENT_ID = "example-business-guide" as const;
export const EXAMPLE_BUSINESS_GUIDE_PARSER_VERSION = "example-business-guide-parser-v1";
export const EXAMPLE_BUSINESS_GUIDE_SECTIONING_VERSION = "semantic-heading-sectioning-v1";

const MAX_DELIVERY_CHARS = 12_000;

interface Heading {
  level: 2 | 3;
  title: string;
  line: number;
}

export interface ExampleBusinessKnowledgeInput {
  title: string;
  markdown: string;
  sourcePathKey: string;
  sourceMtimeMs: number;
}

export function canonicalExampleBusinessKnowledgeMarkdown(title: string, markdown: string): string {
  if (title.trim().length === 0 || /[\r\n\0]/.test(title)) {
    throw new SyncFailure("business_knowledge_title_invalid", "Business Knowledge title must be a single nonempty line");
  }
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const expectedH1 = `# ${title}`;
  if (normalized.startsWith(`${expectedH1}\n`)) {
    return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  }
  if (hasNonFencedH1(normalized)) {
    throw new SyncFailure("business_knowledge_unexpected_h1", "Business Knowledge body contains an unexpected H1");
  }
  return `${expectedH1}\n\n${normalized.trim()}\n`;
}

export function parseExampleBusinessKnowledgeMarkdown(input: ExampleBusinessKnowledgeInput): LoadedBusinessKnowledgeDocument {
  const markdown = canonicalExampleBusinessKnowledgeMarkdown(input.title, input.markdown);
  if (input.markdown.trim().length === 0 || markdown.includes("\0")) {
    throw new SyncFailure("business_knowledge_markdown_invalid", "Business Knowledge body is empty or contains NUL");
  }
  const lines = splitContentLines(markdown);
  const headings = semanticHeadings(lines);
  if (!headings.some((heading) => heading.level === 2) || headings[0]?.level !== 2) {
    throw new SyncFailure("business_knowledge_heading_contract_invalid", "Business Knowledge requires an H2 before any H3");
  }
  const markdownSha256 = sha256(markdown);
  const sectionRevisionSha256 = sha256(`${markdownSha256}\0${EXAMPLE_BUSINESS_GUIDE_PARSER_VERSION}\0${EXAMPLE_BUSINESS_GUIDE_SECTIONING_VERSION}`);
  let parentIndex = 0;
  const sections: BusinessKnowledgeSection[] = headings.map((heading, index) => {
    if (heading.level === 2) parentIndex = index;
    const parent = headings[parentIndex];
    const sectionId = `section-${index + 1}`;
    const deliverySectionId = `section-${parentIndex + 1}`;
    const deliveryEnd = headings.slice(index + 1).find((candidate) => candidate.level === 2)?.line ?? lines.length;
    const nextHeading = headings[index + 1]?.line ?? lines.length;
    const end = heading.level === 2 ? deliveryEnd : nextHeading;
    const sectionMarkdown = lines.slice(heading.line, end).join("\n").trimEnd();
    if (sectionMarkdown.length > MAX_DELIVERY_CHARS) {
      throw new SyncFailure("business_knowledge_delivery_too_large", `${sectionId} exceeds ${MAX_DELIVERY_CHARS} characters; no truncation was applied`);
    }
    const headingPath = heading.level === 2
      ? [input.title, heading.title]
      : [input.title, parent.title, heading.title];
    return {
      documentId: EXAMPLE_BUSINESS_GUIDE_DOCUMENT_ID,
      sectionId,
      sectionRevisionSha256,
      parentSectionId: heading.level === 2 ? null : deliverySectionId,
      deliverySectionId,
      sectionType: "markdown_heading",
      headingLevel: heading.level,
      sectionNumber: null,
      title: heading.title,
      headingPath,
      contentLayer: heading.level === 2 ? "summary" : "detail",
      ordinal: index + 1,
      sourceLineStart: heading.line + 1,
      sourceLineEnd: end,
      directMarkdown: lines.slice(heading.line, nextHeading).join("\n").trimEnd(),
      sectionMarkdown,
      retrievalText: `${headingPath.join(" > ")}\n${sectionMarkdown}`,
      contentSha256: sha256(sectionMarkdown),
      isSearchable: true,
      relatedSourcePath: null,
      freshnessClass: "static_framework"
    };
  });
  assertUniqueSectionIds(sections);
  assertStorageLimits(markdown, sections);
  return {
    documentId: EXAMPLE_BUSINESS_GUIDE_DOCUMENT_ID,
    title: input.title,
    sourcePathKey: input.sourcePathKey,
    sourceKind: "book_summary",
    ingestScope: "full_summary",
    sourceDeclaredAt: null,
    sourceBytes: new TextEncoder().encode(markdown).byteLength,
    sourceLineCount: lines.length,
    sourceMtimeMs: input.sourceMtimeMs,
    markdown,
    markdownSha256,
    sectionRevisionSha256,
    parserVersion: EXAMPLE_BUSINESS_GUIDE_PARSER_VERSION,
    sectioningVersion: EXAMPLE_BUSINESS_GUIDE_SECTIONING_VERSION,
    sectionCount: sections.length,
    searchSpanCount: sections.length,
    outline: { sectionKeys: sections.map((section) => section.sectionId) },
    routingMetadata: { defaultRetrieval: "small_to_big", matchedChildExpandsTo: "delivery_section_id", detailAvailable: true },
    sections
  };
}

function semanticHeadings(lines: readonly string[]): Heading[] {
  const result: Heading[] = [];
  let fence: { character: string; length: number } | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line];
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence !== null) {
      if (marker !== null && marker[1][0] === fence.character && marker[1].length >= fence.length && marker[2].trim() === "") fence = null;
      continue;
    }
    if (marker !== null) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(text);
    if (heading !== null) result.push({ level: heading[1].length as 2 | 3, title: heading[2].trim(), line });
  }
  return result;
}
