import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvolutionClient } from "../src/evolution.js";
import type { Config } from "../src/config.js";
import { registerTools } from "../src/tools.js";

const BASE = "http://evo.test";

/** Connect an MCP client to a server with the tools registered, in memory. */
async function connect(defaultInstance?: string, config?: Partial<Config>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, new EvolutionClient({ baseUrl: BASE, apiKey: "k", defaultInstance }), config);
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

describe("configure_webhook url", () => {
  const call = async (url: string) => {
    const fn = mockFetch({});
    const result = await (await connect("demo")).callTool({
      name: "configure_webhook",
      arguments: { url },
    });
    return { fn, result };
  };

  it.each(["https://x.com/h", "http://localhost:3000/h", "http://127.0.0.1:3000/h", "http://[::1]:3000/h", "HTTP://LOCALHOST/h"])(
    "accepts %s",
    async (url) => {
      const { fn, result } = await call(url);
      expect(result.isError).toBeFalsy();
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "http://example.com/h",
    "ftp://x.com/h",
    "javascript:alert(1)",
    "HTTP://LOCALHOST.evil.com/h",
    "http://127.0.0.1.nip.io/h",
    "not a url",
  ])("rejects %s", async (url) => {
    const { fn, result } = await call(url);
    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("explains the https rule", async () => {
    const { result } = await call("http://example.com/h");
    expect(text(result)).toMatch(/https/i);
  });
});

describe("read-only mode", () => {
  const WRITES = ["send_text", "send_media", "create_instance", "disconnect_instance", "configure_webhook"];

  it("readOnly hides write tools", async () => {
    const { tools } = await (await connect("demo", { readOnly: true })).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "connection_status",
      "find_chats",
      "find_messages",
      "get_qrcode",
    ]);
  });

  it("write tools stay when readOnly is off", async () => {
    const { tools } = await (await connect("demo", { readOnly: false })).listTools();
    for (const name of WRITES) expect(tools.map((t) => t.name)).toContain(name);
  });

  it("calling a hidden write tool fails and sends nothing", async () => {
    const fn = mockFetch({});
    const mcp = await connect("demo", { readOnly: true });
    const result = await mcp.callTool({ name: "send_text", arguments: { number: "5511999999999", text: "hi" } }).catch((e) => e);
    expect(result instanceof Error || (result as { isError?: boolean }).isError).toBeTruthy();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("allowed numbers", () => {
  const cfg = { allowedNumbers: ["5511999999999"] };
  const send = async (number: string, name = "send_text") => {
    const fn = mockFetch({ key: { id: "1" } });
    const args =
      name === "send_text"
        ? { number, text: "hi" }
        : { number, mediatype: "image", media: "https://x.test/a.png" };
    const result = await (await connect("demo", cfg)).callTool({ name, arguments: args });
    return { fn, result };
  };

  it.each(["+55 11 99999-9999", "5511999999999", "551199999999", "5511999999999@s.whatsapp.net"])(
    "send_text allows %s",
    async (number) => {
      const { fn, result } = await send(number);
      expect(result.isError).toBeFalsy();
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it("send_text refuses a number outside the list without echoing it", async () => {
    const { fn, result } = await send("5511888888888");
    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
    expect(text(result)).toContain("EVOLUTION_ALLOWED_NUMBERS");
    expect(text(result)).not.toContain("5511888888888");
    expect(text(result)).not.toContain("888888888");
  });

  it("send_media is guarded too", async () => {
    const ok = await send("5511999999999", "send_media");
    expect(ok.result.isError).toBeFalsy();
    const bad = await send("5511888888888", "send_media");
    expect(bad.result.isError).toBe(true);
    expect(bad.fn).not.toHaveBeenCalled();
  });

  it("refuses a group JID when a list exists", async () => {
    const { fn, result } = await send("120363000000@g.us");
    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("an allowlist entry with the ninth digit also matches the short form", async () => {
    const fn = mockFetch({});
    const mcp = await connect("demo", { allowedNumbers: ["551199999999"] });
    const r = await mcp.callTool({ name: "send_text", arguments: { number: "5511999999999", text: "hi" } });
    expect(r.isError).toBeFalsy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("no restriction when the list is empty", async () => {
    const fn = mockFetch({});
    const mcp = await connect("demo", { allowedNumbers: [] });
    await mcp.callTool({ name: "send_text", arguments: { number: "5511888888888", text: "hi" } });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("response limits", () => {
  const chats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

  it("find_chats cuts to 50 by default", async () => {
    mockFetch(chats(300));
    const result = await (await connect("demo")).callTool({ name: "find_chats", arguments: {} });
    expect(JSON.parse(text(result))).toHaveLength(50);
  });

  it("find_chats honours an explicit limit", async () => {
    mockFetch(chats(300));
    const result = await (await connect("demo")).callTool({ name: "find_chats", arguments: { limit: 120 } });
    expect(JSON.parse(text(result))).toHaveLength(120);
  });

  it.each([0, 201, -1])("find_chats rejects limit %i", async (limit) => {
    const fn = mockFetch(chats(3));
    const result = await (await connect("demo")).callTool({ name: "find_chats", arguments: { limit } });
    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("find_messages sends limit 50 by default", async () => {
    const fn = mockFetch({ messages: { total: 1 } });
    await (await connect("demo")).callTool({ name: "find_messages", arguments: { chat: "5511999999999" } });
    expect(JSON.parse(fn.mock.calls[0][1].body).offset).toBe(50);
  });

  it.each([0, 201])("find_messages rejects limit %i", async (limit) => {
    const fn = mockFetch({});
    const result = await (await connect("demo")).callTool({
      name: "find_messages",
      arguments: { chat: "5511999999999", limit },
    });
    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it("truncates an oversized payload with a warning", async () => {
    mockFetch({ blob: "x".repeat(200_000) });
    const result = await (await connect("demo")).callTool({ name: "connection_status", arguments: {} });
    const out = text(result);
    expect(out.length).toBeLessThan(101_000);
    expect(out).toContain("truncated: use limit/page");
  });

  it("does not truncate a small payload", async () => {
    mockFetch({ ok: true });
    const result = await (await connect("demo")).callTool({ name: "connection_status", arguments: {} });
    expect(text(result)).not.toContain("truncated");
  });

  it("get_qrcode keeps the pairing code and drops an oversized base64", async () => {
    mockFetch({ pairingCode: "ABCD-1234", code: "2@xyz", base64: "A".repeat(200_000) });
    const result = await (await connect("demo")).callTool({ name: "get_qrcode", arguments: {} });
    const out = JSON.parse(text(result));
    expect(out.pairingCode).toBe("ABCD-1234");
    expect(out.code).toBe("2@xyz");
    expect(out.base64).toBeUndefined();
    expect(out.base64Omitted).toMatch(/too large/);
  });

  it("get_qrcode keeps a normal base64", async () => {
    mockFetch({ pairingCode: "ABCD-1234", base64: "data:image/png;base64,AAAA" });
    const result = await (await connect("demo")).callTool({ name: "get_qrcode", arguments: {} });
    expect(JSON.parse(text(result)).base64).toBe("data:image/png;base64,AAAA");
  });
});

describe("input validation", () => {
  const send = async (args: Record<string, unknown>, name = "send_text") => {
    const fn = mockFetch({ key: { id: "1" } });
    const result = await (await connect("demo")).callTool({ name, arguments: args });
    return { fn, result };
  };

  it.each(["", "   ", "+55 (11) 9", "abc", "1234567", "1234567890123456"])(
    "send_text rejects number %j and names the field",
    async (number) => {
      const { fn, result } = await send({ number, text: "hi" });
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/number/i);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each(["5511999999999@s.whatsapp.net", "120363000000@g.us", "+55 11 99999-9999", "12345678"])(
    "send_text accepts number %s",
    async (number) => {
      const { fn, result } = await send({ number, text: "hi" });
      expect(result.isError).toBeFalsy();
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["", "   ", "\n\t"])("send_text rejects text %j", async (t) => {
    const { fn, result } = await send({ number: "5511999999999", text: t });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/text/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it("send_media rejects a bad number, a negative delay and a fractional delay", async () => {
    const base = { mediatype: "image", media: "https://x.test/a.png" };
    for (const extra of [{ number: "" }, { number: "5511999999999", delay: -1 }, { number: "5511999999999", delay: 1.5 }]) {
      const { fn, result } = await send({ ...base, ...extra }, "send_media");
      expect(result.isError).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("send_media accepts delay 0", async () => {
    const { result } = await send(
      { number: "5511999999999", mediatype: "image", media: "https://x.test/a.png", delay: 0 },
      "send_media",
    );
    expect(result.isError).toBeFalsy();
  });
});
