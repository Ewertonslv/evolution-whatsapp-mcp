import type { ConfirmMode } from "./mode.js";
import { buildPreview, formatPreview, type WriteAction } from "./preview.js";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

interface ElicitParams {
  mode: "form";
  message: string;
  requestedSchema: {
    type: "object";
    properties: { confirm: { type: "boolean"; title: string; default: boolean } };
    required: string[];
  };
}

/** What the gate needs from `server.elicitInput`; injectable so tests need no client. */
export type ElicitFn = (
  params: ElicitParams,
  options: { timeout: number },
) => Promise<{ action: string; content?: Record<string, unknown> }>;

export interface GateContext {
  mode: ConfirmMode;
  elicit: ElicitFn;
}

/** How long the human has to answer the dialog. */
export const ELICIT_TIMEOUT_MS = 120_000;

const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Fail closed: runs `execute` only in direct mode or after an explicit, strict human "yes". */
export async function guardWrite(
  ctx: GateContext,
  op: { action: WriteAction; args: Record<string, unknown>; execute: () => Promise<ToolResult> },
): Promise<ToolResult> {
  if (ctx.mode === "direct") return op.execute();
  if (ctx.mode === "refuse") {
    return fail(
      "This client can't show a confirmation, so nothing was sent. Use a client with MCP Apps or " +
        "elicitation, or unset EVOLUTION_CONFIRM_WRITES.",
    );
  }
  let confirmed = false;
  try {
    const answer = await ctx.elicit(
      {
        mode: "form",
        message: formatPreview(buildPreview(op.action, op.args)),
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean", title: "Send it?", default: false } },
          required: ["confirm"],
        },
      },
      { timeout: ELICIT_TIMEOUT_MS },
    );
    confirmed = answer.action === "accept" && answer.content?.confirm === true;
  } catch {
    confirmed = false;
  }
  return confirmed ? op.execute() : fail("Not confirmed. Nothing was sent.");
}
