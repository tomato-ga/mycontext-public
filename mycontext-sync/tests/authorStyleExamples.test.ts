import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AUTHOR_STYLE_DOCUMENTS, parseAuthorStyleMarkdown } from "../src/authorStyle.js";
import {
  buildAuthorStyleContext,
  enumerateAuthorStyleSelectors,
  parseAuthorStyleRoutingManifest
} from "../src/authorStyleRouting.js";

describe("checked-in synthetic author-style examples", () => {
  it("parses both examples and resolves every supported route without truncation or evidence", async () => {
    let routes = 0;
    for (const source of AUTHOR_STYLE_DOCUMENTS) {
      const markdown = await fs.readFile(
        new URL(`../examples/author-style/${source.styleScope}.md`, import.meta.url),
        "utf8"
      );
      const document = parseAuthorStyleMarkdown({
        source,
        markdown,
        sourcePathKey: `example:${source.styleScope}`,
        sourceMtimeMs: 0
      });
      const manifest = parseAuthorStyleRoutingManifest(document.routingManifest);
      const sections = new Map(document.sections.flatMap((section) => section.contextKey === null
        ? []
        : [[section.contextKey, {
            contextKey: section.contextKey,
            title: section.title,
            markdown: section.deliveryMarkdown
          }] as const]));

      for (const selectors of enumerateAuthorStyleSelectors(manifest)) {
        const pack = buildAuthorStyleContext({
          documentId: document.documentId,
          displayName: document.displayName,
          revisionSha256: document.revisionSha256,
          manifest,
          selectors,
          sections
        });
        expect(pack.contextChars).toBeLessThanOrEqual(45_000);
        expect(pack.markdown).not.toContain("EVIDENCE_ONLY_SAMPLE");
        if (source.styleScope === "body"
          && selectors.operation === "generate"
          && selectors.mode === "explanatory"
          && selectors.lengthBand === "2001plus") {
          expect(pack.contextKeys).toHaveLength(13);
        }
        routes += 1;
      }
    }
    expect(routes).toBe(368);
  });
});
