import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_SCOPE } from "../constants.js";
import {
  KoseiPlaybookContextError,
  KoseiPlaybookContextTooLargeError
} from "../koseiPlaybook.js";
import { getKoseiPlaybookContext, type TidbClient } from "../tidb.js";
import { buildTextToolResult } from "./textResult.js";

export function registerGetKoseiPlaybookContextTool(
  server: McpServer,
  client: TidbClient
): void {
  server.registerTool(
    "get_kosei_playbook_context",
    {
      title: "Get full proofreading (校正) playbook context",
      description:
        "Use this first when proofreading a finished draft (校正: 表記統一, 誤字脱字, 硬い言葉の日常語への置き換え, 見出し・リード・段落・一文の4パス点検, 差分＋完成稿の出力). Returns the entire 校正プレイブック (proofreading-playbook) from its single TiDB record without truncation, including the plain-language replacement tables. Read get_editing_playbook_context's 00 chapter first for the editing stance; use get_author_style_context(example-body-style, evaluate) for the author's own voice.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async () => {
      try {
        const context = await getKoseiPlaybookContext(client);
        if (context === null) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: "Kosei playbook not found: proofreading-playbook"
            }]
          };
        }
        const { markdown: _markdown, ...metadata } = context;
        return buildTextToolResult(context.markdown, metadata);
      } catch (error) {
        if (
          error instanceof KoseiPlaybookContextError
          || error instanceof KoseiPlaybookContextTooLargeError
        ) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error.message }]
          };
        }
        throw error;
      }
    }
  );
}
