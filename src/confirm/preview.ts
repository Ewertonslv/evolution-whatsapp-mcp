/** Human-readable preview of a write action. Pure; never echoes media or URL secrets. */

export type WriteAction =
  | "send_text"
  | "send_media"
  | "create_instance"
  | "disconnect_instance"
  | "configure_webhook";

export interface Preview {
  action: WriteAction;
  /** Always masked: safe for text the model can read. */
  target: string;
  /** Unmasked destination, only for the human (the card). Never put it in tool content. */
  targetFull: string;
  body?: string;
}

const BODY_MAX = 200;
const MESSAGE_MAX = 500;

const TITLES: Record<WriteAction, string> = {
  send_text: "Send WhatsApp text",
  send_media: "Send WhatsApp media",
  create_instance: "Create instance",
  disconnect_instance: "Log out instance",
  configure_webhook: "Replace webhook",
};

/** One line, so free text can't fake the dialog's own layout. */
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** "5511999999999" -> "+55 11 9****-9999". Group JIDs become "group chat". */
export function maskPhone(input: string): string {
  const [id, domain] = input.split("@");
  if (domain && domain !== "s.whatsapp.net") return domain === "g.us" ? "group chat" : "chat";
  const digits = id.replace(/\D/g, "");
  if (digits.length < 8) return "****";
  const last4 = digits.slice(-4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const local = digits.slice(4);
    return `+55 ${digits.slice(2, 4)} ${local[0]}${"*".repeat(local.length - 5)}-${last4}`;
  }
  return `+${digits.slice(0, 2)} ****-${last4}`;
}

function fullTarget(input: string): string {
  const [id, domain] = input.split("@");
  return domain && domain !== "s.whatsapp.net" ? input : id.replace(/\D/g, "");
}

/** Origin only: path, query and userinfo can carry tokens. */
function webhookOrigin(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname !== "/" || u.search || u.hash ? `${u.origin}/…` : u.origin;
  } catch {
    return "invalid URL";
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const name = (v: unknown): string => clip(oneLine(str(v)), 60);

export function buildPreview(action: WriteAction, args: Record<string, unknown>): Preview {
  switch (action) {
    case "send_text":
      return {
        action,
        target: maskPhone(str(args.number)),
        targetFull: fullTarget(str(args.number)),
        body: clip(oneLine(str(args.text)), BODY_MAX),
      };
    case "send_media": {
      // `media` (URL or base64) is deliberately never read here.
      const head = [str(args.mediatype), str(args.fileName)].filter(Boolean).join(" ");
      const caption = str(args.caption);
      return {
        action,
        target: maskPhone(str(args.number)),
        targetFull: fullTarget(str(args.number)),
        body: clip(oneLine(caption ? `${head}: ${caption}` : head), BODY_MAX),
      };
    }
    case "create_instance":
      return { action, target: name(args.instance), targetFull: name(args.instance), body: "integration WHATSAPP-BAILEYS" };
    case "disconnect_instance":
      return { action, target: name(args.instance), targetFull: name(args.instance), body: `Log out instance ${name(args.instance)}` };
    case "configure_webhook": {
      const events = Array.isArray(args.events) ? args.events.length : 0;
      return {
        action,
        target: str(args.instance),
        targetFull: str(args.instance),
        body: `${webhookOrigin(str(args.url))}, ${events} events`,
      };
    }
  }
}

/** Text shown by the elicitation dialog: at most 500 characters. */
export function formatPreview(p: Preview): string {
  const lines = [`${TITLES[p.action]} -> ${p.target}`];
  if (p.body) lines.push(p.body);
  return clip(lines.join("\n"), MESSAGE_MAX);
}
