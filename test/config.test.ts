import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it.each(["true", "TRUE", "True", "1", "yes", "YES", " true "])("EVOLUTION_READ_ONLY=%j turns read-only on", (v) => {
    expect(loadConfig({ EVOLUTION_READ_ONLY: v }).readOnly).toBe(true);
  });

  it.each(["false", "0", "", "no", "on", "2", undefined])("EVOLUTION_READ_ONLY=%j leaves it off", (v) => {
    expect(loadConfig({ EVOLUTION_READ_ONLY: v }).readOnly).toBe(false);
  });

  it("parses the allowlist: trims, normalizes, drops empty entries", () => {
    expect(
      loadConfig({ EVOLUTION_ALLOWED_NUMBERS: " 5511999999999 , +55 (21) 98888-7777,, " }).allowedNumbers,
    ).toEqual(["5511999999999", "5521988887777"]);
  });

  it("empty or missing allowlist means no restriction", () => {
    expect(loadConfig({}).allowedNumbers).toEqual([]);
    expect(loadConfig({ EVOLUTION_ALLOWED_NUMBERS: " , " }).allowedNumbers).toEqual([]);
  });
});

describe("loadConfig warnings", () => {
  it("warns when the API URL is plain http on a public host", () => {
    const w = loadConfig({ EVOLUTION_API_URL: "http://evo.example.com" }).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/https/);
  });

  it.each([
    "https://evo.example.com",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://[::1]:8080",
    undefined,
  ])("no warning for %s", (url) => {
    expect(loadConfig({ EVOLUTION_API_URL: url }).warnings).toEqual([]);
  });

  it("does not leak the key into warnings", () => {
    const w = loadConfig({ EVOLUTION_API_URL: "http://evo.example.com", EVOLUTION_API_KEY: "secret-key-value" }).warnings;
    expect(JSON.stringify(w)).not.toContain("secret-key-value");
  });
});

describe("loadConfig confirmWrites", () => {
  it.each(["true", "TRUE", "1", "yes", " Yes "])("EVOLUTION_CONFIRM_WRITES=%j turns confirmation on", (v) => {
    expect(loadConfig({ EVOLUTION_CONFIRM_WRITES: v }).confirmWrites).toBe(true);
  });

  it.each(["false", "0", "", "no", "on", undefined])("EVOLUTION_CONFIRM_WRITES=%j leaves it off", (v) => {
    expect(loadConfig({ EVOLUTION_CONFIRM_WRITES: v }).confirmWrites).toBe(false);
  });
});
