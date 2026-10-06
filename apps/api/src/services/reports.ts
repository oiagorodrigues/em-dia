import type { ActivityItem, DashboardItem, IsoDate, MonthSummary, YearMonth } from "@ponto/shared";
import {
  computeMonthSummary,
  datesOfMonth,
  DEFAULT_TIMEZONE,
  ENTRY_STATUS_LABEL,
  formatDuration,
  formatYearMonth,
  nowInZone,
  toYearMonth,
  weekdayOf,
} from "@ponto/shared";
import { centsToDecimal, toCsv } from "../lib/csv.ts";
import { toPayment, type LocatedContract } from "../repos/index.ts";
import { listContracts, loadContract } from "./access.ts";
import { requirePermission, type Actor, type ServiceDeps } from "./context.ts";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const brDate = (date: IsoDate) => date.split("-").reverse().join("/");

export function reportsService(deps: ServiceDeps) {
  const { repos } = deps;
  const todayIn = (timezone: string) => nowInZone(timezone, deps.clock()).date;

  function summarize({ contract, timezone }: LocatedContract, month: YearMonth) {
    const entries = repos.entries.listByMonth(contract.id, month);
    const summary = computeMonthSummary({
      contract,
      month,
      entries,
      adjustments: repos.adjustments.listByMonth(contract.id, month),
      payments: repos.payments.listByMonth(contract.id, month),
      today: todayIn(timezone),
    });
    return { summary, entries };
  }

  return {
    summary(actor: Actor, contractId: string, month: YearMonth): MonthSummary {
      return summarize(loadContract(deps, actor, contractId), month).summary;
    },

    statement(
      actor: Actor,
      contractId: string,
      month: YearMonth,
    ): { filename: string; csv: string } {
      const located = loadContract(deps, actor, contractId);
      const { contract } = located;
      const { summary, entries } = summarize(located, month);
      const byDate = new Map(entries.map((e) => [e.date, e]));
      const unrecorded = new Set(summary.unrecordedDates);

      const days = datesOfMonth(month).map((date) => {
        const e = byDate.get(date);
        const status = e
          ? ENTRY_STATUS_LABEL[e.status]
          : unrecorded.has(date)
            ? "Não registrado"
            : "";
        return [
          brDate(date),
          WEEKDAY_SHORT[weekdayOf(date)] ?? "",
          status,
          e?.checkIn ?? "",
          e?.checkOut ?? "",
          e && e.status === "worked" ? e.breakMinutes : "",
          e && e.minutes > 0 ? formatDuration(e.minutes) : "",
          e ? (e.confirmedAt ? "Sim" : "Não") : "",
          e?.note ?? "",
        ];
      });

      const csv = toCsv([
        ["Extrato", formatYearMonth(month)],
        ["Profissional", contract.workerName],
        ["Contratante", contract.employerName],
        ["Casa", contract.householdName],
        [],
        [
          "Data",
          "Dia",
          "Situação",
          "Entrada",
          "Saída",
          "Pausa (min)",
          "Horas",
          "Confirmado",
          "Observação",
        ],
        ...days,
        [],
        ["Dias trabalhados", summary.daysWorked],
        ["Horas trabalhadas", formatDuration(summary.totalMinutes)],
        ["Faltas", summary.absences],
        ["Faltas justificadas", summary.excused],
        ["Valor bruto (R$)", centsToDecimal(summary.grossCents)],
        ["Ajustes (R$)", centsToDecimal(summary.adjustmentsCents)],
        ["Total devido (R$)", centsToDecimal(summary.dueCents)],
        ["Pago (R$)", centsToDecimal(summary.paidCents)],
        ["Saldo (R$)", centsToDecimal(summary.balanceCents)],
      ]);
      return { filename: `extrato-${month}.csv`, csv };
    },

    activity(actor: Actor, contractId: string, limit: number): ActivityItem[] {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "activity:read");
      return repos.audit.listByContract(contractId, limit);
    },

    dashboard(actor: Actor): { items: DashboardItem[]; month: YearMonth; today: IsoDate } {
      const items = listContracts(deps, actor)
        .filter((l) => l.contract.status === "active")
        .map((located): DashboardItem => {
          const today = todayIn(located.timezone);
          const latest = repos.payments.latest(located.contract.id);
          return {
            contract: located.contract,
            summary: summarize(located, toYearMonth(today)).summary,
            today: repos.entries.find(located.contract.id, today) ?? null,
            lastPayment: latest ? toPayment(latest) : null,
          };
        });
      const today = todayIn(DEFAULT_TIMEZONE);
      return { items, month: toYearMonth(today), today };
    },
  };
}
