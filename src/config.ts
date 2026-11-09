/** Runtime options read from the environment. Pure: takes the env, returns plain data. */

export interface Config {
  /** When true, tools that send or change state are not registered. */
  readOnly: boolean;
  /** Normalized digits of numbers allowed as send targets. Empty = no restriction. */
  allowedNumbers: string[];
  /** Non-fatal notices for the operator (write them to stderr). Never contain secrets. */
  warnings: string[];
}

import { LOCAL_HOSTS, normalizePhone } from "./schemas.js";

const TRUTHY = new Set(["true", "1", "yes"]);

export function loadConfig(env: Record<string, string | undefined>): Config {
  const readOnly = TRUTHY.has((env.EVOLUTION_READ_ONLY ?? "").trim().toLowerCase());
  const allowedNumbers = (env.EVOLUTION_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((entry) => normalizePhone(entry.trim()))
    .filter((entry) => entry.length > 0);
  const warnings: string[] = [];
  const apiUrl = env.EVOLUTION_API_URL;
  if (apiUrl && !isHttpsOrLocal(apiUrl)) {
    warnings.push(
      "EVOLUTION_API_URL is not https and not localhost: the API key travels unencrypted. Use https.",
    );
  }
  return { readOnly, allowedNumbers, warnings };
}

function isHttpsOrLocal(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || LOCAL_HOSTS.has(url.hostname);
  } catch {
    return true; // unparsable: the client reports it; no point warning twice
  }
}
