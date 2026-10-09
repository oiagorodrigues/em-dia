import { describe, expect, it } from "vite-plus/test";
import { bulkSummary, countOf, runEach } from "./bulk.ts";

describe("runEach", () => {
  it("runs every item with at most `concurrency` in flight and keeps the failures", async () => {
    let running = 0;
    let peak = 0;
    const outcome = await runEach(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 1));
        running--;
        if (n % 3 === 0) throw new Error(`falhou ${n}`);
        return n * 10;
      },
      3,
    );
    expect(peak).toBe(3);
    expect(outcome.done.map((d) => d.result).sort((a, b) => a - b)).toEqual([10, 20, 40, 50, 70]);
    expect(outcome.failed.map((f) => f.item).sort((a, b) => a - b)).toEqual([3, 6]);
  });

  it("does nothing for an empty list", async () => {
    expect(await runEach([], async () => 1)).toEqual({ done: [], failed: [] });
  });
});

describe("bulkSummary", () => {
  it("says what went through", () => {
    expect(bulkSummary({ done: "3 pagamentos concluídos", skipped: 0, failed: [] })).toEqual({
      message: "3 pagamentos concluídos.",
      tone: "success",
    });
  });

  it("counts what was left out and why the rest failed", () => {
    expect(
      bulkSummary({
        done: "3 pagamentos concluídos",
        skipped: 2,
        skippedReason: "já concluídos",
        failed: ["Contrato encerrado"],
      }),
    ).toEqual({
      message:
        "3 pagamentos concluídos; 2 ficaram de fora (já concluídos); 1 não deu: Contrato encerrado.",
      tone: "neutral",
    });
  });

  it("is an error when nothing went through", () => {
    const s = bulkSummary({ done: null, skipped: 0, failed: ["A", "B", "A"] });
    expect(s).toEqual({ message: "3 não deram: A e outros motivos.", tone: "error" });
  });
});

it("countOf pluralizes past one", () => {
  expect(countOf(1, "pessoa")).toBe("1 pessoa");
  expect(countOf(2, "pessoa")).toBe("2 pessoas");
});
