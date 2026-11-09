import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Config } from "./config.js";
import { readClientCaps } from "./confirm/client-caps.js";
import { guardWrite, type ElicitFn } from "./confirm/gate.js";
import { chooseMode } from "./confirm/mode.js";
import type { WriteAction } from "./confirm/preview.js";
import { EvolutionClient, EvolutionError } from "./evolution.js";
import { brazilianNinthDigitVariant, isSecureWebhookUrl, normalizePhone, phoneSchema, textSchema, toRemoteJid } from "./schemas.js";

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Resolve the target instance from the tool argument or the configured default. */
function resolveInstance(client: EvolutionClient, provided?: string): string {
  const instance = provided ?? client.defaultInstance;
  if (!instance) {
    throw new Error(
      "No instance provided and EVOLUTION_DEFAULT_INSTANCE is not set. " +
        'Pass an "instance" argument or set the env var.',
    );
  }
  return instance;
}

/** Largest serialized response, in characters, handed back to the model. */
const MAX_RESPONSE_CHARS = 100_000;

const limitArg = z
  .number()
  .int()
  .min(1)
  .max(200)
  .default(50)
  .describe("Maximum items to return (1-200, default 50).");

/** Run an Evolution call and shape the result as an MCP tool response. */
async function run(fn: () => Promise<unknown>): Promise<TextResult> {
  try {
    const data = await fn();
    let out = JSON.stringify(data, null, 2) ?? "null";
    if (out.length > MAX_RESPONSE_CHARS) {
      out =
        out.slice(0, MAX_RESPONSE_CHARS) +
        "\n\n[truncated: use limit/page to read the rest in smaller pieces]";
    }
    return { content: [{ type: "text", text: out }] };
  } catch (err) {
    const message =
      err instanceof EvolutionError
        ? `${err.message}\n${err.body ?? ""}`.trim()
        : err instanceof Error
          ? err.message
          : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

/** True when a findMessages response reports no messages for the chat. */
function isEmptyMessagePage(result: unknown): boolean {
  const total = (result as { messages?: { total?: unknown } } | null)?.messages?.total;
  return total === 0;
}

const instanceArg = z
  .string()
  .optional()
  .describe("Evolution instance name. Falls back to EVOLUTION_DEFAULT_INSTANCE.");

/** Every number form (with and without the Brazilian ninth digit) the allowlist accepts. */
function expandAllowed(numbers: string[]): Set<string> {
  const set = new Set<string>();
  for (const n of numbers) {
    set.add(n);
    const variant = brazilianNinthDigitVariant(`${n}@s.whatsapp.net`);
    if (variant) set.add(variant.split("@")[0]);
  }
  return set;
}

/** Error result when `number` is outside the allowlist; null when the send may go ahead. */
function checkAllowed(allowed: Set<string>, number: string): TextResult | null {
  if (allowed.size === 0) return null;
  const jid = toRemoteJid(number);
  const [id, domain] = jid.split("@");
  // The message never echoes the number: it may be a private contact.
  const refuse = (): TextResult => ({
    content: [
      {
        type: "text",
        text: "Recipient is not in EVOLUTION_ALLOWED_NUMBERS. Nothing was sent.",
      },
    ],
    isError: true,
  });
  if (domain !== "s.whatsapp.net") return refuse();
  return allowed.has(normalizePhone(id)) ? null : refuse();
}

export function registerTools(
  server: McpServer,
  client: EvolutionClient,
  config: Partial<Config> = {},
): void {
  const writable = !config.readOnly;
  const allowed = expandAllowed(config.allowedNumbers ?? []);
  // Elicitation goes straight to `request`: the SDK helper rejects a bare `elicitation: {}`,
  // which the spec defines as form support.
  const elicit: ElicitFn = (params, options) =>
    server.server.request({ method: "elicitation/create", params }, ElicitResultSchema, options);
  /** Run a write only after the human confirmation the config asks for (after checkAllowed). */
  const guard = (action: WriteAction, args: Record<string, unknown>, execute: () => Promise<TextResult>) =>
    guardWrite({ mode: chooseMode(config, readClientCaps(server)), elicit }, { action, args, execute });

  // --------------------------------------------------------------- messaging

  if (writable) server.registerTool(
    "send_text",
    {
      description:
        "Send a WhatsApp text message to a phone number. The message reaches a real person and " +
        "can't be unsent. Don't call it twice for the same message: the second call sends a " +
        "duplicate. Don't use it to test the connection, use connection_status for that.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        instance: instanceArg,
        number: phoneSchema.describe('Recipient phone, e.g. "+55 11 99999-9999".'),
        text: textSchema.describe("Message body."),
      },
    },
    async ({ instance, number, text }) =>
      checkAllowed(allowed, number) ??
      (await guard("send_text", { number, text }, () =>
        run(() => client.sendText(resolveInstance(client, instance), number, text)),
      )),
  );

  if (writable) server.registerTool(
    "send_media",
    {
      description:
        "Send an image, video, document or audio via URL or base64. The file reaches a real " +
        "person and can't be unsent. Don't call it again after a call that returned a result, " +
        "or the file is sent twice.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        instance: instanceArg,
        number: phoneSchema.describe("Recipient phone."),
        mediatype: z.enum(["image", "video", "document", "audio"]),
        media: z.string().describe("Public URL or base64-encoded content."),
        mimetype: z.string().optional().describe('e.g. "image/png".'),
        caption: z.string().optional(),
        fileName: z.string().optional(),
        delay: z.number().int().min(0).optional().describe("Delay in ms before sending."),
      },
    },
    async ({ instance, number, mediatype, media, mimetype, caption, fileName, delay }) =>
      checkAllowed(allowed, number) ??
      (await guard("send_media", { number, mediatype, media, caption, fileName }, () =>
        run(() =>
          client.sendMedia(resolveInstance(client, instance), number, {
            mediatype,
            media,
            mimetype,
            caption,
            fileName,
            delay,
          }),
        ),
      )),
  );

  // ----------------------------------------------------------------- reading

  server.registerTool(
    "find_chats",
    {
      description:
        "List the WhatsApp chats/conversations on the instance. Returns at most `limit` " +
        "chats (default 50, max 200).",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { instance: instanceArg, limit: limitArg },
    },
    async ({ instance, limit }) =>
      run(async () => {
        const chats = await client.findChats(resolveInstance(client, instance));
        return Array.isArray(chats) ? chats.slice(0, limit) : chats;
      }),
  );

  server.registerTool(
    "find_messages",
    {
      description: "Read the message history of a chat (by phone or JID).",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        instance: instanceArg,
        chat: z
          .string()
          .describe('Phone ("5511999999999") or JID ("...@s.whatsapp.net").'),
        limit: limitArg.describe("Messages per page (1-200, default 50)."),
        page: z.number().int().positive().optional().describe("Page number, starting at 1."),
      },
    },
    async ({ instance, chat, limit, page }) =>
      run(async () => {
        const name = resolveInstance(client, instance);
        const jid = toRemoteJid(chat);
        const result = await client.findMessages(name, jid, limit, page);
        const variant = brazilianNinthDigitVariant(jid);
        if (variant && isEmptyMessagePage(result)) {
          return client.findMessages(name, variant, limit, page);
        }
        return result;
      }),
  );

  // ---------------------------------------------------------------- instance

  if (writable) server.registerTool(
    "create_instance",
    {
      description:
        "Create a new Evolution instance (a WhatsApp connection slot). Don't call it for an " +
        "instance that already exists: check with connection_status first, and use get_qrcode " +
        "to link a number to an existing instance.",
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      inputSchema: {
        instance: z.string().describe("Name for the new instance."),
      },
    },
    async ({ instance }) =>
      guard("create_instance", { instance }, () => run(() => client.createInstance(instance))),
  );

  server.registerTool(
    "get_qrcode",
    {
      description:
        "Get the QR code (base64) to link a WhatsApp number to the instance.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(async () => {
        const qr = await client.getQrcode(resolveInstance(client, instance));
        if (JSON.stringify(qr).length <= MAX_RESPONSE_CHARS) return qr;
        // Keep the pairing code and raw code; the base64 image is what blows the budget.
        const { base64: _dropped, ...rest } = (qr ?? {}) as Record<string, unknown>;
        return { ...rest, base64Omitted: "QR image too large to return; use pairingCode or code." };
      }),
  );

  server.registerTool(
    "connection_status",
    {
      description: 'Check whether the instance is connected (state "open").',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(() => client.connectionStatus(resolveInstance(client, instance))),
  );

  if (writable) server.registerTool(
    "disconnect_instance",
    {
      description:
        "Log the WhatsApp number out of the instance. Reconnecting needs a person to scan a " +
        "new QR code, so don't call it to fix a failed send or to restart the connection. " +
        "Only call it when the user asks to disconnect.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      guard("disconnect_instance", { instance: instance ?? client.defaultInstance }, () =>
        run(() => client.disconnect(resolveInstance(client, instance))),
      ),
  );

  if (writable) server.registerTool(
    "configure_webhook",
    {
      description:
        "Point the instance webhook to a public URL for inbound events. This replaces the " +
        "current webhook, so whatever was receiving events stops receiving them. Don't call " +
        "it unless the user gave you the URL.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: {
        instance: instanceArg,
        url: z
          .string()
          .refine(isSecureWebhookUrl, {
            message: "Webhook URL must use https. http is only allowed for localhost, 127.0.0.1 or [::1].",
          })
          .describe("Public HTTPS webhook URL (http only for localhost)."),
        events: z
          .array(z.string())
          .optional()
          .describe('Evolution events. Defaults to ["MESSAGES_UPSERT","CONNECTION_UPDATE"].'),
      },
    },
    async ({ instance, url, events }) =>
      guard("configure_webhook", { instance: instance ?? client.defaultInstance, url, events }, () =>
        run(() =>
          client.configureWebhook(
            resolveInstance(client, instance),
            url,
            events ?? ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          ),
        ),
      ),
  );
}
