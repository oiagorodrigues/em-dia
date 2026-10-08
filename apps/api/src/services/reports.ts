import type { ActivityItem, DashboardItem, IsoDate, MonthSummary, YearMonth } from "@emdia/shared";
import {
  computeMonthSummary,
  datesOfMonth,
  DEFAULT_TIMEZONE,
  describeSchedule,
  ENTRY_STATUS_LABEL,
  estimateMonthCost,
  handsMoney,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  formatDuration,
  formatYearMonth,
  nowInZone,
  toYearMonth,
  weekdayOf,
} from "@emdia/shared";
import { centsToDecimal, toCsv } from "../lib/csv.ts";
import { toPayment, type LocatedContract } from "../repos/index.ts";
import { listContracts, loadContract } from "./access.ts";
import { requirePermission, type Actor, type ServiceDeps } from "./context.ts";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const brDate = (date: IsoDate) => date.split("-").reverse().join("/");

export function reportsService(deps: ServiceDeps) {
  const { repos } = deps;
  const todayIn = (timezone: string) => nowInZone(timezone, deps.clock()).date;

  /** Queries run concurrently: against a remote database each one is a round trip. */
  async function summarize({ contract, timezone }: LocatedContract, month: YearMonth) {
    const [entries, payments] = await Promise.all([
      repos.entries.listByMonth(contract.id, month),
      repos.payments.listByMonth(contract.id, month),
    ]);
    const summary = computeMonthSummary({
      contract,
      month,
      entries,
      payments,
      today: todayIn(timezone),
    });
    return { summary, entries, payments };
  }

  async function teamItem(located: LocatedContract, month: YearMonth): Promise<DashboardItem> {
    const { contract } = located;
    const [{ summary }, latest, today] = await Promise.all([
      summarize(located, month),
      repos.payments.latest(contract.id),
      repos.entries.find(contract.id, todayIn(located.timezone)),
    ]);
    return {
      contract,
      summary,
      estimate: estimateMonthCost(contract, month),
      today: today ?? null,
      lastPayment: latest ? toPayment(latest) : null,
    };
  }

  return {
    async summary(actor: Actor, contractId: string, month: YearMonth): Promise<MonthSummary> {
      return (await summarize(await loadContract(deps, actor, contractId), month)).summary;
    },

    async statement(
      actor: Actor,
      contractId: string,
      month: YearMonth,
    ): Promise<{ filename: string; csv: string }> {
      const located = await loadContract(deps, actor, contractId);
      const { contract } = located;
      const [{ summary, entries, payments: monthPayments }, agreements, advances] =
        await Promise.all([
          summarize(located, month),
          repos.agreements.list(contract.id),
          repos.payments.listAdvances(contract.id),
        ]);
      const agreementNames = new Map(agreements.map((a) => [a.id, a.description]));
      const advanceDates = new Map(advances.map((a) => [a.id, a.paidOn]));
      const payments = [...monthPayments].reverse().map((p) => {
        const agreement = p.agreementId ? agreementNames.get(p.agreementId) : undefined;
        const advancedOn = p.advanceId ? advanceDates.get(p.advanceId) : undefined;
        const method = p.method ? PAYMENT_METHOD_LABEL[p.method] : "";
        const source = agreement ?? (advancedOn ? `adiantamento de ${brDate(advancedOn)}` : null);
        return [
          brDate(p.paidOn),
          PAYMENT_KIND_LABEL[p.kind],
          source ? `${method}: ${source}` : method,
          centsToDecimal(p.amountCents),
          handsMoney(p) ? (p.acknowledgedAt ? "Sim" : "Não") : "",
          p.note ?? "",
        ];
      });
      const byDate = new Map(entries.map((e) => [e.date, e]));
      const unrecorded = new Set(summary.unrecordedDates);
      const expected = new Set(summary.expectedDates);

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
          expected.has(date) ? "Sim" : "",
          status,
          e?.checkIn ?? "",
          e?.checkOut
            ? e.checkOutDate
              ? `${e.checkOutDate.split("-").reverse().join("/")} ${e.checkOut}`
              : e.checkOut
            : "",
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
        ["Combinado", describeSchedule(contract.schedule)],
        [],
        [
          "Data",
          "Dia",
          "Previsto",
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
        ["Dias previstos", summary.expectedDays],
        ["Dias trabalhados", summary.daysWorked],
        ["Horas trabalhadas", formatDuration(summary.totalMinutes)],
        ["Faltas", summary.absences],
        ["Faltas justificadas", summary.excused],
        ["Valor bruto (R$)", centsToDecimal(summary.grossCents)],
        ["Desconto por faltas (R$)", centsToDecimal(summary.absenceDeductionCents)],
        ["Adicional noturno (R$)", centsToDecimal(summary.nightBonusCents)],
        [
          "Gratificações, vale-transporte e descontos (R$)",
          centsToDecimal(summary.adjustmentsCents),
        ],
        ["Total devido (R$)", centsToDecimal(summary.dueCents)],
        ["Pago (R$)", centsToDecimal(summary.paidCents)],
        ["Saldo (R$)", centsToDecimal(summary.balanceCents)],
        [
          "Adiantamentos ainda a abater (R$)",
          centsToDecimal(advances.reduce((sum, a) => sum + (a.remainingCents ?? 0), 0)),
        ],
        [],
        ["Pagamentos"],
        ["Data", "Tipo", "Forma", "Valor (R$)", "Recebido", "Observação"],
        ...payments,
      ]);
      return { filename: `extrato-${month}.csv`, csv };
    },

    async activity(actor: Actor, contractId: string, limit: number): Promise<ActivityItem[]> {
      await loadContract(deps, actor, contractId);
      requirePermission(actor, "activity:read");
      return repos.audit.listByContract(contractId, limit);
    },

    /** Active contracts; `month` defaults to each household's current month. */
    async dashboard(
      actor: Actor,
      month: YearMonth | undefined,
    ): Promise<{ items: DashboardItem[]; month: YearMonth; today: IsoDate }> {
      const active = (await listContracts(deps, actor)).filter(
        (l) => l.contract.status === "active",
      );
      const items = await Promise.all(
        active.map((l) => teamItem(l, month ?? toYearMonth(todayIn(l.timezone)))),
      );
      const today = todayIn(DEFAULT_TIMEZONE);
      return { items, month: month ?? toYearMonth(today), today };
    },

    /** Every contract the actor can see, ended ones included, with `month`'s numbers. */
    async team(
      actor: Actor,
      month: YearMonth | undefined,
      includeArchived: boolean,
    ): Promise<{ items: DashboardItem[]; month: YearMonth; today: IsoDate }> {
      const today = todayIn(DEFAULT_TIMEZONE);
      const target = month ?? toYearMonth(today);
      const contracts = await listContracts(deps, actor, includeArchived);
      const items = await Promise.all(contracts.map((l) => teamItem(l, target)));
      return { items, month: target, today };
    },
  };
}
