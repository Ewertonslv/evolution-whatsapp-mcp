/** Runtime options read from the environment. Pure: takes the env, returns plain data. */

export interface Config {
  /** When true, tools that send or change state are not registered. */
  readOnly: boolean;
  /** Normalized digits of numbers allowed as send targets. Empty = no restriction. */
  allowedNumbers: string[];
}

import { normalizePhone } from "./schemas.js";

const TRUTHY = new Set(["true", "1", "yes"]);

export function loadConfig(env: Record<string, string | undefined>): Config {
  const readOnly = TRUTHY.has((env.EVOLUTION_READ_ONLY ?? "").trim().toLowerCase());
  const allowedNumbers = (env.EVOLUTION_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((entry) => normalizePhone(entry.trim()))
    .filter((entry) => entry.length > 0);
  return { readOnly, allowedNumbers };
}
