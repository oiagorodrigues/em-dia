import { DEFAULT_TIMEZONE, nowInZone } from "@ponto/shared";

export function greeting(now: Date = new Date()): string {
  const hour = Number(nowInZone(DEFAULT_TIMEZONE, now).time.slice(0, 2));
  if (hour < 5) return "boa noite";
  if (hour < 12) return "bom dia";
  if (hour < 18) return "boa tarde";
  return "boa noite";
}
