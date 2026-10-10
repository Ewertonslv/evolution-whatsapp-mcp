import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvolutionClient } from "../src/evolution.js";
import { registerTools } from "../src/tools.js";

const BASE = "http://evo.test";

/** Connect an MCP client to a server with the tools registered, in memory. */
async function connect(defaultInstance?: string) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, new EvolutionClient({ baseUrl: BASE, apiKey: "k", defaultInstance }));
  const mcp = new Client({ name: "test-client", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
  return mcp;
}

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result.content as { type: string; text: string }[])[0].text;
}

afterEach(() => vi.unstubAllGlobals());

describe("tool registration", () => {
  it("exposes the nine tools", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "configure_webhook",
      "connection_status",
      "create_instance",
      "disconnect_instance",
      "find_chats",
      "find_messages",
      "get_qrcode",
      "send_media",
      "send_text",
    ]);
  });

  it("marks read tools read-only and logout/webhook destructive", async () => {
    const { tools } = await (await connect()).listTools();
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of ["find_chats", "find_messages", "get_qrcode", "connection_status"]) {
      expect(hints[name]?.readOnlyHint).toBe(true);
    }
    expect(hints.disconnect_instance?.destructiveHint).toBe(true);
    expect(hints.configure_webhook?.destructiveHint).toBe(true);
    expect(hints.send_text?.readOnlyHint).toBe(false);
    expect(hints.send_text?.destructiveHint).toBe(false);
  });
});

describe("tool descriptions", () => {
  const WRITES = ["send_text", "send_media", "create_instance", "disconnect_instance", "configure_webhook"];

  it("every state-changing tool says when not to call it", async () => {
    const { tools } = await (await connect()).listTools();
    for (const name of WRITES) {
      expect(tools.find((t) => t.name === name)?.description, name).toMatch(/[Dd]on't/);
    }
  });

  it("state-changing tools have longer descriptions than read tools", async () => {
    const { tools } = await (await connect()).listTools();
    const length = (t: { description?: string }) => t.description?.length ?? 0;
    const shortestWrite = Math.min(...tools.filter((t) => WRITES.includes(t.name)).map(length));
    const longestRead = Math.max(...tools.filter((t) => !WRITES.includes(t.name)).map(length));
    expect(shortestWrite).toBeGreaterThan(longestRead);
  });
});

describe("tool calls", () => {
  it("send_text uses the default instance and returns the API response", async () => {
    const fn = mockFetch({ key: { id: "1" } });
    const result = await (await connect("demo")).callTool({
      name: "send_text",
      arguments: { number: "+55 11 99999-9999", text: "hi" },
    });
    expect(fn.mock.calls[0][0]).toBe(`${BASE}/message/sendText/demo`);
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ key: { id: "1" } });
  });

  it("an explicit instance overrides the default", async () => {
    const fn = mockFetch({});
    await (await connect("demo")).callTool({
      name: "connection_status",
      arguments: { instance: "other" },
    });
    expect(fn.mock.calls[0][0]).toBe(`${BASE}/instance/connectionState/other`);
  });

  it("returns an error result when no instance is available", async () => {
    const fn = mockFetch({});
    const result = await (await connect()).callTool({ name: "find_chats", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("EVOLUTION_DEFAULT_INSTANCE is not set");
    expect(fn).not.toHaveBeenCalled();
  });

  it("find_messages turns a phone into a JID", async () => {
    const fn = mockFetch({ messages: { total: 2, records: [{}, {}] } });
    await (await connect("demo")).callTool({
      name: "find_messages",
      arguments: { chat: "+55 11 99999-9999", limit: 5 },
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fn.mock.calls[0][1].body)).toEqual({
      where: { key: { remoteJid: "5511999999999@s.whatsapp.net" } },
      offset: 5,
    });
  });

  it("find_messages retries without the ninth digit when a Brazilian chat is empty", async () => {
    const fn = vi.fn(async (_url: string, init: { body: string }) => {
      const jid = JSON.parse(init.body).where.key.remoteJid;
      const total = jid === "551199999999@s.whatsapp.net" ? 3 : 0;
      return { ok: true, status: 200, text: async () => JSON.stringify({ messages: { total } }) };
    });
    vi.stubGlobal("fetch", fn);
    const result = await (await connect("demo")).callTool({
      name: "find_messages",
      arguments: { chat: "5511999999999" },
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(text(result)).messages.total).toBe(3);
  });

  it("find_messages does not retry for non-Brazilian numbers", async () => {
    const fn = mockFetch({ messages: { total: 0 } });
    await (await connect("demo")).callTool({
      name: "find_messages",
      arguments: { chat: "+1 415 555 2671" },
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("configure_webhook defaults the events", async () => {
    const fn = mockFetch({});
    await (await connect("demo")).callTool({
      name: "configure_webhook",
      arguments: { url: "https://x.test/hook" },
    });
    expect(JSON.parse(fn.mock.calls[0][1].body).webhook.events).toEqual([
      "MESSAGES_UPSERT",
      "CONNECTION_UPDATE",
    ]);
  });

  it("surfaces the HTTP status and body on API failure", async () => {
    mockFetch('{"error":"Unauthorized"}', false, 401);
    const result = await (await connect("demo")).callTool({
      name: "send_text",
      arguments: { number: "5511999999999", text: "hi" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("HTTP 401");
    expect(text(result)).toContain("Unauthorized");
  });
});
