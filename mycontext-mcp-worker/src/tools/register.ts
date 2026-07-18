import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TidbClient } from "../tidb.js";
import { registerGetAuthorStyleContextTool } from "./getAuthorStyleContext.js";
import { registerGetMetaskillContextTool } from "./getMetaskillContext.js";
import { registerReadContextTool } from "./readContext.js";
import { registerSearchAuthorStyleEvidenceTool } from "./searchAuthorStyleEvidence.js";
import { registerSearchContextTool } from "./searchContext.js";
import { registerSearchMetaskillEvidenceTool } from "./searchMetaskillEvidence.js";

export function registerPublicTools(server: McpServer, client: TidbClient): void {
  registerSearchContextTool(server, client);
  registerReadContextTool(server, client);
  registerGetAuthorStyleContextTool(server, client);
  registerSearchAuthorStyleEvidenceTool(server, client);
  registerGetMetaskillContextTool(server, client);
  registerSearchMetaskillEvidenceTool(server, client);
}
