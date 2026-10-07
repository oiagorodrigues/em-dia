import { ENTRY_STATUS_LABEL, type EntryStatus, type WorkEntry } from "@emdia/shared";

export type ClockState = "in" | "out" | "done" | "off";

export function clockStateOf(today: WorkEntry | null, active: boolean): ClockState {
  if (!active) return "off";
  if (!today || today.status !== "worked" || !today.checkIn) return "in";
  if (!today.checkOut) return "out";
  return "done";
}

/** "Entrou às 08:02", "Saiu às 17:00", "Folga", "Sem registro hoje" */
export function todayStatusText(today: WorkEntry | null): string {
  if (!today) return "Sem registro hoje";
  if (today.status !== "worked") return ENTRY_STATUS_LABEL[today.status];
  if (today.checkOut) return `Saiu às ${today.checkOut}`;
  if (today.checkIn) return `Entrou às ${today.checkIn}`;
  return "Sem registro hoje";
}

/** Same colors as the month board: worked mint, falta coral, the excused kinds butter. */
export const ENTRY_TONE: Record<EntryStatus, "brand" | "coral" | "amber"> = {
  worked: "brand",
  absent: "coral",
  excused: "amber",
  day_off: "amber",
  holiday: "amber",
};
