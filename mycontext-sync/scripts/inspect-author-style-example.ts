import fs from "node:fs/promises";
import { AUTHOR_STYLE_DOCUMENTS, parseAuthorStyleMarkdown } from "../src/authorStyle.js";
import {
  buildAuthorStyleContext,
  parseAuthorStyleRoutingManifest
} from "../src/authorStyleRouting.js";

const source = AUTHOR_STYLE_DOCUMENTS.find((document) => document.styleScope === "body")!;
const markdown = await fs.readFile(new URL("../examples/author-style/body.md", import.meta.url), "utf8");
const document = parseAuthorStyleMarkdown({
  source,
  markdown,
  sourcePathKey: "example:body",
  sourceMtimeMs: 0
});
const pack = buildAuthorStyleContext({
  documentId: document.documentId,
  displayName: document.displayName,
  revisionSha256: document.revisionSha256,
  manifest: parseAuthorStyleRoutingManifest(document.routingManifest),
  selectors: {
    operation: "generate",
    mode: "explanatory",
    lengthBand: "2001plus",
    profile: "neutral"
  },
  sections: new Map(document.sections.flatMap((section) => section.contextKey === null
    ? []
    : [[section.contextKey, {
        contextKey: section.contextKey,
        title: section.title,
        markdown: section.deliveryMarkdown
      }] as const]))
});

console.log(JSON.stringify({
  documentId: document.documentId,
  sections: pack.contextKeys.length,
  contextKeys: pack.contextKeys,
  contextChars: pack.contextChars
}, null, 2));
console.log(pack.markdown);
