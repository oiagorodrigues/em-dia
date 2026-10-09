export interface BulkOutcome<T, R> {
  done: { item: T; result: R }[];
  failed: { item: T; error: unknown }[];
}

/**
 * Runs `task` for every item, at most `concurrency` at a time, and never rejects: each
 * failure is kept with its item so the others still go through.
 */
export async function runEach<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
  concurrency = 4,
): Promise<BulkOutcome<T, R>> {
  const outcome: BulkOutcome<T, R> = { done: [], failed: [] };
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        outcome.done.push({ item, result: await task(item) });
      } catch (error) {
        outcome.failed.push({ item, error });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return outcome;
}

export interface BulkSummaryInput {
  /** "3 pagamentos concluídos": what went through, already worded for the count. */
  done: string | null;
  skipped: number;
  /** Why rows were left out, e.g. "já estavam concluídos ou não são dinheiro entregue". */
  skippedReason?: string;
  /** Server messages of the rows that failed, one per row. */
  failed: readonly string[];
}

export interface BulkSummary {
  message: string;
  tone: "success" | "neutral" | "error";
}

/** "3 pagamentos concluídos; 1 ficou de fora (…); 1 não deu: <motivo>." */
export function bulkSummary({
  done,
  skipped,
  skippedReason,
  failed,
}: BulkSummaryInput): BulkSummary {
  const parts: string[] = [];
  if (done) parts.push(done);
  if (skipped > 0) {
    const left = skipped === 1 ? "1 ficou de fora" : `${skipped} ficaram de fora`;
    parts.push(skippedReason ? `${left} (${skippedReason})` : left);
  }
  if (failed.length > 0) {
    const reasons = [...new Set(failed)];
    const why = reasons.length === 1 ? reasons[0]! : `${reasons[0]!} e outros motivos`;
    parts.push(`${failed.length} não ${failed.length === 1 ? "deu" : "deram"}: ${why}`);
  }
  const text = parts.join("; ") || "Nada mudou";
  const message = `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`;
  const tone = failed.length > 0 ? (done ? "neutral" : "error") : done ? "success" : "neutral";
  return { message, tone };
}

/** "1 pagamento", "3 pagamentos": the noun takes an "s" past one. */
export function countOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
