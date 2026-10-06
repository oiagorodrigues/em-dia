import {
  estimateAverageMonthlyCost,
  estimateMonthCost,
  formatCents,
  formatDuration,
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

  if (draft.schedule.kind === "on_demand" && draft.payType !== "monthly")
    return none("quando precisar não tem custo fixo: entra o que for anotado");
  if (scheduleIsEmpty(draft.schedule) && draft.payType !== "monthly")
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

/** "das 08:00 às 17:00 · 9h por dia" */
export function describeHours(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `das ${start} às ${end} · ${formatDuration(shiftMinutes(start, end))} por dia`;
}
