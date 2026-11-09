import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const server = JSON.parse(read("server.json"));
const smithery = read("smithery.yaml");

/** Env vars the code reads, found in the source so a new one cannot slip past the metadata. */
const ENVS = [...new Set([...(read("src/index.ts") + read("src/config.ts")).matchAll(/EVOLUTION_[A-Z_]+/g)].map((m) => m[0]))];

describe("registry metadata", () => {
  it("server.json name matches package.json mcpName", () => {
    expect(pkg.mcpName).toBe("io.github.ewertonslv/evolution-whatsapp-mcp");
    expect(server.name).toBe(pkg.mcpName);
  });

  it("versions line up", () => {
    expect(server.version).toBe(pkg.version);
    const npm = server.packages.find((p: { registryType: string }) => p.registryType === "npm");
    expect(npm.identifier).toBe(pkg.name);
    expect(npm.version).toBe(pkg.version);
    expect(npm.transport.type).toBe("stdio");
  });

  it("registry description fits the 100 character limit", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("package.json has homepage, bugs and extra keywords", () => {
    expect(pkg.homepage).toMatch(/github\.com\/Ewertonslv\/evolution-whatsapp-mcp/);
    expect(pkg.bugs.url).toMatch(/issues/);
    expect(pkg.keywords).toEqual(expect.arrayContaining(["whatsapp-mcp", "mcp-server"]));
  });
});

describe("env vars are declared everywhere", () => {
  it("finds the env vars in source", () => {
    expect(ENVS).toEqual(expect.arrayContaining(["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_READ_ONLY"]));
  });

  it.each(ENVS)("%s is in server.json and smithery.yaml", (name) => {
    const vars = server.packages[0].environmentVariables.map((v: { name: string }) => v.name);
    expect(vars).toContain(name);
    expect(smithery).toContain(name);
  });

  it("only the API key is secret, and it is required", () => {
    const vars = server.packages[0].environmentVariables;
    const key = vars.find((v: { name: string }) => v.name === "EVOLUTION_API_KEY");
    expect(key.isSecret).toBe(true);
    expect(key.isRequired).toBe(true);
    expect(vars.filter((v: { isSecret?: boolean }) => v.isSecret)).toHaveLength(1);
  });

  it("no real key value in the metadata files or .env.example", () => {
    for (const file of ["server.json", "smithery.yaml", ".env.example"]) {
      for (const line of read(file).split("\n")) {
        const m = /EVOLUTION_API_KEY["']?\s*[:=]\s*["']?([^"'\s,]*)/.exec(line);
        if (m && !m[1].startsWith("config.")) expect(["", "your-evolution-api-key"], `${file}: ${line}`).toContain(m[1]);
      }
    }
  });
});

describe("changelog", () => {
  it("has an entry for the current version", () => {
    expect(read("CHANGELOG.md")).toContain(`## [${pkg.version}]`);
  });
});
