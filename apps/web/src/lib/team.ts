import {
  formatCents,
  type Contract,
  type DashboardItem,
  type IsoDate,
  type YearMonth,
} from "@emdia/shared";
import type { Tone } from "./tone.ts";

export type TeamStatus = "active" | "pending" | "ended" | "archived";

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  active: "ativo",
  pending: "convite pendente",
  ended: "encerrado",
  archived: "removido",
};

export const TEAM_STATUS_TONE: Record<TeamStatus, Tone> = {
  active: "brand",
  pending: "amber",
  ended: "neutral",
  archived: "coral",
};

export function teamStatus(
  contract: Pick<Contract, "archivedAt" | "status" | "workerId">,
): TeamStatus {
  if (contract.archivedAt) return "archived";
  if (contract.status === "ended") return "ended";
  if (!contract.workerId) return "pending";
  return "active";
}

/** Equipe tabs. "ativos" holds everyone still working here, pending invites included. */
export const TEAM_TABS = ["ativos", "convites", "encerrados", "removidos"] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

export const TEAM_TAB_LABEL: Record<TeamTab, string> = {
  ativos: "Ativos",
  convites: "Convites pendentes",
  encerrados: "Encerrados",
  removidos: "Removidos",
};

export function inTab(item: DashboardItem, tab: TeamTab): boolean {
  const status = teamStatus(item.contract);
  switch (tab) {
    case "ativos":
      return status === "active" || status === "pending";
    case "convites":
      return status === "pending";
    case "encerrados":
      return status === "ended";
    case "removidos":
      return status === "archived";
  }
}

export function tabCounts(items: readonly DashboardItem[]): Record<TeamTab, number> {
  return Object.fromEntries(
    TEAM_TABS.map((t) => [t, items.filter((i) => inTab(i, t)).length]),
  ) as Record<TeamTab, number>;
}

/** Days before today that were expected and have no record. Today itself isn't late yet. */
export function lateDates(item: DashboardItem, today: IsoDate): IsoDate[] {
  return item.summary.unrecordedDates.filter((d) => d < today);
}

/** "2/9", "visitas 1/2" or just "3" for on-demand. */
export function attendanceShort(item: DashboardItem): string {
  const { daysWorked, expectedDays } = item.summary;
  if (item.contract.schedule.kind === "on_demand" || expectedDays === 0) return String(daysWorked);
  return `${daysWorked}/${expectedDays}`;
}

export type TodayState = "in" | "out" | "done" | "absent" | "off" | "waiting" | "none";

export interface TodayInfo {
  /** The schedule expects this person today. */
  expected: boolean;
  state: TodayState;
  text: string;
}

export function todayInfo(item: DashboardItem, today: IsoDate): TodayInfo {
  const expected = item.summary.expectedDates.includes(today);
  const e = item.today;
  if (e && e.status === "worked") {
    if (e.checkOut) return { expected, state: "done", text: `Saiu ${e.checkOut}` };
    if (e.checkIn) return { expected, state: "in", text: `Entrou ${e.checkIn}` };
  }
  if (e && e.status === "absent") return { expected, state: "absent", text: "Faltou" };
  if (e && e.status !== "worked")
    return { expected, state: "off", text: e.status === "holiday" ? "Feriado" : "Folga" };
  if (expected) return { expected, state: "waiting", text: "Ainda não chegou" };
  return { expected, state: "none", text: "—" };
}

export interface Pendency {
  key: string;
  contractId: string;
  tone: Tone;
  text: string;
  /** Where the fix happens. */
  to: string;
}

/**
 * Things the employer should act on, most urgent first: late days, then payments the
 * worker hasn't acknowledged, entries waiting for confirmation, invites nobody used.
 */
export function pendencies(
  items: readonly DashboardItem[],
  today: IsoDate,
  month: YearMonth,
): Pendency[] {
  const late: Pendency[] = [];
  const payments: Pendency[] = [];
  const confirm: Pendency[] = [];
  const invites: Pendency[] = [];
  for (const item of items) {
    const c = item.contract;
    const status = teamStatus(c);
    if (status === "archived" || status === "ended") continue;
    const name = c.workerName;
    const days = lateDates(item, today).length;
    if (days > 0) {
      late.push({
        key: `late-${c.id}`,
        contractId: c.id,
        tone: "coral",
        text: `${name}: ${days === 1 ? "1 dia" : `${days} dias`} sem registro`,
        to: `/equipe/${c.id}?mes=${month}`,
      });
    }
    const p = item.lastPayment;
    if (c.workerId && p && !p.acknowledgedAt) {
      payments.push({
        key: `ack-${c.id}`,
        contractId: c.id,
        tone: "amber",
        text: `${name}: pagamento de ${formatCents(p.amountCents)} sem “recebi”`,
        to: `/equipe/${c.id}/pagamentos`,
      });
    }
    if (c.workerId && item.summary.pendingConfirmation > 0) {
      const n = item.summary.pendingConfirmation;
      confirm.push({
        key: `confirm-${c.id}`,
        contractId: c.id,
        tone: "brand",
        text: `${name}: ${n === 1 ? "1 dia aguarda" : `${n} dias aguardam`} confirmação`,
        to: `/equipe/${c.id}?mes=${month}`,
      });
    }
    if (status === "pending") {
      invites.push({
        key: `invite-${c.id}`,
        contractId: c.id,
        tone: "amber",
        text: `${name}: convite ainda não usado`,
        to: `/equipe/${c.id}/visao-geral`,
      });
    }
  }
  return [...late, ...payments, ...confirm, ...invites];
}

export interface TeamTotals {
  people: number;
  minutes: number;
  dueCents: number;
  balanceCents: number;
  paidCents: number;
  late: number;
  toConfirm: number;
  unacknowledged: number;
  invites: number;
}

export function teamTotals(items: readonly DashboardItem[], today: IsoDate): TeamTotals {
  const current = items.filter((i) => {
    const s = teamStatus(i.contract);
    return s === "active" || s === "pending";
  });
  return {
    people: current.length,
    minutes: current.reduce((s, i) => s + i.summary.totalMinutes, 0),
    dueCents: current.reduce((s, i) => s + i.summary.dueCents, 0),
    balanceCents: current.reduce((s, i) => s + Math.max(0, i.summary.balanceCents), 0),
    paidCents: current.reduce((s, i) => s + i.summary.paidCents, 0),
    late: current.reduce((s, i) => s + lateDates(i, today).length, 0),
    toConfirm: current.reduce(
      (s, i) => s + (i.contract.workerId ? i.summary.pendingConfirmation : 0),
      0,
    ),
    unacknowledged: current.filter(
      (i) => i.contract.workerId && i.lastPayment && !i.lastPayment.acknowledgedAt,
    ).length,
    invites: current.filter((i) => teamStatus(i.contract) === "pending").length,
  };
}

/** Best phone for contact links: the worker's own profile wins over what the employer typed. */
export function contactPhone(c: Pick<Contract, "workerPhone" | "contactPhone">): string | null {
  return c.workerPhone ?? c.contactPhone ?? null;
}

/** A month after today's: nothing recorded yet, numbers are projections. */
export function isFutureMonth(month: YearMonth, today: IsoDate): boolean {
  return month > today.slice(0, 7);
}

export interface Projection {
  people: number;
  /** Expected days (visits for per_month) across the team. */
  days: number;
  /** Expected minutes, from the expected times; contracts without times count 0. */
  minutes: number;
  /** Expected cost; contracts that can't be priced are left out and counted in `unpriced`. */
  cents: number;
  unpriced: number;
}

export function projectedMinutes(item: DashboardItem): number | null {
  const e = item.estimate;
  return e.minutesPerDay === null ? null : e.days * e.minutesPerDay;
}

/** Totals of `DashboardItem.estimate` for a future month: never mixed with actuals. */
export function projectionTotals(items: readonly DashboardItem[]): Projection {
  const current = items.filter((i) => {
    const s = teamStatus(i.contract);
    return s === "active" || s === "pending";
  });
  return {
    people: current.length,
    days: current.reduce((s, i) => s + i.estimate.days, 0),
    minutes: current.reduce((s, i) => s + (projectedMinutes(i) ?? 0), 0),
    cents: current.reduce((s, i) => s + (i.estimate.cents ?? 0), 0),
    unpriced: current.filter((i) => i.estimate.cents === null).length,
  };
}

export type TeamRowAction = "clock-in" | "clock-out" | "pay" | "restore";

/**
 * The quick actions shown inline on a team row, most frequent first (the table keeps at most
 * two inline): restore for removed people; otherwise bater entrada/saída when it's today's
 * month and the day is still open, then registrar pagamento while the contract is writable.
 */
export function teamRowActions(
  item: DashboardItem,
  ctx: {
    currentMonth: boolean;
    projected: boolean;
    clock: "in" | "out" | "done" | "off";
    writable: boolean;
  },
): TeamRowAction[] {
  if (teamStatus(item.contract) === "archived") return ["restore"];
  const out: TeamRowAction[] = [];
  if (ctx.currentMonth && !ctx.projected && (ctx.clock === "in" || ctx.clock === "out")) {
    out.push(ctx.clock === "in" ? "clock-in" : "clock-out");
  }
  if (ctx.writable) out.push("pay");
  return out;
}
