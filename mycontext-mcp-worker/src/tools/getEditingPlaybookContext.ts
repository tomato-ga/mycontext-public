import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_SCOPE } from "../constants.js";
import {
  DEFAULT_EDITING_PLAYBOOK_VERSION,
  EDITING_PLAYBOOK_VERSIONS,
  editingPlaybookSourceId,
  EditingPlaybookContextError,
  EditingPlaybookContextTooLargeError
} from "../editingPlaybook.js";
import { getEditingPlaybookContext, type TidbClient } from "../tidb.js";
import { buildTextToolResult } from "./textResult.js";

export function registerGetEditingPlaybookContextTool(
  server: McpServer,
  client: TidbClient
): void {
  server.registerTool(
    "get_editing_playbook_context",
    {
      title: "Get full editing playbook context",
      description:
        "Use this first, before search_personal_context, whenever editing, reviewing, red-lining, or deciding whether to publish a completed draft (原稿の編集, 赤入れ, 校正・校閲, 公開前チェック, リライト). Returns the entire 編集プレイブック from its single TiDB record without truncation. By default this is v2 (editing-playbook-v2); pass version \"v1\" for editing-playbook. For designing a new 企画案 or 構成案 use get_planning_playbook_context instead; after reading this playbook, use search_personal_context only for supporting examples or evidence.",
      inputSchema: z.object({
        version: z
          .enum(EDITING_PLAYBOOK_VERSIONS)
          .default(DEFAULT_EDITING_PLAYBOOK_VERSION)
          .describe(
            "Which editing playbook to return: \"v2\" (default; editing-playbook-v2, 14 chapters from the 編集研修 slides) or \"v1\" (editing-playbook, the 2026-07-26 eleven-chapter page)."
          )
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [MCP_SCOPE] }] }
    },
    async ({ version }) => {
      try {
        const context = await getEditingPlaybookContext(client, version);
        if (context === null) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Editing playbook not found: ${editingPlaybookSourceId(version)}`
            }]
          };
        }
        const { markdown: _markdown, ...metadata } = context;
        return buildTextToolResult(context.markdown, metadata);
      } catch (error) {
        if (
          error instanceof EditingPlaybookContextError
          || error instanceof EditingPlaybookContextTooLargeError
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
