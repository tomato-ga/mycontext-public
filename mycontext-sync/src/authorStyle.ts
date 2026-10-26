import { sha256 } from "./hash.js";
import { parseAuthorStyleRoutingManifest } from "./authorStyleRouting.js";
import { AppError } from "./types.js";

export const TITLE_PARSER_VERSION = "author-style-parser-v2";
export const AUTHOR_STYLE_SECTIONING_VERSION = "semantic-delivery-v1";
export const TITLE_ROUTING_VERSION = "single-context-pack-v1";
export const BODY_PARSER_VERSION = "author-style-parser-v4";
export const BODY_ROUTING_VERSION = "single-context-pack-v3";

const MEDIUMTEXT_MAX_BYTES = 16_777_215;

export const AUTHOR_STYLE_DOCUMENT_IDS = ["example-title-style", "example-body-style"] as const;
export type AuthorStyleDocumentId = typeof AUTHOR_STYLE_DOCUMENT_IDS[number];
export type AuthorStyleScope = "title" | "body";
export type AuthorStyleContentLayer = "runtime" | "profile" | "evaluation" | "evidence" | "ops";

export interface AuthorStyleDocumentDefinition {
  documentId: AuthorStyleDocumentId;
  authorKey: "example-author";
  styleScope: AuthorStyleScope;
}

export interface AuthorStyleSection {
  documentId: AuthorStyleDocumentId;
  revisionSha256: string;
  sectionId: string;
  contextKey: string | null;
  parentSectionId: string | null;
  deliverySectionId: string;
  sectionType: "delivery" | "search_span";
  contentLayer: AuthorStyleContentLayer;
  contextPriority: number;
  headingLevel: number | null;
  title: string;
  headingPath: string[];
  aliases: string[];
  ordinal: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  contentChars: number;
  estimatedTokens: number | null;
  directMarkdown: string;
  deliveryMarkdown: string;
  retrievalText: string;
  contentSha256: string;
  isSearchable: boolean;
}

export interface LoadedAuthorStyleDocument {
  documentId: AuthorStyleDocumentId;
  authorKey: "example-author";
  styleScope: AuthorStyleScope;
  displayName: string;
  sourcePathKey: string;
  sourceMarkdown: string;
  sourceMarkdownSha256: string;
  sourceBytes: number;
  sourceLineCount: number;
  sourceMtimeMs: number;
  revisionSha256: string;
  parserVersion: string;
  sectioningVersion: string;
  routingVersion: string;
  routingManifest: Record<string, unknown>;
  outline: Record<string, unknown>;
  sectionCount: number;
  deliverySectionCount: number;
  searchSpanCount: number;
  sections: AuthorStyleSection[];
}

export interface AuthorStyleMarkdownInput {
  source: AuthorStyleDocumentDefinition;
  markdown: string;
  sourcePathKey: string;
  sourceMtimeMs: number;
  sourceBytes?: number;
}

interface Heading {
  level: number;
  title: string;
  line: number;
}

interface ParsedSection extends Omit<
  AuthorStyleSection,
  "documentId" | "revisionSha256" | "ordinal" | "contentSha256"
> {}

interface BodyDefinition {
  contextKey: string;
  contentLayer: AuthorStyleContentLayer;
  priority: number;
}

export const AUTHOR_STYLE_DOCUMENTS: readonly AuthorStyleDocumentDefinition[] = [
  {
    documentId: "example-title-style",
    authorKey: "example-author",
    styleScope: "title"
  },
  {
    documentId: "example-body-style",
    authorKey: "example-author",
    styleScope: "body"
  }
];

const TITLE_MODE_KEYS = {
  news: ["example-title/mode/news"],
  "reaction-explanation": ["example-title/mode/reaction-explanation"],
  uncertainty: ["example-title/mode/uncertainty"],
  experience: ["example-title/mode/experience"],
  interview: ["example-title/mode/interview"],
  practical: ["example-title/mode/practical"],
  sale: ["example-title/mode/sale"],
  narrative: ["example-title/mode/narrative"]
} as const;

const BODY_MODE_KEYS = {
  "short-news": ["example-body/composition/short-news"],
  explanatory: ["example-body/composition/explanatory"],
  review: ["example-body/composition/review"],
  interview: ["example-body/composition/interview"],
  translation: ["example-body/composition/translation"]
} as const;

export function parseAuthorStyleMarkdown(
  input: AuthorStyleMarkdownInput
): LoadedAuthorStyleDocument {
  const { source, markdown } = input;
  if (!Number.isFinite(input.sourceMtimeMs) || input.sourceMtimeMs < 0) {
    throw new AppError(
      "author_style_invalid_source_mtime",
      `author style source mtime is invalid: ${source.documentId}`,
      3
    );
  }
  if (markdown.trim().length === 0 || markdown.includes("\0")) {
    throw new AppError(
      "author_style_invalid_markdown",
      `author style source is empty or contains NUL: ${source.documentId}`,
      3
    );
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = splitContentLines(normalized);
  const headings = scanMarkdownHeadings(lines);
  const displayName = requireDocumentTitle(headings, source.documentId);
  const parsed = source.styleScope === "title"
    ? parseTitleStyle(displayName, lines, headings)
    : parseBodyStyle(displayName, lines, headings);
  const parserVersion = source.styleScope === "body"
    ? BODY_PARSER_VERSION
    : TITLE_PARSER_VERSION;
  const routingVersion = source.styleScope === "body"
    ? BODY_ROUTING_VERSION
    : TITLE_ROUTING_VERSION;
  const routingManifest = source.styleScope === "title"
    ? titleRoutingManifest()
    : bodyRoutingManifest();
  parseAuthorStyleRoutingManifest(routingManifest);
  assertRoutingReferences(parsed, routingManifest, source.documentId);

  const sourceMarkdownSha256 = sha256(markdown);
  const revisionSha256 = sha256([
    sourceMarkdownSha256,
    parserVersion,
    AUTHOR_STYLE_SECTIONING_VERSION,
    routingVersion,
    JSON.stringify(routingManifest)
  ].join("\0"));
  const sections = parsed.map((section, index) => ({
    ...section,
    documentId: source.documentId,
    revisionSha256,
    ordinal: index + 1,
    contentSha256: sha256(section.directMarkdown)
  }));
  assertSections(sections, source.documentId);
  assertStorageLimits(markdown, sections);

  const deliverySectionCount = sections.filter((section) => section.sectionType === "delivery").length;
  const searchSpanCount = sections.filter((section) => section.sectionType === "search_span").length;
  return {
    documentId: source.documentId,
    authorKey: source.authorKey,
    styleScope: source.styleScope,
    displayName,
    sourcePathKey: input.sourcePathKey,
    sourceMarkdown: markdown,
    sourceMarkdownSha256,
    sourceBytes: input.sourceBytes ?? new TextEncoder().encode(markdown).byteLength,
    sourceLineCount: lines.length,
    sourceMtimeMs: Math.trunc(input.sourceMtimeMs),
    revisionSha256,
    parserVersion,
    sectioningVersion: AUTHOR_STYLE_SECTIONING_VERSION,
    routingVersion,
    routingManifest,
    outline: {
      headings: headings.map((heading) => ({
        level: heading.level,
        title: heading.title,
        line: heading.line
      }))
    },
    sectionCount: sections.length,
    deliverySectionCount,
    searchSpanCount,
    sections
  };
}

function parseTitleStyle(documentTitle: string, lines: string[], headings: Heading[]): ParsedSection[] {
  const h2s = headings.filter((heading) => heading.level === 2);
  const sections: ParsedSection[] = [];
  const foundKeys: string[] = [];

  for (let index = 0; index < h2s.length; index += 1) {
    const h2 = h2s[index];
    const nextLine = h2s[index + 1]?.line ?? lines.length + 1;
    const children = headings.filter((heading) => {
      return heading.level === 3 && heading.line > h2.line && heading.line < nextLine;
    });
    const directEnd = children[0]?.line ? children[0].line - 1 : nextLine - 1;
    const directMarkdown = sliceLines(lines, h2.line, directEnd);
    const deliveryMarkdown = sliceLines(lines, h2.line, nextLine - 1);
    const contextKey = extractContextKey(directMarkdown, h2.title);
    const sectionId = sectionIdFromContextKey(contextKey);
    const classification = classifyTitleContextKey(contextKey);
    foundKeys.push(contextKey);
    sections.push(buildParsedSection({
      sectionId,
      contextKey,
      parentSectionId: null,
      deliverySectionId: sectionId,
      sectionType: "delivery",
      contentLayer: classification.layer,
      contextPriority: classification.priority,
      headingLevel: 2,
      title: h2.title,
      headingPath: [documentTitle, h2.title],
      aliases: [h2.title, contextKey],
      sourceLineStart: h2.line,
      sourceLineEnd: nextLine - 1,
      directMarkdown,
      deliveryMarkdown,
      isSearchable: true
    }));

    const usedChildIds = new Set<string>();
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      const childNextLine = children[childIndex + 1]?.line ?? nextLine;
      const childMarkdown = sliceLines(lines, child.line, childNextLine - 1);
      const childId = uniqueChildId(sectionId, child.title, usedChildIds);
      sections.push(buildParsedSection({
        sectionId: childId,
        contextKey: null,
        parentSectionId: sectionId,
        deliverySectionId: sectionId,
        sectionType: "search_span",
        contentLayer: classification.layer,
        contextPriority: classification.priority,
        headingLevel: 3,
        title: child.title,
        headingPath: [documentTitle, h2.title, child.title],
        aliases: [child.title],
        sourceLineStart: child.line,
        sourceLineEnd: childNextLine - 1,
        directMarkdown: childMarkdown,
        deliveryMarkdown,
        isSearchable: true
      }));
    }
  }

  const expected = [
    "example-title/bootstrap",
    "example-title/core",
    "example-title/input-contract",
    "example-title/router",
    ...Object.values(TITLE_MODE_KEYS).flat(),
    "example-title/notation",
    "example-title/anti-patterns",
    "example-title/evaluator",
    "example-title/output-contract",
    "example-title/retrieval-ops",
    "example-title/maintenance",
    "example-title/evidence"
  ];
  if (JSON.stringify(foundKeys) !== JSON.stringify(expected)) {
    throw new AppError(
      "author_style_title_context_contract_mismatch",
      `example-title-style context keys changed; expected ${expected.join(", ")}, got ${foundKeys.join(", ")}`,
      3
    );
  }
  return sections;
}

function parseBodyStyle(
  documentTitle: string,
  lines: string[],
  headings: Heading[]
): ParsedSection[] {
  const h2s = headings.filter((heading) => heading.level === 2);
  const expectedTitles = [
    "1. 基本リズム",
    "2. 文体・語尾",
    "3. 会話性と人称",
    "4. 接続と論理の運び方",
    "5. 不確実性・評価・感情",
    "6. 疑問・感嘆・記号",
    "7. 冒頭の作り方",
    "8. 本論の組み立て",
    "9. 結びの作り方",
    "10. 読者への距離",
    "11. 公開本文の構造要素",
    "12. 本文生成のスタイル契約",
    "13. 本文評価チェックリスト",
    "14. 長文記事の特長"
  ];
  const actualTitles = h2s.map((heading) => heading.title);
  if (JSON.stringify(actualTitles) !== JSON.stringify(expectedTitles)) {
    throw new AppError(
      "author_style_body_outline_mismatch",
      `example-body-style H2 outline changed; expected ${expectedTitles.join(", ")}, got ${actualTitles.join(", ")}`,
      3
    );
  }

  const definitions: Record<number, BodyDefinition> = {
    1: { contextKey: "example-body/core/rhythm", contentLayer: "runtime", priority: 95 },
    2: { contextKey: "example-body/core/tone", contentLayer: "runtime", priority: 95 },
    3: { contextKey: "example-body/core/person", contentLayer: "runtime", priority: 90 },
    4: { contextKey: "example-body/core/logic", contentLayer: "runtime", priority: 95 },
    5: { contextKey: "example-body/core/certainty-emotion", contentLayer: "runtime", priority: 95 },
    6: { contextKey: "example-body/core/notation", contentLayer: "runtime", priority: 90 },
    7: { contextKey: "example-body/structure/opening", contentLayer: "runtime", priority: 95 },
    9: { contextKey: "example-body/structure/closing", contentLayer: "runtime", priority: 95 },
    10: { contextKey: "example-body/reader-distance", contentLayer: "runtime", priority: 85 },
    11: {
      contextKey: "example-body/evidence/structure-elements",
      contentLayer: "evidence",
      priority: 35
    },
    12: { contextKey: "example-body/contract", contentLayer: "runtime", priority: 100 },
    13: { contextKey: "example-body/evaluator", contentLayer: "evaluation", priority: 100 }
  };
  const sections: ParsedSection[] = [];

  for (let index = 0; index < h2s.length; index += 1) {
    const h2 = h2s[index];
    const nextLine = h2s[index + 1]?.line ?? lines.length + 1;
    const chapter = bodyChapterNumber(h2.title);
    const children = headings.filter((heading) => {
      return heading.level === 3 && heading.line > h2.line && heading.line < nextLine;
    });

    if (chapter === 8) {
      parseBodyCompositionDeliveries(
        documentTitle,
        lines,
        h2,
        nextLine,
        children,
        sections
      );
      continue;
    }
    if (chapter === 14) {
      parseBodyLongformDeliveries(
        documentTitle,
        lines,
        h2,
        nextLine,
        children,
        sections
      );
      continue;
    }

    const definition = chapter === null ? undefined : definitions[chapter];
    if (definition === undefined) {
      throw new AppError(
        "author_style_body_heading_unmapped",
        `unmapped body H2 heading: ${h2.title}`,
        3
      );
    }
    appendBodyDeliveryWithSearchSpans({
      documentTitle,
      lines,
      h2,
      nextLine,
      children,
      definition,
      sections
    });
  }
  return sections;
}

function appendBodyDeliveryWithSearchSpans(input: {
  documentTitle: string;
  lines: string[];
  h2: Heading;
  nextLine: number;
  children: Heading[];
  definition: BodyDefinition;
  sections: ParsedSection[];
}): void {
  const { documentTitle, lines, h2, nextLine, children, definition, sections } = input;
  const sectionId = sectionIdFromContextKey(definition.contextKey);
  const deliveryMarkdown = sliceLines(lines, h2.line, nextLine - 1);
  const directEnd = children[0]?.line ? children[0].line - 1 : nextLine - 1;
  sections.push(buildParsedSection({
    sectionId,
    contextKey: definition.contextKey,
    parentSectionId: null,
    deliverySectionId: sectionId,
    sectionType: "delivery",
    contentLayer: definition.contentLayer,
    contextPriority: definition.priority,
    headingLevel: 2,
    title: h2.title,
    headingPath: [documentTitle, h2.title],
    aliases: [h2.title, definition.contextKey],
    sourceLineStart: h2.line,
    sourceLineEnd: nextLine - 1,
    directMarkdown: sliceLines(lines, h2.line, directEnd),
    deliveryMarkdown,
    isSearchable: true
  }));

  const usedChildIds = new Set<string>();
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    const childNextLine = children[childIndex + 1]?.line ?? nextLine;
    const childMarkdown = sliceLines(lines, child.line, childNextLine - 1);
    const childId = uniqueChildId(sectionId, child.title, usedChildIds);
    sections.push(buildParsedSection({
      sectionId: childId,
      contextKey: null,
      parentSectionId: sectionId,
      deliverySectionId: sectionId,
      sectionType: "search_span",
      contentLayer: definition.contentLayer,
      contextPriority: definition.priority,
      headingLevel: 3,
      title: child.title,
      headingPath: [documentTitle, h2.title, child.title],
      aliases: [child.title],
      sourceLineStart: child.line,
      sourceLineEnd: childNextLine - 1,
      directMarkdown: childMarkdown,
      deliveryMarkdown,
      isSearchable: true
    }));
  }
}

function parseBodyCompositionDeliveries(
  documentTitle: string,
  lines: string[],
  h2: Heading,
  nextLine: number,
  children: Heading[],
  sections: ParsedSection[]
): void {
  const expectedTitles = [
    "8.1 標準記事",
    "8.2 レビュー・体験",
    "8.3 インタビュー・長文",
    "8.4 翻訳・紹介"
  ];
  assertChildOutline("compact composition", children, expectedTitles);
  const definitions = [
    [
      { contextKey: "example-body/composition/short-news", contentLayer: "runtime", priority: 90 },
      { contextKey: "example-body/composition/explanatory", contentLayer: "runtime", priority: 90 }
    ],
    [{ contextKey: "example-body/composition/review", contentLayer: "runtime", priority: 90 }],
    [{ contextKey: "example-body/composition/interview", contentLayer: "runtime", priority: 90 }],
    [{ contextKey: "example-body/composition/translation", contentLayer: "runtime", priority: 90 }]
  ] satisfies BodyDefinition[][];

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    const childNextLine = children[childIndex + 1]?.line ?? nextLine;
    const markdown = sliceLines(lines, child.line, childNextLine - 1);
    for (const definition of definitions[childIndex] ?? []) {
      const sectionId = sectionIdFromContextKey(definition.contextKey);
      sections.push(buildParsedSection({
        sectionId,
        contextKey: definition.contextKey,
        parentSectionId: null,
        deliverySectionId: sectionId,
        sectionType: "delivery",
        contentLayer: definition.contentLayer,
        contextPriority: definition.priority,
        headingLevel: 3,
        title: child.title,
        headingPath: [documentTitle, h2.title, child.title],
        aliases: [child.title, definition.contextKey],
        sourceLineStart: child.line,
        sourceLineEnd: childNextLine - 1,
        directMarkdown: markdown,
        deliveryMarkdown: markdown,
        isSearchable: true
      }));
    }
  }
}

function parseBodyLongformDeliveries(
  documentTitle: string,
  lines: string[],
  h2: Heading,
  nextLine: number,
  children: Heading[],
  sections: ParsedSection[]
): void {
  const expectedTitles = [
    "14.1 長文の基本方針",
    "14.2 伝聞と自分の判断を分ける",
    "14.3 長文の熱量は、問いと検討で作る",
    "14.4 見出しは「話題名」ではなく「読者の判断軸」にする",
    "14.5 長文記事専用のスタイル契約",
    "14.6 長文で避けること"
  ];
  assertChildOutline("compact longform", children, expectedTitles);

  const contract = children[4];
  const antiPatterns = children[5];
  if (contract === undefined || antiPatterns === undefined) {
    throw new AppError(
      "author_style_compact_body_longform_missing",
      "compact longform contract or anti-patterns section is missing",
      3
    );
  }

  const guidanceDefinition: BodyDefinition = {
    contextKey: "example-body/longform/guidance",
    contentLayer: "runtime",
    priority: 90
  };
  const guidanceSectionId = sectionIdFromContextKey(guidanceDefinition.contextKey);
  const guidanceMarkdown = sliceLines(lines, h2.line, contract.line - 1);
  sections.push(buildParsedSection({
    sectionId: guidanceSectionId,
    contextKey: guidanceDefinition.contextKey,
    parentSectionId: null,
    deliverySectionId: guidanceSectionId,
    sectionType: "delivery",
    contentLayer: guidanceDefinition.contentLayer,
    contextPriority: guidanceDefinition.priority,
    headingLevel: 2,
    title: h2.title,
    headingPath: [documentTitle, h2.title],
    aliases: [h2.title, guidanceDefinition.contextKey],
    sourceLineStart: h2.line,
    sourceLineEnd: contract.line - 1,
    directMarkdown: sliceLines(lines, h2.line, children[0]?.line ? children[0].line - 1 : contract.line - 1),
    deliveryMarkdown: guidanceMarkdown,
    isSearchable: true
  }));

  const usedChildIds = new Set<string>();
  for (let childIndex = 0; childIndex < 4; childIndex += 1) {
    const child = children[childIndex];
    if (child === undefined) continue;
    const childNextLine = children[childIndex + 1]?.line ?? contract.line;
    const childId = uniqueChildId(guidanceSectionId, child.title, usedChildIds);
    sections.push(buildParsedSection({
      sectionId: childId,
      contextKey: null,
      parentSectionId: guidanceSectionId,
      deliverySectionId: guidanceSectionId,
      sectionType: "search_span",
      contentLayer: guidanceDefinition.contentLayer,
      contextPriority: guidanceDefinition.priority,
      headingLevel: 3,
      title: child.title,
      headingPath: [documentTitle, h2.title, child.title],
      aliases: [child.title],
      sourceLineStart: child.line,
      sourceLineEnd: childNextLine - 1,
      directMarkdown: sliceLines(lines, child.line, childNextLine - 1),
      deliveryMarkdown: guidanceMarkdown,
      isSearchable: true
    }));
  }

  for (const [child, definition] of [
    [
      contract,
      { contextKey: "example-body/longform/contract", contentLayer: "runtime", priority: 95 }
    ],
    [
      antiPatterns,
      {
        contextKey: "example-body/longform/anti-patterns",
        contentLayer: "evaluation",
        priority: 95
      }
    ]
  ] satisfies Array<[Heading, BodyDefinition]>) {
    const childNextLine = child === contract ? antiPatterns.line : nextLine;
    const sectionId = sectionIdFromContextKey(definition.contextKey);
    const markdown = sliceLines(lines, child.line, childNextLine - 1);
    sections.push(buildParsedSection({
      sectionId,
      contextKey: definition.contextKey,
      parentSectionId: null,
      deliverySectionId: sectionId,
      sectionType: "delivery",
      contentLayer: definition.contentLayer,
      contextPriority: definition.priority,
      headingLevel: 3,
      title: child.title,
      headingPath: [documentTitle, h2.title, child.title],
      aliases: [child.title, definition.contextKey],
      sourceLineStart: child.line,
      sourceLineEnd: childNextLine - 1,
      directMarkdown: markdown,
      deliveryMarkdown: markdown,
      isSearchable: true
    }));
  }
}

function assertChildOutline(label: string, children: Heading[], expectedTitles: string[]): void {
  const actualTitles = children.map((child) => child.title);
  if (JSON.stringify(actualTitles) !== JSON.stringify(expectedTitles)) {
    throw new AppError(
      "author_style_body_child_outline_mismatch",
      `${label} H3 outline changed; expected ${expectedTitles.join(", ")}, got ${actualTitles.join(", ")}`,
      3
    );
  }
}

function titleRoutingManifest(): Record<string, unknown> {
  return {
    schemaVersion: TITLE_ROUTING_VERSION,
    selectorSchema: {
      operations: ["generate", "evaluate"],
      modes: Object.keys(TITLE_MODE_KEYS),
      profiles: ["neutral", "classic", "modern"]
    },
    modeMap: TITLE_MODE_KEYS,
    operations: {
      generate: {
        base: [
          "example-title/bootstrap",
          "example-title/input-contract",
          "example-title/core",
          "example-title/notation",
          "example-title/evaluator",
          "example-title/output-contract"
        ]
      },
      evaluate: {
        base: ["example-title/core", "example-title/anti-patterns", "example-title/evaluator"]
      }
    },
    profileMap: {
      neutral: [],
      classic: ["example-title/router"],
      modern: ["example-title/router"]
    },
    maxContextChars: 45_000,
    overflowPolicy: "error_no_truncation"
  };
}

function bodyRoutingManifest(): Record<string, unknown> {
  return {
    schemaVersion: BODY_ROUTING_VERSION,
    selectorSchema: {
      operations: ["generate", "edit-voice", "edit-structure", "evaluate"],
      modes: Object.keys(BODY_MODE_KEYS),
      lengthBands: ["le600", "601-1000", "1001-2000", "2001plus"],
      profiles: ["neutral", "classic", "modern", "media-specific"]
    },
    modeMap: BODY_MODE_KEYS,
    operations: {
      generate: {
        base: [
          "example-body/contract",
          "example-body/core/rhythm",
          "example-body/core/tone",
          "example-body/core/logic",
          "example-body/core/certainty-emotion",
          "example-body/core/notation",
          "example-body/structure/opening",
          "example-body/structure/closing",
          "example-body/evaluator"
        ]
      },
      "edit-voice": {
        base: [
          "example-body/contract",
          "example-body/core/rhythm",
          "example-body/core/tone",
          "example-body/core/person",
          "example-body/core/certainty-emotion",
          "example-body/core/notation",
          "example-body/reader-distance",
          "example-body/evaluator"
        ]
      },
      "edit-structure": {
        base: [
          "example-body/contract",
          "example-body/structure/opening",
          "example-body/structure/closing",
          "example-body/evaluator"
        ]
      },
      evaluate: {
        base: ["example-body/contract", "example-body/evaluator"]
      }
    },
    lengthBandMap: {
      le600: [],
      "601-1000": ["example-body/longform/guidance", "example-body/longform/contract"],
      "1001-2000": ["example-body/longform/guidance", "example-body/longform/contract"],
      "2001plus": [
        "example-body/longform/guidance",
        "example-body/longform/contract",
        "example-body/longform/anti-patterns"
      ]
    },
    profileMap: {
      neutral: [],
      classic: [],
      modern: [],
      "media-specific": []
    },
    maxContextChars: 45_000,
    overflowPolicy: "error_no_truncation"
  };
}

function buildParsedSection(input: Omit<ParsedSection, "contentChars" | "estimatedTokens" | "retrievalText">): ParsedSection {
  return {
    ...input,
    contentChars: input.deliveryMarkdown.length,
    estimatedTokens: null,
    retrievalText: contextualize(input.headingPath, input.directMarkdown)
  };
}

function classifyTitleContextKey(contextKey: string): {
  layer: AuthorStyleContentLayer;
  priority: number;
} {
  if (contextKey === "example-title/evidence") return { layer: "evidence", priority: 20 };
  if (contextKey === "example-title/retrieval-ops" || contextKey === "example-title/maintenance") {
    return { layer: "ops", priority: 20 };
  }
  if (contextKey === "example-title/anti-patterns" || contextKey === "example-title/evaluator") {
    return { layer: "evaluation", priority: 95 };
  }
  return { layer: "runtime", priority: contextKey === "example-title/core" ? 100 : 90 };
}

function assertRoutingReferences(
  sections: ParsedSection[],
  manifest: Record<string, unknown>,
  documentId: string
): void {
  const available = new Set(
    sections.flatMap((section) => section.contextKey === null ? [] : [section.contextKey])
  );
  const referenced = collectContextKeys(manifest);
  const missing = [...referenced].filter((key) => !available.has(key));
  if (missing.length > 0) {
    throw new AppError(
      "author_style_routing_reference_missing",
      `${documentId} routing references missing context keys: ${missing.join(", ")}`,
      3
    );
  }
}

function collectContextKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.startsWith("example-title/") || value.startsWith("example-body/")) found.add(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectContextKeys(item, found);
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectContextKeys(item, found);
  }
  return found;
}

function assertSections(sections: AuthorStyleSection[], documentId: string): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const section of sections) {
    if (!/^[A-Za-z0-9._~-]+$/.test(section.sectionId)) {
      throw new AppError("author_style_invalid_section_id", `invalid section id: ${section.sectionId}`, 3);
    }
    if (ids.has(section.sectionId)) {
      throw new AppError("author_style_duplicate_section_id", `duplicate section id: ${section.sectionId}`, 3);
    }
    ids.add(section.sectionId);
    if (section.contextKey !== null) {
      if (keys.has(section.contextKey)) {
        throw new AppError(
          "author_style_duplicate_context_key",
          `duplicate context key: ${section.contextKey}`,
          3
        );
      }
      keys.add(section.contextKey);
    }
  }
  for (const section of sections) {
    if (!ids.has(section.deliverySectionId)) {
      throw new AppError(
        "author_style_missing_delivery_section",
        `${documentId} section ${section.sectionId} references missing delivery ${section.deliverySectionId}`,
        3
      );
    }
  }
}

function assertStorageLimits(markdown: string, sections: AuthorStyleSection[]): void {
  if (Buffer.byteLength(markdown, "utf8") > MEDIUMTEXT_MAX_BYTES) {
    throw new AppError("author_style_document_too_large", "author style document exceeds MEDIUMTEXT", 3);
  }
  for (const section of sections) {
    for (const [field, value] of [
      ["direct_markdown", section.directMarkdown],
      ["delivery_markdown", section.deliveryMarkdown],
      ["retrieval_text", section.retrievalText]
    ] as const) {
      if (Buffer.byteLength(value, "utf8") > MEDIUMTEXT_MAX_BYTES) {
        throw new AppError(
          "author_style_section_too_large",
          `${section.sectionId} ${field} exceeds MEDIUMTEXT`,
          3
        );
      }
    }
  }
}

function extractContextKey(markdown: string, title: string): string {
  const match = /`context-key:\s*([^`\s]+)\s*`/.exec(markdown);
  if (match?.[1] === undefined) {
    throw new AppError(
      "author_style_context_key_missing",
      `missing context-key under title section: ${title}`,
      3
    );
  }
  return match[1];
}

function bodyChapterNumber(title: string): number | null {
  const match = /^(\d+)\.\s/.exec(title);
  return match?.[1] === undefined ? null : Number(match[1]);
}

function sectionIdFromContextKey(contextKey: string): string {
  return contextKey.replace(/^example-(?:title|body)\//, "").replace(/\//g, "--");
}

function uniqueChildId(parentId: string, title: string, used: Set<string>): string {
  const base = `${parentId}--${asciiSlug(title)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function asciiSlug(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized.length > 0 ? normalized : `section-${sha256(value).slice(0, 12)}`;
}

function scanMarkdownHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch?.[1] !== undefined) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    headings.push({ level: match[1].length, title: match[2], line: index + 1 });
  }
  return headings;
}

function requireDocumentTitle(headings: Heading[], documentId: string): string {
  const h1 = headings.find((heading) => heading.level === 1);
  if (h1 === undefined) {
    throw new AppError("author_style_title_missing", `missing H1 for ${documentId}`, 3);
  }
  return h1.title;
}

function splitContentLines(markdown: string): string[] {
  const lines = markdown.split("\n");
  if (markdown.endsWith("\n")) lines.pop();
  return lines;
}

function sliceLines(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join("\n");
}

function contextualize(pathParts: string[], markdown: string): string {
  return `${pathParts.join(" > ")}\n\n${markdown}`;
}
