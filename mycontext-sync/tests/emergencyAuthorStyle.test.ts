import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHOR_STYLE_DOCUMENTS,
  parseAuthorStyleMarkdown
} from "../src/authorStyle.js";
import {
  loadEmergencyAuthorStyle,
  stableJsonSha256,
  writeEmergencyAuthorStyleSnapshot,
  type EmergencySnapshotMetadata
} from "../src/emergencyAuthorStyle.js";

describe("emergency author-style Markdown", () => {
  it("restores only an intact TiDB current-snapshot artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mycontext-emergency-"));
    const markdown = titleMarkdown();
    const outputPath = path.join(root, "example-title-style-revision.md");
    const source = AUTHOR_STYLE_DOCUMENTS.find(
      (candidate) => candidate.documentId === "example-title-style"
    );
    if (source === undefined) throw new Error("title definition missing");
    const document = parseAuthorStyleMarkdown({
      source,
      markdown,
      sourcePathKey: "notion:page-1",
      sourceMtimeMs: 123
    });

    const result = await writeEmergencyAuthorStyleSnapshot({
      outputPath,
      markdown,
      metadata: metadataFor(document)
    });

    await expect(fs.readFile(result.markdownPath, "utf8")).resolves.toBe(markdown);
    await expect(loadEmergencyAuthorStyle({
      inputPath: result.markdownPath,
      documentId: "example-title-style"
    })).resolves.toMatchObject({
      sourcePathKey: "notion:page-1",
      revisionSha256: document.revisionSha256,
      sectionCount: document.sectionCount
    });
  });

  it("rejects a Markdown file without its TiDB export metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mycontext-emergency-"));
    const inputPath = path.join(root, "example-title-style.md");
    await fs.writeFile(inputPath, titleMarkdown());

    await expect(loadEmergencyAuthorStyle({
      inputPath,
      documentId: "example-title-style"
    })).rejects.toMatchObject({ code: "emergency_markdown_read_failed" });
  });

  it("rejects Markdown changed after export", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mycontext-emergency-"));
    const markdown = titleMarkdown();
    const outputPath = path.join(root, "example-title-style.md");
    const source = AUTHOR_STYLE_DOCUMENTS.find(
      (candidate) => candidate.documentId === "example-title-style"
    );
    if (source === undefined) throw new Error("title definition missing");
    const document = parseAuthorStyleMarkdown({
      source,
      markdown,
      sourcePathKey: "notion:page-1",
      sourceMtimeMs: 123
    });
    await writeEmergencyAuthorStyleSnapshot({
      outputPath,
      markdown,
      metadata: metadataFor(document)
    });
    await fs.appendFile(outputPath, "\nchanged\n");

    await expect(loadEmergencyAuthorStyle({
      inputPath: outputPath,
      documentId: "example-title-style"
    })).rejects.toMatchObject({ code: "emergency_snapshot_mismatch" });
  });
});

function metadataFor(
  document: ReturnType<typeof parseAuthorStyleMarkdown>
): EmergencySnapshotMetadata {
  return {
    document_id: document.documentId,
    source: "tidb-current-snapshot",
    source_path_key: document.sourcePathKey,
    revision_sha256: document.revisionSha256,
    markdown_sha256: document.sourceMarkdownSha256,
    source_bytes: document.sourceBytes,
    source_line_count: document.sourceLineCount,
    source_mtime_ms: document.sourceMtimeMs,
    parser_version: document.parserVersion,
    sectioning_version: document.sectioningVersion,
    routing_version: document.routingVersion,
    routing_manifest_sha256: stableJsonSha256(document.routingManifest),
    outline_sha256: stableJsonSha256(document.outline),
    section_count: document.sectionCount,
    delivery_section_count: document.deliverySectionCount,
    search_span_count: document.searchSpanCount,
    exported_at: "2026-07-22T12:00:00.000Z",
    emergency_snapshot: true
  };
}

function titleMarkdown(): string {
  const keys = [
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
  return [
    "# Title style",
    "",
    ...keys.flatMap((key, index) => [
      `## Section ${index + 1}`,
      "",
      `\`context-key: ${key}\``,
      "",
      `Rules for ${key}.`,
      ""
    ])
  ].join("\n");
}
