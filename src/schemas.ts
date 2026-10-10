/** Shared helpers for normalizing WhatsApp identifiers. */

/**
 * Strip formatting from a phone number, leaving only digits.
 * Evolution expects E.164 without symbols, e.g. "5511999999999".
 */
export function normalizePhone(input: string): string {
  return input.replace(/[+\-\s()]/g, "");
}

/**
 * Turn a user-friendly input into a WhatsApp JID.
 * Accepts a raw phone ("+55 11 99999-9999") or an already-formed JID
 * ("5511999999999@s.whatsapp.net"). Groups (@g.us) are passed through.
 */
export function toRemoteJid(input: string): string {
  if (input.includes("@")) return input;
  return `${normalizePhone(input)}@s.whatsapp.net`;
}

/**
 * Brazilian mobile numbers exist with and without the ninth digit
 * ("5511999999999" vs "551199999999"), and WhatsApp may store a chat under
 * either form. Returns the other form of a Brazilian JID, or null if the
 * input is not one.
 */
export function brazilianNinthDigitVariant(jid: string): string | null {
  const match = /^55(\d{2})(\d{8,9})@s\.whatsapp\.net$/.exec(jid);
  if (!match) return null;
  const [, area, local] = match;
  if (local.length === 9) {
    return local.startsWith("9") ? `55${area}${local.slice(1)}@s.whatsapp.net` : null;
  }
  return `55${area}9${local}@s.whatsapp.net`;
}
