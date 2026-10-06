import {
  formatCents,
  type Contract,
  type DashboardItem,
  type MonthSummary,
  type Payment,
  type WorkEntry,
} from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  attendanceShort,
  inTab,
  isFutureMonth,
  projectionTotals,
  teamRowActions,
  pendencies,
  tabCounts,
  teamStatus,
  teamTotals,
  todayInfo,
} from "./team.ts";

const TODAY = "2026-10-06";

function item(
  name: string,
  opts: {
    contract?: Partial<Contract>;
    summary?: Partial<MonthSummary>;
    today?: Partial<WorkEntry> | null;
    lastPayment?: Partial<Payment> | null;
    estimate?: Partial<DashboardItem["estimate"]>;
  } = {},
): DashboardItem {
  return {
    contract: {
      id: name.toLowerCase(),
      workerName: name,
      workerId: "w",
      status: "active",
      archivedAt: null,
      schedule: {
        kind: "weekly",
        weekdays: [1, 2, 3, 4, 5],
        everyWeeks: 1,
        monthDays: [],
        visitsPerMonth: null,
      },
      ...opts.contract,
    } as Contract,
    summary: {
      totalMinutes: 600,
      daysWorked: 2,
      expectedDays: 22,
      expectedDates: [TODAY],
      unrecordedDates: [],
      pendingConfirmation: 0,
      dueCents: 10000,
      paidCents: 0,
      balanceCents: 10000,
      ...opts.summary,
    } as MonthSummary,
    today: opts.today === undefined ? null : (opts.today as WorkEntry | null),
    lastPayment: opts.lastPayment ? (opts.lastPayment as Payment) : null,
    estimate: { month: "2026-11", days: 9, minutesPerDay: 480, cents: 162000, ...opts.estimate },
  };
}

describe("team status and tabs", () => {
  const items = [
    item("Ana"),
    item("Bia", { contract: { workerId: null } }),
    item("Cida", { contract: { status: "ended" } }),
    item("Dora", { contract: { archivedAt: "2026-09-20T10:00:00Z" } }),
  ];

  it("derives one status per contract, removal winning over everything", () => {
    expect(items.map((i) => teamStatus(i.contract))).toEqual([
      "active",
      "pending",
      "ended",
      "archived",
    ]);
    expect(teamStatus({ archivedAt: "x", status: "ended", workerId: null })).toBe("archived");
  });

  it("counts tabs, with pending invites inside ativos", () => {
    expect(tabCounts(items)).toEqual({ ativos: 2, convites: 1, encerrados: 1, removidos: 1 });
    expect(inTab(items[1]!, "ativos")).toBe(true);
    expect(inTab(items[3]!, "ativos")).toBe(false);
  });
});

describe("today", () => {
  it("reads the day's record before the schedule", () => {
    expect(
      todayInfo(
        item("A", { today: { status: "worked", checkIn: "08:02", checkOut: null } }),
        TODAY,
      ),
    ).toMatchObject({
      state: "in",
      text: "entrou 08:02",
    });
    expect(todayInfo(item("A", { today: { status: "absent" } }), TODAY).state).toBe("absent");
    expect(todayInfo(item("A"), TODAY)).toMatchObject({ expected: true, state: "waiting" });
    expect(todayInfo(item("A", { summary: { expectedDates: [] } }), TODAY)).toMatchObject({
      expected: false,
      state: "none",
    });
  });
});

describe("pendencies", () => {
  it("lists late days first, then unacknowledged payments, confirmations and invites", () => {
    const list = pendencies(
      [
        item("Bia", { contract: { workerId: null } }),
        item("Ana", {
          summary: { unrecordedDates: ["2026-10-01", "2026-10-02", TODAY], pendingConfirmation: 2 },
          lastPayment: { amountCents: 18000, acknowledgedAt: null },
        }),
        item("Dora", {
          contract: { archivedAt: "x" },
          summary: { unrecordedDates: ["2026-10-01"] },
        }),
      ],
      TODAY,
      "2026-10",
    );
    expect(list.map((p) => p.text)).toEqual([
      "Ana: 2 dias sem registro",
      `Ana: pagamento de ${formatCents(18000)} sem “recebi”`,
      "Ana: 2 dias aguardam confirmação",
      "Bia: convite ainda não usado",
    ]);
    expect(list[0]!.to).toBe("/equipe/ana?mes=2026-10");
  });

  it("totals only people still working here", () => {
    const t = teamTotals(
      [
        item("Ana", { summary: { balanceCents: -500, paidCents: 2000 } }),
        item("Bia", { summary: { unrecordedDates: ["2026-10-01"] } }),
        item("Cida", { contract: { status: "ended" } }),
      ],
      TODAY,
    );
    expect(t).toMatchObject({
      people: 2,
      minutes: 1200,
      balanceCents: 10000,
      paidCents: 2000,
      late: 1,
    });
  });

  it("formats attendance per schedule kind", () => {
    expect(attendanceShort(item("A"))).toBe("2/22");
    expect(
      attendanceShort(
        item("A", {
          contract: {
            schedule: {
              kind: "on_demand",
              weekdays: [],
              everyWeeks: 1,
              monthDays: [],
              visitsPerMonth: null,
            },
          },
        }),
      ),
    ).toBe("2");
  });
});

describe("projections", () => {
  it("knows a future month from the current one", () => {
    expect(isFutureMonth("2026-11", TODAY)).toBe(true);
    expect(isFutureMonth("2026-10", TODAY)).toBe(false);
    expect(isFutureMonth("2026-09", TODAY)).toBe(false);
  });

  it("adds up the estimates of people still working here, counting what can't be priced", () => {
    const p = projectionTotals([
      item("Ana"),
      item("Bia", { estimate: { cents: null, minutesPerDay: null, days: 4 } }),
      item("Cida", { contract: { archivedAt: "x" } }),
    ]);
    expect(p).toEqual({ people: 2, days: 13, minutes: 9 * 480, cents: 162000, unpriced: 1 });
  });
});

describe("teamRowActions", () => {
  const ctx = { currentMonth: true, projected: false, clock: "in" as const, writable: true };

  it("puts bater entrada/saída first, then registrar pagamento", () => {
    expect(teamRowActions(item("Ana"), ctx)).toEqual(["clock-in", "pay"]);
    expect(teamRowActions(item("Ana"), { ...ctx, clock: "out" })).toEqual(["clock-out", "pay"]);
  });

  it("drops the clock outside today's month, in projections and once the day is closed", () => {
    expect(teamRowActions(item("Ana"), { ...ctx, currentMonth: false })).toEqual(["pay"]);
    expect(teamRowActions(item("Ana"), { ...ctx, projected: true })).toEqual(["pay"]);
    expect(teamRowActions(item("Ana"), { ...ctx, clock: "done" })).toEqual(["pay"]);
  });

  it("offers only restore for removed people and nothing writable for ended ones", () => {
    expect(teamRowActions(item("Ana", { contract: { archivedAt: "x" } }), ctx)).toEqual([
      "restore",
    ]);
    expect(
      teamRowActions(item("Ana", { contract: { status: "ended" } }), {
        ...ctx,
        clock: "off",
        writable: false,
      }),
    ).toEqual([]);
  });
});
