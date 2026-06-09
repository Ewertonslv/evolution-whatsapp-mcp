import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { EvolutionClient, EvolutionError } from "./evolution.js";
import { toRemoteJid } from "./schemas.js";

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

/** Run an Evolution call and shape the result as an MCP tool response. */
async function run(fn: () => Promise<unknown>): Promise<TextResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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

const instanceArg = z
  .string()
  .optional()
  .describe("Evolution instance name. Falls back to EVOLUTION_DEFAULT_INSTANCE.");

export function registerTools(server: McpServer, client: EvolutionClient): void {
  // --------------------------------------------------------------- messaging

  server.registerTool(
    "send_text",
    {
      description: "Send a WhatsApp text message to a phone number.",
      inputSchema: {
        instance: instanceArg,
        number: z.string().describe('Recipient phone, e.g. "+55 11 99999-9999".'),
        text: z.string().describe("Message body."),
      },
    },
    async ({ instance, number, text }) =>
      run(() => client.sendText(resolveInstance(client, instance), number, text)),
  );

  server.registerTool(
    "send_media",
    {
      description: "Send an image, video, document or audio via URL or base64.",
      inputSchema: {
        instance: instanceArg,
        number: z.string().describe("Recipient phone."),
        mediatype: z.enum(["image", "video", "document", "audio"]),
        media: z.string().describe("Public URL or base64-encoded content."),
        mimetype: z.string().optional().describe('e.g. "image/png".'),
        caption: z.string().optional(),
        fileName: z.string().optional(),
        delay: z.number().int().optional().describe("Delay in ms before sending."),
      },
    },
    async ({ instance, number, mediatype, media, mimetype, caption, fileName, delay }) =>
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
  );

  // ----------------------------------------------------------------- reading

  server.registerTool(
    "find_chats",
    {
      description: "List the WhatsApp chats/conversations on the instance.",
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(() => client.findChats(resolveInstance(client, instance))),
  );

  server.registerTool(
    "find_messages",
    {
      description: "Read the message history of a chat (by phone or JID).",
      inputSchema: {
        instance: instanceArg,
        chat: z
          .string()
          .describe('Phone ("5511999999999") or JID ("...@s.whatsapp.net").'),
        limit: z.number().int().positive().optional().describe("Max messages."),
      },
    },
    async ({ instance, chat, limit }) =>
      run(() =>
        client.findMessages(resolveInstance(client, instance), toRemoteJid(chat), limit),
      ),
  );

  // ---------------------------------------------------------------- instance

  server.registerTool(
    "create_instance",
    {
      description: "Create a new Evolution instance (a WhatsApp connection slot).",
      inputSchema: {
        instance: z.string().describe("Name for the new instance."),
      },
    },
    async ({ instance }) => run(() => client.createInstance(instance)),
  );

  server.registerTool(
    "get_qrcode",
    {
      description:
        "Get the QR code (base64) to link a WhatsApp number to the instance.",
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(() => client.getQrcode(resolveInstance(client, instance))),
  );

  server.registerTool(
    "connection_status",
    {
      description: 'Check whether the instance is connected (state "open").',
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(() => client.connectionStatus(resolveInstance(client, instance))),
  );

  server.registerTool(
    "disconnect_instance",
    {
      description: "Log out / disconnect the WhatsApp number from the instance.",
      inputSchema: { instance: instanceArg },
    },
    async ({ instance }) =>
      run(() => client.disconnect(resolveInstance(client, instance))),
  );

  server.registerTool(
    "configure_webhook",
    {
      description: "Point the instance webhook to a public URL for inbound events.",
      inputSchema: {
        instance: instanceArg,
        url: z.string().url().describe("Public HTTPS webhook URL."),
        events: z
          .array(z.string())
          .optional()
          .describe('Evolution events. Defaults to ["MESSAGES_UPSERT","CONNECTION_UPDATE"].'),
      },
    },
    async ({ instance, url, events }) =>
      run(() =>
        client.configureWebhook(
          resolveInstance(client, instance),
          url,
          events ?? ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        ),
      ),
  );
}
