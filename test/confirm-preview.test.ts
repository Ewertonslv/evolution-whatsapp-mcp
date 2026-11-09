import { describe, expect, it } from "vitest";

import { buildPreview, formatPreview, maskPhone } from "../src/confirm/preview.js";

const NUMBER = "5511999999999";

describe("maskPhone", () => {
  it("masks a Brazilian mobile number", () => {
    expect(maskPhone(NUMBER)).toBe("+55 11 9****-9999");
  });

  it("never returns all the digits, whatever the format", () => {
    for (const n of [NUMBER, "551199999999", "+55 11 99999-9999", "14155550123", "123456", "12"]) {
      const digits = n.replace(/\D/g, "");
      expect(maskPhone(n).replace(/\D/g, "")).not.toBe(digits);
      expect(maskPhone(n)).not.toContain(digits);
    }
  });

  it("turns a group JID into 'group chat'", () => {
    expect(maskPhone("120363025246125486@g.us")).toBe("group chat");
  });

  it("masks the id of a user JID", () => {
    expect(maskPhone(`${NUMBER}@s.whatsapp.net`)).toBe("+55 11 9****-9999");
  });
});

describe("buildPreview", () => {
  it("send_text: masked target, full target kept apart, body cut at 200 chars", () => {
    const p = buildPreview("send_text", { number: "+55 11 99999-9999", text: "x".repeat(5000) });
    expect(p.target).toBe("+55 11 9****-9999");
    expect(p.targetFull).toBe(NUMBER);
    expect(p.body).toBe("x".repeat(200) + "…");
  });

  it("send_media preview never includes media", () => {
    const base64 = "QUJD".repeat(262144); // ~1 MB
    const p = buildPreview("send_media", {
      number: NUMBER,
      mediatype: "image",
      media: base64,
      fileName: "photo.png",
      caption: "hello",
    });
    const all = JSON.stringify(p) + formatPreview(p);
    expect(all).not.toContain("QUJDQUJD");
    expect(p.body).toContain("image");
    expect(p.body).toContain("photo.png");
    expect(p.body).toContain("hello");
    const url = buildPreview("send_media", { number: NUMBER, mediatype: "document", media: "https://cdn.example/x.pdf?sig=abc" });
    expect(JSON.stringify(url)).not.toContain("cdn.example");
    expect(JSON.stringify(url)).not.toContain("sig=abc");
  });

  it("create_instance: instance name and integration", () => {
    const p = buildPreview("create_instance", { instance: "shop" });
    expect(p.target).toBe("shop");
    expect(p.body).toContain("WHATSAPP-BAILEYS");
  });

  it("disconnect_instance: says it logs the instance out", () => {
    const p = buildPreview("disconnect_instance", { instance: "shop" });
    expect(p.body).toBe("Log out instance shop");
  });

  it("configure_webhook: origin only, no path or query secret, event count", () => {
    const p = buildPreview("configure_webhook", {
      instance: "shop",
      url: "https://h.example/hook?token=s3cr3t",
      events: ["A", "B", "C"],
    });
    const all = JSON.stringify(p) + formatPreview(p);
    expect(all).toContain("https://h.example");
    expect(all).not.toContain("s3cr3t");
    expect(all).not.toContain("/hook");
    expect(p.body).toContain("3 events");
  });

  it("configure_webhook: userinfo in the URL is dropped; bad URL is flagged", () => {
    const p = buildPreview("configure_webhook", { instance: "i", url: "https://user:pw@h.example/x", events: [] });
    expect(JSON.stringify(p)).not.toContain("pw");
    expect(buildPreview("configure_webhook", { instance: "i", url: "nope", events: [] }).body).toContain("invalid URL");
  });
});

describe("formatPreview", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["send_text", { number: NUMBER, text: "y".repeat(5000) }],
    ["send_media", { number: NUMBER, mediatype: "image", media: "z".repeat(100000), caption: "c".repeat(900), fileName: "f".repeat(900) }],
    ["create_instance", { instance: "shop" }],
    ["disconnect_instance", { instance: "shop" }],
    ["configure_webhook", { instance: "shop", url: "https://h.example/" + "p".repeat(900), events: ["A"] }],
  ];

  it.each(cases)("%s: at most 500 chars and no full number", (action, args) => {
    const text = formatPreview(buildPreview(action as never, args));
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).not.toContain(NUMBER);
    expect(text.length).toBeGreaterThan(10);
  });
});
