export const TINTS = ["mint", "peach", "butter", "sky", "rose"] as const;
export type Tint = (typeof TINTS)[number];

/** FNV-1a over the folded name: the same person gets the same tint on every screen and device. */
export function tintFor(name: string): Tint {
  const key = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return TINTS[(hash >>> 0) % TINTS.length]!;
}

/** "Maria Aparecida" → "MA", "Rosa" → "RO". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
