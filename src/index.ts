#!/usr/bin/env node
/**
 * evolution-whatsapp-mcp — MCP server exposing WhatsApp (Evolution API) as tools.
 *
 * Configure via env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_DEFAULT_INSTANCE.
 * Speaks MCP over stdio — wire it into Claude Desktop/Code or any MCP client.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { EvolutionClient } from "./evolution.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error(
      "Missing config: set EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables.",
    );
    process.exit(1);
  }

  const client = new EvolutionClient({
    baseUrl,
    apiKey,
    defaultInstance: process.env.EVOLUTION_DEFAULT_INSTANCE,
  });

  const server = new McpServer({
    name: "evolution-whatsapp-mcp",
    version: "0.1.0",
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs must go to stderr — stdout is the MCP transport channel.
  console.error("evolution-whatsapp-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting evolution-whatsapp-mcp:", err);
  process.exit(1);
});
