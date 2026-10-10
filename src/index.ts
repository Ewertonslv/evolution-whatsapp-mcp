#!/usr/bin/env node
/**
 * evolution-whatsapp-mcp: MCP server exposing WhatsApp (Evolution API) as tools.
 *
 * Configure via env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_DEFAULT_INSTANCE,
 * EVOLUTION_TIMEOUT_MS.
 * Speaks MCP over stdio. Wire it into Claude Desktop/Code or any MCP client.
 */
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { EvolutionClient } from "./evolution.js";
import { registerTools } from "./tools.js";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

async function main(): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error(
      "Missing config: set EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables.",
    );
    process.exit(1);
  }

  const timeoutRaw = process.env.EVOLUTION_TIMEOUT_MS;
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    console.error("Invalid config: EVOLUTION_TIMEOUT_MS must be a positive number of milliseconds.");
    process.exit(1);
  }

  const client = new EvolutionClient({
    baseUrl,
    apiKey,
    defaultInstance: process.env.EVOLUTION_DEFAULT_INSTANCE,
    timeoutMs,
  });

  const server = new McpServer({
    name: "evolution-whatsapp-mcp",
    version,
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs must go to stderr: stdout is the MCP transport channel.
  console.error("evolution-whatsapp-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting evolution-whatsapp-mcp:", err);
  process.exit(1);
});
