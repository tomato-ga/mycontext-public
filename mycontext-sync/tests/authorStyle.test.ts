import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAuthorStyleDocument,
  type AuthorStyleSource
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
  it("parses all 19 title delivery units and ignores headings inside fences", async () => {
    const { root, source } = await writeSource("title.md", titleMarkdown(), "title");
    const document = await loadAuthorStyleDocument(root, source);

    expect(document.deliverySectionCount).toBe(19);
    expect(document.searchSpanCount).toBe(1);
    expect(document.sectionCount).toBe(20);
    expect(document.sections.filter((section) => section.contextKey !== null)
      .map((section) => section.contextKey)).toEqual(TITLE_KEYS);
    expect(document.sections.some((section) => section.title === "fenced fake heading")).toBe(false);
  });

  it("stores fine-grained body spans but returns every routed context as complete delivery units", async () => {
    const { root, source } = await writeSource("body.md", bodyMarkdown(), "body");
    const document = await loadAuthorStyleDocument(root, source);
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

    expect(document.deliverySectionCount).toBe(41);
    expect(document.searchSpanCount).toBe(1);
    expect(document.sections.find((section) => section.title === "12.1 child")).toMatchObject({
      sectionType: "search_span",
      deliverySectionId: "flow"
    });
    expect(packs).toHaveLength(320);
    expect(packs.every((pack) => pack.contextChars <= manifest.maxContextChars)).toBe(true);
    expect(packs.every((pack) => new Set(pack.contextKeys).size === pack.contextKeys.length)).toBe(true);
  });
});

async function writeSource(
  filename: string,
  markdown: string,
  styleScope: "title" | "body"
): Promise<{ root: string; source: AuthorStyleSource }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "author-style-"));
  await fs.mkdir(path.join(root, "knowledge"));
  await fs.writeFile(path.join(root, "knowledge", filename), markdown);
  return {
    root,
    source: {
      documentId: styleScope === "title" ? "example-title-style" : "example-body-style",
      authorKey: "example-author",
      styleScope,
      relativePath: `knowledge/${filename}`
    }
  };
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

function bodyMarkdown(): string {
  const lines = ["# Body style", "", "## Executive Summary", "", "Summary.", ""];
  for (let chapter = 1; chapter <= 22; chapter += 1) {
    lines.push(`## ${chapter}. Chapter ${chapter}`, "", `Chapter ${chapter} rules.`, "");
    if (chapter === 10 || chapter === 18) {
      for (let child = 1; child <= 5; child += 1) {
        lines.push(`### ${chapter}.${child} mode`, "", `Mode ${child}.`, "");
      }
    }
    if (chapter === 12) lines.push("### 12.1 child", "", "Flow evidence.", "");
    if (chapter === 22) {
      for (let child = 1; child <= 11; child += 1) {
        lines.push(`### 21.${child} longform`, "", `Longform ${child}.`, "");
      }
    }
  }
  return lines.join("\n");
}
