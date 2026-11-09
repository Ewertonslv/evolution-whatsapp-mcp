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
