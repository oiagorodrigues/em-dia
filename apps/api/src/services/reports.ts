import type { ActivityItem, DashboardItem, IsoDate, MonthSummary, YearMonth } from "@emdia/shared";
import {
  computeMonthSummary,
  datesOfMonth,
  DEFAULT_TIMEZONE,
  estimateMonthCost,
  nowInZone,
  toYearMonth,
} from "@emdia/shared";
import { toPayment, type LocatedContract } from "../repos/index.ts";
import { listContracts, loadContract } from "./access.ts";
import { requirePermission, type Actor, type ServiceDeps } from "./context.ts";
import { brDate, statementCsv, type StatementData } from "./statement.ts";
import { renderStatementPdf } from "./statementPdf.ts";

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

  async function statementData(located: LocatedContract, month: YearMonth): Promise<StatementData> {
    const { contract } = located;
    const [{ summary, entries, payments: monthPayments }, agreements, advances] = await Promise.all(
      [
        summarize(located, month),
        repos.agreements.list(contract.id),
        repos.payments.listAdvances(contract.id),
      ],
    );
    const agreementNames = new Map(agreements.map((a) => [a.id, a.description]));
    const advanceDates = new Map(advances.map((a) => [a.id, a.paidOn]));
    const payments = [...monthPayments].reverse().map((payment) => {
      const agreement = payment.agreementId ? agreementNames.get(payment.agreementId) : undefined;
      const advancedOn = payment.advanceId ? advanceDates.get(payment.advanceId) : undefined;
      const source = agreement ?? (advancedOn ? `adiantamento de ${brDate(advancedOn)}` : null);
      return { payment, source };
    });
    const byDate = new Map(entries.map((e) => [e.date, e]));
    const unrecorded = new Set(summary.unrecordedDates);
    const expected = new Set(summary.expectedDates);
    return {
      month,
      contract,
      summary,
      days: datesOfMonth(month).map((date) => ({
        date,
        entry: byDate.get(date) ?? null,
        expected: expected.has(date),
        unrecorded: unrecorded.has(date),
      })),
      payments,
      openAdvancesCents: advances.reduce((sum, a) => sum + (a.remainingCents ?? 0), 0),
      generatedAt: nowInZone(located.timezone, deps.clock()),
    };
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

    async statementCsv(
      actor: Actor,
      contractId: string,
      month: YearMonth,
    ): Promise<{ filename: string; csv: string }> {
      const data = await statementData(await loadContract(deps, actor, contractId), month);
      return { filename: `extrato-${month}.csv`, csv: statementCsv(data) };
    },

    async statementPdf(
      actor: Actor,
      contractId: string,
      month: YearMonth,
    ): Promise<{ filename: string; pdf: Buffer }> {
      const data = await statementData(await loadContract(deps, actor, contractId), month);
      return { filename: `extrato-${month}.pdf`, pdf: await renderStatementPdf(data) };
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
