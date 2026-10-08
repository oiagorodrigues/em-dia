import {
  derivedRates,
  estimateAverageMonthlyCost,
  estimateMonthCost,
  formatCents,
  formatDuration,
  isSalaried,
  monthName,
  parseYearMonth,
  shiftMinutes,
  type EstimateInput,
  type YearMonth,
} from "@emdia/shared";

export interface EstimateText {
  /** "R$ 1.620,00"; null when it can't be priced. */
  total: string | null;
  /** "em outubro" */
  when: string;
  /** "9 diárias × R$ 180,00", "9 dias × 8h × R$ 25,00", "salário fixo". */
  breakdown: string | null;
  /** "média de R$ 1.580,00 por mês" (12 months). Hidden when it equals the month's total. */
  average: string | null;
  /** Why there is no number: "informe os horários para estimar". */
  reason: string | null;
}

type Draft = Omit<EstimateInput, "rateCents"> & { rateCents: number | null };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function scheduleIsEmpty(s: EstimateInput["schedule"]): boolean {
  return (
    (s.kind === "weekly" && s.weekdays.length === 0) ||
    (s.kind === "month_days" && s.monthDays.length === 0) ||
    (s.kind === "per_month" && !s.visitsPerMonth)
  );
}

/** Words for the resumo panel of the contract form. */
export function describeEstimate(draft: Draft, month: YearMonth): EstimateText {
  const when = `em ${monthName(parseYearMonth(month).month)}`;
  const none = (reason: string): EstimateText => ({
    total: null,
    when,
    breakdown: null,
    average: null,
    reason,
  });

  if (draft.schedule.kind === "on_demand" && !isSalaried(draft.payType))
    return none("quando precisar não tem custo fixo: entra o que for anotado");
  if (scheduleIsEmpty(draft.schedule) && !isSalaried(draft.payType))
    return none("escolha os dias para estimar");
  if (!draft.rateCents) return none("informe o valor para estimar");

  const input: EstimateInput = { ...draft, rateCents: draft.rateCents };
  const est = estimateMonthCost(input, month);
  if (est.cents === null) {
    return none(
      draft.payType === "hourly" && est.minutesPerDay === null
        ? "informe os horários para estimar"
        : "não dá para estimar com esse combinado",
    );
  }

  const rate = formatCents(draft.rateCents);
  const unit = draft.schedule.kind === "per_month" ? ["visita", "visitas"] : ["dia", "dias"];
  let breakdown: string;
  switch (draft.payType) {
    case "daily":
      breakdown = `${plural(est.days, "diária", "diárias")} × ${rate}`;
      break;
    case "hourly":
      breakdown = `${plural(est.days, unit[0]!, unit[1]!)} × ${formatDuration(est.minutesPerDay ?? 0)} × ${rate}`;
      break;
    case "biweekly":
      breakdown = est.cents > 0 ? `2 quinzenas × ${rate}` : "fora do período do combinado";
      break;
    case "monthly":
      breakdown = est.cents > 0 ? "salário fixo do mês" : "fora do período do combinado";
      break;
  }

  const avg = estimateAverageMonthlyCost(input, month);
  return {
    total: formatCents(est.cents),
    when,
    breakdown,
    average: avg !== null && avg !== est.cents ? `média de ${formatCents(avg)} por mês` : null,
    reason: null,
  };
}

export interface RateLine {
  label: string;
  value: string;
  /** The unit the rate was typed in. */
  base: boolean;
}

/** The rate restated per month, quinzena, day and hour, for what can be worked out. */
export function describeRates(draft: Draft, month: YearMonth): RateLine[] {
  if (!draft.rateCents) return [];
  const r = derivedRates({ ...draft, rateCents: draft.rateCents }, month);
  const lines: [string, number | null, boolean][] = [
    ["Por mês", r.monthCents, draft.payType === "monthly"],
    ["Por quinzena", r.fortnightCents, draft.payType === "biweekly"],
    ["Por dia", r.dayCents, draft.payType === "daily"],
    ["Por hora", r.hourCents, draft.payType === "hourly"],
  ];
  return lines
    .filter(([, cents]) => cents !== null)
    .map(([label, cents, base]) => ({ label, value: formatCents(cents!), base }));
}

/** "das 08:00 às 17:00 · 9h por dia" */
export function describeHours(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `das ${start} às ${end} · ${formatDuration(shiftMinutes(start, end))} por dia`;
}
