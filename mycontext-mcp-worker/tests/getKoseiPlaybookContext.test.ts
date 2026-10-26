import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { MAX_KOSEI_PLAYBOOK_CONTEXT_CHARS } from "../src/koseiPlaybook.js";
import { registerGetKoseiPlaybookContextTool } from "../src/tools/getKoseiPlaybookContext.js";
import type { TidbClient } from "../src/tidb.js";

const PLAYBOOK = [
  "# 校正プレイブック",
  "",
  "## 01 役割",
  "校正者の役割の本文。",
  "",
  "## 13 4回の見直し手順",
  "4パスの本文。"
].join("\n");

describe("get_kosei_playbook_context", () => {
  it("returns the single-record playbook through both delivery channels without truncation", async () => {
    const execute = vi.fn().mockResolvedValue([playbookRow()]);
    const result = await callTool({ execute });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: "text", text: PLAYBOOK }]);
    expect(result.structuredContent).toMatchObject({
      document_id: "editor-knowledge:proofreading-playbook",
      title: "校正プレイブック",
      revision_sha256: "markdown-hash",
      storage_mode: "whole_document",
      record_count: 1,
      section_count: 0,
      search_span_count: 1,
      context_chars: PLAYBOOK.length,
      markdown: PLAYBOOK,
      returned_chars: PLAYBOOK.length,
      retrieval_mode: "full_playbook",
      truncated: false,
      source_resource_uri: "mycontext://editor-knowledge/proofreading-playbook"
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("FROM editor_knowledge_documents"),
      ["proofreading-playbook"]
    );
  });

  it("returns an explicit not-found error", async () => {
    const result = await callTool({ execute: vi.fn().mockResolvedValue([]) });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      type: "text",
      text: "Kosei playbook not found: proofreading-playbook"
    }]);
  });

  it("rejects an oversized playbook instead of truncating it", async () => {
    const markdown = "あ".repeat(MAX_KOSEI_PLAYBOOK_CONTEXT_CHARS + 1);
    const result = await callTool({
      execute: vi.fn().mockResolvedValue([playbookRow({ markdown })])
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      type: "text",
      text: `kosei playbook is ${markdown.length} chars; maximum is ${MAX_KOSEI_PLAYBOOK_CONTEXT_CHARS}; no truncation was applied`
    }]);
  });
});

function playbookRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    document_id: "proofreading-playbook",
    title: "校正プレイブック",
    markdown: PLAYBOOK,
    markdown_sha256: "markdown-hash",
    section_revision_sha256: null,
    section_count: null,
    search_span_count: null,
    last_synced_at: "2026-07-26T09:00:00.000+09:00",
    ...overrides
  };
}

async function callTool(tidbClient: TidbClient) {
  const server = new McpServer({ name: "test-server", version: "1.0.0" });
  registerGetKoseiPlaybookContextTool(server, tidbClient);
  const sdkClient = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await sdkClient.connect(clientTransport);
  try {
    return await sdkClient.callTool({
      name: "get_kosei_playbook_context",
      arguments: {}
    });
  } finally {
    await sdkClient.close();
    await server.close();
  }
}
