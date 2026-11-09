import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Capabilities the connected client declared at initialize; {} when none or not connected yet. */
export type ClientCaps = Record<string, unknown>;

// Isolated on purpose: spec 2026-07-28 moves this to a per-request _meta, only this file changes.
export function readClientCaps(server: McpServer): ClientCaps {
  return (server.server.getClientCapabilities() as ClientCaps | undefined) ?? {};
}
