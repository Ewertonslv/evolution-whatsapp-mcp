/**
 * Thin REST client for the Evolution API (self-hosted WhatsApp).
 *
 * Ported from a production integration: auth via the `apikey` header, one
 * instance per WhatsApp number. No business logic here — just the API surface.
 *
 * Docs: https://doc.evolution-api.com/
 */
import { normalizePhone } from "./schemas.js";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  defaultInstance?: string;
}

export interface SendMediaInput {
  mediatype: "image" | "video" | "document" | "audio";
  media: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  delay?: number;
}

/** Error carrying the HTTP status and raw body from a failed Evolution call. */
export class EvolutionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

export class EvolutionClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly defaultInstance?: string;

  constructor(config: EvolutionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultInstance = config.defaultInstance || undefined;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!res.ok) {
      throw new EvolutionError(
        `Evolution API ${method} ${path} failed with HTTP ${res.status}`,
        res.status,
        raw,
      );
    }
    return data as T;
  }

  // --------------------------------------------------------------- messaging

  sendText(instance: string, number: string, text: string) {
    return this.request("POST", `/message/sendText/${instance}`, {
      number: normalizePhone(number),
      text,
    });
  }

  sendMedia(instance: string, number: string, media: SendMediaInput) {
    return this.request("POST", `/message/sendMedia/${instance}`, {
      number: normalizePhone(number),
      ...media,
    });
  }

  // ----------------------------------------------------------------- reading

  findChats(instance: string) {
    return this.request("POST", `/chat/findChats/${instance}`, {});
  }

  findMessages(instance: string, remoteJid: string, limit?: number) {
    const body: Record<string, unknown> = {
      where: { key: { remoteJid } },
    };
    if (limit !== undefined) body.limit = limit;
    return this.request("POST", `/chat/findMessages/${instance}`, body);
  }

  // ---------------------------------------------------------------- instance

  createInstance(instance: string) {
    return this.request("POST", `/instance/create`, {
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });
  }

  getQrcode(instance: string) {
    return this.request("GET", `/instance/connect/${instance}`);
  }

  connectionStatus(instance: string) {
    return this.request("GET", `/instance/connectionState/${instance}`);
  }

  disconnect(instance: string) {
    return this.request("DELETE", `/instance/logout/${instance}`);
  }

  configureWebhook(instance: string, url: string, events: string[]) {
    return this.request("POST", `/webhook/set/${instance}`, {
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: false,
        events,
      },
    });
  }
}
