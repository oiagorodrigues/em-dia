/** Alphabet the API uses for invite codes (no 0/O, 1/I/L). */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;

export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, INVITE_LENGTH);
}

export function inviteLink(code: string, origin = window.location.origin): string {
  return `${origin}/criar-conta?convite=${encodeURIComponent(code)}`;
}
