import { ENTRY_STATUS_LABEL, type WorkEntry } from "@ponto/shared";

export type ClockState = "in" | "out" | "done" | "off";

export function clockStateOf(today: WorkEntry | null, active: boolean): ClockState {
  if (!active) return "off";
  if (!today || today.status !== "worked" || !today.checkIn) return "in";
  if (!today.checkOut) return "out";
  return "done";
}

/** "entrou 08:02", "saiu 17:00", "folga", "sem registro" */
export function todayStatusText(today: WorkEntry | null): string {
  if (!today) return "sem registro hoje";
  if (today.status !== "worked") return ENTRY_STATUS_LABEL[today.status].toLowerCase();
  if (today.checkOut) return `saiu às ${today.checkOut}`;
  if (today.checkIn) return `entrou às ${today.checkIn}`;
  return "sem registro hoje";
}
