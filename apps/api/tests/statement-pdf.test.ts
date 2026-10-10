import type { Contract, Payment, WorkEntry } from "@emdia/shared";
import { computeMonthSummary, datesOfMonth } from "@emdia/shared";
import { describe, expect, test } from "vite-plus/test";
import type { StatementData } from "../src/services/statement.ts";
import { renderStatementPdf, toWinAnsi } from "../src/services/statementPdf.ts";

/** Text of every TJ operator in an uncompressed pdfkit file, one string per operator. */
function textRuns(pdf: Buffer): string[] {
  const src = pdf.toString("latin1");
  return [...src.matchAll(/\[(.*?)\] TJ/g)].map(([, ops]) =>
    [...ops!.matchAll(/<([0-9a-f]*)>/g)]
      .map(([, hex]) => Buffer.from(hex!, "hex").toString("latin1"))
      .join(""),
  );
}

const contract = {
  id: "c1",
  householdName: "Casa da Conceição",
  employerName: "João Gonçalves",
  workerName: "Maria Antônia",
  workerId: "w1",
  payType: "daily",
  rateCents: 18000,
  schedule: { kind: "weekly", weekdays: [1, 3, 5], everyWeeks: 1 },
  deductAbsences: false,
  nightBonus: false,
  expectedStart: "08:00",
  expectedEnd: "16:00",
  startedOn: "2026-01-01",
  endedOn: null,
} as unknown as Contract;

const entry = (date: string, patch: Partial<WorkEntry> = {}): WorkEntry => ({
  id: date,
  contractId: "c1",
  date,
  status: "worked",
  checkIn: "08:00",
  checkOut: "16:00",
  checkOutDate: null,
  breakMinutes: 60,
  minutes: 420,
  note: null,
  createdBy: "w1",
  createdByRole: "worker",
  confirmedBy: null,
  confirmedAt: null,
  updatedAt: "2026-03-02T12:00:00.000Z",
  ...patch,
});

const payment = (i: number): Payment => ({
  id: `p${i}`,
  contractId: "c1",
  referenceMonth: "2026-03",
  paidOn: "2026-03-31",
  amountCents: 1000 + i,
  kind: i % 2 ? "bonus" : "pay",
  method: "pix",
  note: `Pagamento nº ${i}: açaí e pão`,
  receipt: null,
  agreementId: null,
  advanceId: null,
  settledCents: null,
  remainingCents: null,
  acknowledgedAt: i % 3 ? "2026-04-01T10:00:00.000Z" : null,
  acknowledgedBy: null,
  acknowledgedByRole: i % 3 === 1 ? "worker" : "employer",
  createdBy: "e1",
  createdAt: "2026-03-31T10:00:00.000Z",
});

function statement(entries: WorkEntry[], payments: Payment[]): StatementData {
  const summary = computeMonthSummary({
    contract,
    month: "2026-03",
    entries,
    payments,
    today: "2026-04-10",
  });
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return {
    month: "2026-03",
    contract,
    summary,
    days: datesOfMonth("2026-03").map((date) => ({
      date,
      entry: byDate.get(date) ?? null,
      expected: summary.expectedDates.includes(date),
      unrecorded: summary.unrecordedDates.includes(date),
    })),
    payments: payments.map((p) => ({ payment: p, source: null })),
    openAdvancesCents: 0,
    generatedAt: { date: "2026-04-10", time: "09:30" },
  };
}

describe("statement PDF", () => {
  test("writes Portuguese accents in the built-in fonts", async () => {
    const pdf = await renderStatementPdf(
      statement(
        [
          entry("2026-03-02", { note: "Limpeza da cozinha e área de serviço" }),
          entry("2026-03-06", {
            checkIn: "20:00",
            checkOut: "08:00",
            checkOutDate: "2026-03-07",
            minutes: 660,
          }),
          entry("2026-03-04", { status: "absent", checkIn: null, checkOut: null, minutes: 0 }),
        ],
        [payment(1)],
      ),
      { compress: false },
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = textRuns(pdf).join("\n");
    expect(text).toContain("Extrato de março de 2026");
    expect(text).toContain("Casa da Conceição");
    expect(text).toContain("João Gonçalves");
    expect(text).toContain("Pagamento nº 1: açaí e pão");
    expect(text).toContain("07/03 08:00");
    expect(text).toContain("Seg, qua e sex, das 08:00 às 16:00 · R$\u00a0180,00 por diária");
    expect(text).toContain("Total devido");
    expect(text).toContain("Gerado pelo em dia · página 1 de 2");
  });

  test("repeats the table header and numbers every page of a long month", async () => {
    const pdf = await renderStatementPdf(
      statement(
        [entry("2026-03-02")],
        Array.from({ length: 60 }, (_, i) => payment(i)),
      ),
      { compress: false },
    );
    const runs = textRuns(pdf);
    const pages = runs.filter((r) => r.startsWith("Gerado pelo em dia"));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.at(-1)).toBe(`Gerado pelo em dia · página ${pages.length} de ${pages.length}`);
    expect(runs.filter((r) => r === "COMO PAGOU").length).toBeGreaterThan(1);
  });

  test("shows the empty states", async () => {
    const empty = statement([], []);
    empty.contract = { ...contract, schedule: { kind: "on_demand" } } as Contract;
    empty.days = empty.days.map((d) => ({ ...d, expected: false, unrecorded: false }));
    const text = textRuns(await renderStatementPdf(empty, { compress: false })).join("\n");
    expect(text).toContain("Nenhum dia registrado ou previsto neste mês.");
    expect(text).toContain("Nenhum pagamento registrado para este mês.");
  });

  test("maps text the WinAnsi fonts cannot encode", () => {
    expect(toWinAnsi("ç ã é º € − 🙂\nfim")).toBe("ç ã é º € - ? fim");
    expect(toWinAnsi("Conceição")).toBe("Conceição");
  });
});
