import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import { readClientCaps } from "../src/confirm/client-caps.js";
import { chooseMode } from "../src/confirm/mode.js";

const on = { confirmWrites: true };

describe("chooseMode", () => {
  it("is direct when confirmation is off, whatever the client says", () => {
    expect(chooseMode({ confirmWrites: false }, {})).toBe("direct");
    expect(chooseMode({ confirmWrites: false }, { elicitation: {} })).toBe("direct");
    expect(chooseMode({}, {})).toBe("direct");
  });

  it("is elicit when the client declares elicitation", () => {
    expect(chooseMode(on, { elicitation: {} })).toBe("elicit");
    expect(chooseMode(on, { elicitation: { form: {} } })).toBe("elicit");
    expect(chooseMode(on, { elicitation: { form: {}, url: {} } })).toBe("elicit");
  });

  it("refuses without any capability", () => {
    expect(chooseMode(on, {})).toBe("refuse");
  });

  it("refuses when elicitation is url-only: no form can be shown", () => {
    expect(chooseMode(on, { elicitation: { url: {} } })).toBe("refuse");
  });

  it("refuses for an Apps-only client until the card exists", () => {
    const caps = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
    expect(chooseMode(on, caps)).toBe("refuse");
  });
});

async function capsSeenBy(clientCaps: Record<string, unknown>) {
  const server = new McpServer({ name: "t", version: "0.0.0" });
  const mcp = new Client({ name: "c", version: "0.0.0" }, { capabilities: clientCaps });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), mcp.connect(a)]);
  return readClientCaps(server);
}

describe("readClientCaps", () => {
  it("returns the capabilities the client declared", async () => {
    expect(await capsSeenBy({ elicitation: {} })).toHaveProperty("elicitation");
  });

  it("returns {} for a client with no capabilities", async () => {
    expect(await capsSeenBy({})).toEqual({});
  });

  it("returns {} before any client connected", () => {
    expect(readClientCaps(new McpServer({ name: "t", version: "0.0.0" }))).toEqual({});
  });
});
