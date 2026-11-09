import { describe, expect, it, vi } from "vitest";

import { guardWrite, type ElicitFn } from "../src/confirm/gate.js";

const NUMBER = "5511999999999";
const OK = { content: [{ type: "text" as const, text: "sent" }] };
const args = { number: NUMBER, text: "hello" };

function setup(mode: "direct" | "elicit" | "refuse", elicit: ElicitFn = async () => ({ action: "accept", content: { confirm: true } })) {
  const execute = vi.fn(async () => OK);
  const elicitSpy = vi.fn(elicit);
  const run = () => guardWrite({ mode, elicit: elicitSpy }, { action: "send_text", args, execute });
  return { execute, elicitSpy, run };
}

describe("guardWrite", () => {
  it("direct: executes once and never asks", async () => {
    const { execute, elicitSpy, run } = setup("direct");
    expect(await run()).toBe(OK);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(elicitSpy).not.toHaveBeenCalled();
  });

  it("refuse: isError, nothing executed, text says nothing was sent", async () => {
    const { execute, elicitSpy, run } = setup("refuse");
    const res = await run();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("nothing was sent");
    expect(execute).not.toHaveBeenCalled();
    expect(elicitSpy).not.toHaveBeenCalled();
  });

  it("elicit: accept with confirm true executes once", async () => {
    const { execute, run } = setup("elicit");
    expect(await run()).toBe(OK);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each<[string, ElicitFn]>([
    ["accept without confirm does not execute", async () => ({ action: "accept", content: {} })],
    ["accept with confirm false", async () => ({ action: "accept", content: { confirm: false } })],
    ["accept with no content", async () => ({ action: "accept" })],
    ['accept with confirm "true" (string)', async () => ({ action: "accept", content: { confirm: "true" } })],
    ["accept with confirm 1", async () => ({ action: "accept", content: { confirm: 1 } })],
    ["decline", async () => ({ action: "decline" })],
    ["cancel", async () => ({ action: "cancel" })],
    ["elicit throws", async () => { throw new Error("client gone"); }],
    ["elicit times out", async () => { throw Object.assign(new Error("Request timed out"), { code: -32001 }); }],
  ])("elicit: %s", async (_name, elicit) => {
    const { execute, run } = setup("elicit", elicit);
    const res = await run();
    expect(execute).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("Not confirmed. Nothing was sent.");
  });

  it("elicit: asks a boolean form defaulting to false, with a masked message", async () => {
    const { elicitSpy, run } = setup("elicit");
    await run();
    const req = elicitSpy.mock.calls[0][0] as {
      mode: string;
      message: string;
      requestedSchema: { required: string[]; properties: { confirm: { type: string; default: boolean } } };
    };
    expect(req.mode).toBe("form");
    expect(req.requestedSchema.properties.confirm.type).toBe("boolean");
    expect(req.requestedSchema.properties.confirm.default).toBe(false);
    expect(req.requestedSchema.required).toContain("confirm");
    expect(req.message).toContain("+55 11 9****");
    expect(req.message).not.toContain(NUMBER);
    expect(req.message.length).toBeLessThanOrEqual(500);
  });

  it("elicit: waits at most 120 s for the human", async () => {
    const { elicitSpy, run } = setup("elicit");
    await run();
    expect(elicitSpy.mock.calls[0][1]).toEqual({ timeout: 120_000 });
  });

  it("elicit: an error from execute is not turned into 'Not confirmed'", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "HTTP 500" }], isError: true }));
    const res = await guardWrite(
      { mode: "elicit", elicit: async () => ({ action: "accept", content: { confirm: true } }) },
      { action: "send_text", args, execute },
    );
    expect(res.content[0].text).toBe("HTTP 500");
  });
});
