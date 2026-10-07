import { estimateMonthCost, type Contract, type Schedule } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { contactChannels, contractStatus, describeEstimate, isWritable } from "./contract.ts";

const weekly: Schedule = {
  kind: "weekly",
  weekdays: [2, 5],
  everyWeeks: 1,
  monthDays: [],
  visitsPerMonth: null,
};

function contract(patch: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    householdId: "h1",
    householdName: "Minha casa",
    employerId: "u1",
    employerName: "Ana",
    workerId: "u2",
    workerName: "Maria",
    workerPhone: null,
    workerPixKey: null,
    contactEmail: null,
    contactPhone: null,
    occupation: "diarista",
    payType: "daily",
    rateCents: 18000,
    schedule: weekly,
    deductAbsences: false,
    expectedStart: "08:00",
    expectedEnd: "17:00",
    startedOn: "2026-01-01",
    endedOn: null,
    status: "active",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

describe("contractStatus", () => {
  it("prefers removed over ended over pending", () => {
    expect(contractStatus(contract()).label).toBe("Ativo");
    expect(contractStatus(contract({ workerId: null })).label).toBe("Convite pendente");
    expect(contractStatus(contract({ workerId: null, status: "ended" })).label).toBe("Encerrado");
    expect(
      contractStatus(contract({ status: "ended", archivedAt: "2026-09-20T13:00:00Z" })).state,
    ).toBe("archived");
  });

  it("matches isWritable", () => {
    expect(isWritable(contract())).toBe(true);
    expect(isWritable(contract({ archivedAt: "2026-09-20T13:00:00Z" }))).toBe(false);
    expect(isWritable(contract({ status: "ended" }))).toBe(false);
  });
});

describe("contactChannels", () => {
  it("uses the typed contact before the worker joins", () => {
    const c = contract({
      workerId: null,
      contactEmail: "joana@exemplo.com",
      contactPhone: "(11) 97777-1234",
    });
    expect(contactChannels(c)).toEqual({
      phone: "(11) 97777-1234",
      email: "joana@exemplo.com",
      pixKey: null,
    });
  });

  it("uses the worker's profile after, falling back to the typed phone", () => {
    expect(
      contactChannels(
        contract({ workerPhone: "(11) 98765-4321", workerPixKey: "pix", contactPhone: "x" }),
      ),
    ).toEqual({ phone: "(11) 98765-4321", email: null, pixKey: "pix" });
    expect(contactChannels(contract({ contactPhone: "(11) 1234-5678" })).phone).toBe(
      "(11) 1234-5678",
    );
  });
});

/** Intl puts a no-break space after "R$". */
const plain = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

describe("describeEstimate", () => {
  it("explains daily, hourly, monthly and per-month estimates", () => {
    // October 2026 has 4 Tuesdays and 5 Fridays.
    const daily = contract();
    expect(plain(describeEstimate(estimateMonthCost(daily, "2026-10"), daily))).toBe(
      "9 diárias × R$ 180,00",
    );
    const hourly = contract({ payType: "hourly", rateCents: 2500 });
    expect(plain(describeEstimate(estimateMonthCost(hourly, "2026-10"), hourly))).toBe(
      "9 dias × 9h × R$ 25,00",
    );
    const monthly = contract({ payType: "monthly", rateCents: 300000 });
    expect(plain(describeEstimate(estimateMonthCost(monthly, "2026-10"), monthly))).toBe(
      "salário fixo",
    );
    const visit = contract({ schedule: { ...weekly, kind: "per_month", visitsPerMonth: 1 } });
    expect(plain(describeEstimate(estimateMonthCost(visit, "2026-10"), visit))).toBe(
      "1 visita × R$ 180,00",
    );
  });

  it("returns null when the schedule can't be priced", () => {
    const c = contract({ schedule: { ...weekly, kind: "on_demand" } });
    expect(plain(describeEstimate(estimateMonthCost(c, "2026-10"), c))).toBeNull();
  });
});
