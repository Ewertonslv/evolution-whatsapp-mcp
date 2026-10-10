/**
 * Thin REST client for the Evolution API (self-hosted WhatsApp).
 *
 * Ported from a production integration: auth via the `apikey` header, one
 * instance per WhatsApp number. No business logic here, just the API surface.
 *
 * Docs: https://doc.evolution-api.com/
 */
import { normalizePhone } from "./schemas.js";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  defaultInstance?: string;
  /** Per-request timeout in ms. Defaults to 30000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

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
  private readonly timeoutMs: number;
  readonly defaultInstance?: string;

  constructor(config: EvolutionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultInstance = config.defaultInstance || undefined;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { apikey: this.apiKey, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new EvolutionError(
        timedOut
          ? `Evolution API ${method} ${path} timed out after ${this.timeoutMs}ms`
          : `Evolution API ${method} ${path} could not be reached: ${
              err instanceof Error ? err.message : String(err)
            }`,
      );
    }

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
    return this.request("POST", `/message/sendText/${encodeURIComponent(instance)}`, {
      number: normalizePhone(number),
      text,
    });
  }

  sendMedia(instance: string, number: string, media: SendMediaInput) {
    return this.request("POST", `/message/sendMedia/${encodeURIComponent(instance)}`, {
      number: normalizePhone(number),
      ...media,
    });
  }

  // ----------------------------------------------------------------- reading

  findChats(instance: string) {
    return this.request("POST", `/chat/findChats/${encodeURIComponent(instance)}`, {});
  }

  /** Evolution paginates with `offset` as the page size, not `limit`. */
  findMessages(instance: string, remoteJid: string, limit?: number, page?: number) {
    const body: Record<string, unknown> = {
      where: { key: { remoteJid } },
    };
    if (limit !== undefined) body.offset = limit;
    if (page !== undefined) body.page = page;
    return this.request("POST", `/chat/findMessages/${encodeURIComponent(instance)}`, body);
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
    return this.request("GET", `/instance/connect/${encodeURIComponent(instance)}`);
  }

  connectionStatus(instance: string) {
    return this.request("GET", `/instance/connectionState/${encodeURIComponent(instance)}`);
  }

  disconnect(instance: string) {
    return this.request("DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
  }

  configureWebhook(instance: string, url: string, events: string[]) {
    return this.request("POST", `/webhook/set/${encodeURIComponent(instance)}`, {
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
