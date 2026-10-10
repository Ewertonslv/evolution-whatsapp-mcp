import { afterEach, describe, expect, it, vi } from "vitest";

import { EvolutionClient, EvolutionError } from "../src/evolution.js";
import { brazilianNinthDigitVariant, normalizePhone, toRemoteJid } from "../src/schemas.js";

const BASE = "http://evo.test";
const KEY = "test-key";

function client() {
  return new EvolutionClient({ baseUrl: `${BASE}/`, apiKey: KEY, defaultInstance: "demo" });
}

/** Stub global fetch and capture the call; returns the mock for assertions. */
function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fn);
  return fn as unknown as ReturnType<typeof vi.fn>;
}

function lastCall(fn: ReturnType<typeof vi.fn>) {
  const [url, init] = fn.mock.calls.at(-1)!;
  return { url, init, body: init?.body ? JSON.parse(init.body) : undefined };
}

afterEach(() => vi.unstubAllGlobals());

describe("helpers", () => {
  it("normalizePhone strips formatting", () => {
    expect(normalizePhone("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("toRemoteJid builds a JID from a phone, passes JIDs through", () => {
    expect(toRemoteJid("+55 11 99999-9999")).toBe("5511999999999@s.whatsapp.net");
    expect(toRemoteJid("123@g.us")).toBe("123@g.us");
  });

  it("brazilianNinthDigitVariant toggles the ninth digit on Brazilian JIDs only", () => {
    expect(brazilianNinthDigitVariant("5511999999999@s.whatsapp.net")).toBe(
      "551199999999@s.whatsapp.net",
    );
    expect(brazilianNinthDigitVariant("551199999999@s.whatsapp.net")).toBe(
      "5511999999999@s.whatsapp.net",
    );
    expect(brazilianNinthDigitVariant("14155552671@s.whatsapp.net")).toBeNull();
    expect(brazilianNinthDigitVariant("123@g.us")).toBeNull();
  });
});

describe("EvolutionClient transport", () => {
  it("trims trailing slash, sends apikey header", async () => {
    const fn = mockFetch({ ok: true });
    await client().sendText("inst", "5511999999999", "hi");
    const { url, init } = lastCall(fn);
    expect(url).toBe(`${BASE}/message/sendText/inst`);
    expect((init!.headers as Record<string, string>).apikey).toBe(KEY);
  });

  it("throws EvolutionError with status and body on non-2xx", async () => {
    mockFetch("boom", false, 401);
    await expect(client().sendText("inst", "x", "y")).rejects.toMatchObject({
      name: "EvolutionError",
      status: 401,
      body: "boom",
    });
    await expect(client().sendText("inst", "x", "y")).rejects.toBeInstanceOf(EvolutionError);
  });
  it("URL-encodes the instance name", async () => {
    const fn = mockFetch({});
    await client().connectionStatus("my inst/../x");
    expect(lastCall(fn).url).toBe(`${BASE}/instance/connectionState/my%20inst%2F..%2Fx`);
  });

  it("passes an abort signal to fetch", async () => {
    const fn = mockFetch({});
    await client().findChats("inst");
    expect(lastCall(fn).init!.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws EvolutionError when the request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
          }),
      ),
    );
    const slow = new EvolutionClient({ baseUrl: BASE, apiKey: KEY, timeoutMs: 10 });
    await expect(slow.findChats("inst")).rejects.toMatchObject({
      name: "EvolutionError",
      message: "Evolution API POST /chat/findChats/inst timed out after 10ms",
    });
  });

  it("throws EvolutionError when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(client().findChats("inst")).rejects.toMatchObject({
      name: "EvolutionError",
      message: "Evolution API POST /chat/findChats/inst could not be reached: fetch failed",
    });
  });
});

describe("EvolutionClient operations", () => {
  it("sendText normalizes the number", async () => {
    const fn = mockFetch({ key: { id: "1" } });
    await client().sendText("inst", "+55 11 99999-9999", "hello");
    const { url, body } = lastCall(fn);
    expect(url).toBe(`${BASE}/message/sendText/inst`);
    expect(body).toEqual({ number: "5511999999999", text: "hello" });
  });

  it("sendMedia posts the media payload with normalized number", async () => {
    const fn = mockFetch({ status: "PENDING" });
    await client().sendMedia("inst", "5511999999999", {
      mediatype: "image",
      media: "https://x/y.png",
      caption: "hey",
    });
    const { url, body } = lastCall(fn);
    expect(url).toBe(`${BASE}/message/sendMedia/inst`);
    expect(body).toEqual({
      number: "5511999999999",
      mediatype: "image",
      media: "https://x/y.png",
      caption: "hey",
    });
  });

  it("findChats posts to the chat endpoint", async () => {
    const fn = mockFetch([{ id: "c1" }]);
    await client().findChats("inst");
    expect(lastCall(fn).url).toBe(`${BASE}/chat/findChats/inst`);
  });

  it("findMessages builds the where filter and sends limit as the page size", async () => {
    const fn = mockFetch([{ id: "m1" }]);
    await client().findMessages("inst", "5511999999999@s.whatsapp.net", 20, 2);
    const { url, body } = lastCall(fn);
    expect(url).toBe(`${BASE}/chat/findMessages/inst`);
    expect(body).toEqual({
      where: { key: { remoteJid: "5511999999999@s.whatsapp.net" } },
      offset: 20,
      page: 2,
    });
  });

  it("findMessages omits paging when not given", async () => {
    const fn = mockFetch([]);
    await client().findMessages("inst", "5511999999999@s.whatsapp.net");
    expect(lastCall(fn).body).toEqual({
      where: { key: { remoteJid: "5511999999999@s.whatsapp.net" } },
    });
  });

  it("createInstance sends the Baileys payload", async () => {
    const fn = mockFetch({ instance: { instanceName: "inst" } });
    await client().createInstance("inst");
    const { url, body } = lastCall(fn);
    expect(url).toBe(`${BASE}/instance/create`);
    expect(body).toEqual({ instanceName: "inst", qrcode: true, integration: "WHATSAPP-BAILEYS" });
  });

  it("getQrcode and connectionStatus use GET", async () => {
    const fn = mockFetch({ base64: "..." });
    await client().getQrcode("inst");
    expect(lastCall(fn)).toMatchObject({ url: `${BASE}/instance/connect/inst` });
    expect(fn.mock.calls.at(-1)![1].method).toBe("GET");

    await client().connectionStatus("inst");
    expect(lastCall(fn)).toMatchObject({ url: `${BASE}/instance/connectionState/inst` });
  });

  it("disconnect uses DELETE", async () => {
    const fn = mockFetch({});
    await client().disconnect("inst");
    expect(fn.mock.calls.at(-1)![1].method).toBe("DELETE");
    expect(lastCall(fn).url).toBe(`${BASE}/instance/logout/inst`);
  });

  it("configureWebhook nests the webhook payload with camelCase keys", async () => {
    const fn = mockFetch({});
    await client().configureWebhook("inst", "https://x/webhook", ["MESSAGES_UPSERT"]);
    const { url, body } = lastCall(fn);
    expect(url).toBe(`${BASE}/webhook/set/inst`);
    expect(body).toEqual({
      webhook: {
        enabled: true,
        url: "https://x/webhook",
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    });
  });
});
