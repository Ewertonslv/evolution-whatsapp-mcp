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
