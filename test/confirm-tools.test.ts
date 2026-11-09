import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Config } from "../src/config.js";
import { EvolutionClient } from "../src/evolution.js";
import { registerTools } from "../src/tools.js";

const NUMBER = "5511999999999";

const CALLS: [string, Record<string, unknown>][] = [
  ["send_text", { number: NUMBER, text: "hi" }],
  ["send_media", { number: NUMBER, mediatype: "image", media: "https://cdn.example/a.png" }],
  ["create_instance", { instance: "shop" }],
  ["disconnect_instance", {}],
  ["configure_webhook", { url: "https://h.example/hook" }],
];

interface Opts {
  config?: Partial<Config>;
  caps?: Record<string, unknown>;
  answer?: (message: string) => { action: string; content?: Record<string, unknown> };
}

async function connect({ config = { confirmWrites: true }, caps = {}, answer }: Opts = {}) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, new EvolutionClient({ baseUrl: "http://evo.test", apiKey: "k", defaultInstance: "demo" }), config);
  const mcp = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: caps });
  const asked: string[] = [];
  if (answer) {
    mcp.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params.message);
      return answer(req.params.message) as never;
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), mcp.connect(a)]);
  return { mcp, asked };
}

function mockFetch() {
  const fn = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as { text: string }[])[0].text;

afterEach(() => vi.unstubAllGlobals());

describe("write tool does not run without confirmation", () => {
  it.each(CALLS)("%s: client with no capabilities is refused and fetch is never called", async (name, args) => {
    const fetchFn = mockFetch();
    const { mcp } = await connect();
    const res = await mcp.callTool({ name, arguments: args });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("nothing was sent");
    expect(fetchFn).toHaveBeenCalledTimes(0);
  });
});

describe("with an elicitation-capable client", () => {
  it.each(CALLS)("%s: accept with confirm true sends exactly once", async (name, args) => {
    const fetchFn = mockFetch();
    const { mcp, asked } = await connect({ caps: { elicitation: { form: {} } }, answer: () => ({ action: "accept", content: { confirm: true } }) });
    const res = await mcp.callTool({ name, arguments: args });
    expect(res.isError).toBeFalsy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toContain(NUMBER);
    expect(asked[0]).not.toContain("a.png");
  });

  it.each(CALLS)("%s: decline sends nothing", async (name, args) => {
    const fetchFn = mockFetch();
    const { mcp } = await connect({ caps: { elicitation: { form: {} } }, answer: () => ({ action: "decline" }) });
    const res = await mcp.callTool({ name, arguments: args });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("Not confirmed. Nothing was sent.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("a client declaring plain `elicitation: {}` (form by spec) still gets asked", async () => {
    const fetchFn = mockFetch();
    const { mcp, asked } = await connect({ caps: { elicitation: {} }, answer: () => ({ action: "accept", content: { confirm: true } }) });
    await mcp.callTool({ name: "send_text", arguments: { number: NUMBER, text: "hi" } });
    expect(asked).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("a number outside the allowlist is refused before any question", async () => {
    const fetchFn = mockFetch();
    const { mcp, asked } = await connect({
      config: { confirmWrites: true, allowedNumbers: ["5521988887777"] },
      caps: { elicitation: { form: {} } },
      answer: () => ({ action: "accept", content: { confirm: true } }),
    });
    const res = await mcp.callTool({ name: "send_text", arguments: { number: NUMBER, text: "hi" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("EVOLUTION_ALLOWED_NUMBERS");
    expect(asked).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("read tools never ask", async () => {
    const fetchFn = mockFetch();
    const { mcp, asked } = await connect({ caps: { elicitation: { form: {} } }, answer: () => ({ action: "decline" }) });
    await mcp.callTool({ name: "connection_status", arguments: {} });
    expect(asked).toHaveLength(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("config combinations", () => {
  it("readOnly + confirmWrites leaves only the four read tools", async () => {
    const { mcp } = await connect({ config: { readOnly: true, confirmWrites: true } });
    const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["connection_status", "find_chats", "find_messages", "get_qrcode"]);
  });

  it("confirmWrites off: writes run straight away on a client with no capabilities", async () => {
    const fetchFn = mockFetch();
    const { mcp } = await connect({ config: { confirmWrites: false } });
    const res = await mcp.callTool({ name: "send_text", arguments: { number: NUMBER, text: "hi" } });
    expect(res.isError).toBeFalsy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
