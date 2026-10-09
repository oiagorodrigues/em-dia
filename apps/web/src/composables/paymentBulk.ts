import type { Payment } from "@emdia/shared";
import { ref } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import { bulkSummary, countOf, runEach, type BulkOutcome } from "@/lib/bulk.ts";
import {
  awaitsReceipt,
  bulkPaymentPatch,
  canDeletePayment,
  type BulkPaymentChanges,
} from "@/lib/payments.ts";
import { useToastStore } from "@/stores/toast.ts";
import { useInvalidate, type Resource } from "./resource.ts";

export type PaymentBulkAction = "confirm" | "acknowledge" | "remove" | "edit";

interface Options {
  /** Writes the server's answers into the screen's cached list. */
  updated: (payments: Payment[]) => void;
  removed: (ids: ReadonlySet<string>) => void;
  /** The contract still takes writes (not ended or removed); other rows are left out. */
  canWrite?: (payment: Payment) => boolean;
  /** Reads that `updated`/`removed` already wrote, so they aren't refetched. */
  fresh?: () => Pick<Resource<unknown>, "key">[];
}

interface Step<R> {
  action: PaymentBulkAction;
  fits: (p: Payment) => boolean;
  task: (p: Payment) => Promise<R>;
  /** Writes what went through into the cache, before the other reads are invalidated. */
  apply: (done: BulkOutcome<Payment, R>["done"]) => void;
  done: (n: number) => string;
  skipped: string;
}

const worded = (noun: string, verb: string) => (n: number) =>
  `${countOf(n, noun)} ${n === 1 ? verb : `${verb}s`}`;

/**
 * Bulk actions on payments, one request per payment (4 at a time) through the same endpoints
 * as the row actions, so every rule the API applies to one payment applies here too. Rows an
 * action doesn't fit are left out and counted; one toast sums up what went through and why
 * the rest did not.
 */
export function usePaymentBulk(options: Options) {
  const toast = useToastStore();
  const invalidate = useInvalidate();
  const busy = ref<PaymentBulkAction | null>(null);

  async function run<R>(
    selected: readonly Payment[],
    step: Step<R>,
  ): Promise<BulkOutcome<Payment, R> | null> {
    if (busy.value) return null;
    const targets = selected.filter((p) => (options.canWrite?.(p) ?? true) && step.fits(p));
    busy.value = step.action;
    try {
      const outcome = await runEach(targets, step.task);
      if (outcome.done.length > 0) step.apply(outcome.done);
      const summary = bulkSummary({
        done: outcome.done.length > 0 ? step.done(outcome.done.length) : null,
        skipped: selected.length - targets.length,
        skippedReason: step.skipped,
        failed: outcome.failed.map((f) => errorMessage(f.error)),
      });
      toast.show(summary.message, {
        tone: summary.tone,
        timeout: outcome.failed.length > 0 ? 8000 : 4000,
      });
      const contracts = new Set(outcome.done.map((d) => d.item.contractId));
      for (const id of contracts) void invalidate.records(id, ...(options.fresh?.() ?? []));
      return outcome;
    } finally {
      busy.value = null;
    }
  }

  const updated = (done: { result: Payment }[]) => options.updated(done.map((d) => d.result));

  return {
    busy,
    confirm: (selected: readonly Payment[]) =>
      run(selected, {
        action: "confirm",
        fits: awaitsReceipt,
        task: async (p) => (await paymentsApi.confirm(p.contractId, p.id)).payment,
        apply: updated,
        done: worded("pagamento", "concluído"),
        skipped: "já concluídos ou sem dinheiro entregue",
      }),
    acknowledge: (selected: readonly Payment[]) =>
      run(selected, {
        action: "acknowledge",
        fits: awaitsReceipt,
        task: async (p) => (await paymentsApi.acknowledge(p.contractId, p.id)).payment,
        apply: updated,
        done: worded("recebimento", "confirmado"),
        skipped: "já confirmados ou sem dinheiro entregue",
      }),
    remove: (selected: readonly Payment[]) =>
      run(selected, {
        action: "remove",
        fits: canDeletePayment,
        task: (p) => paymentsApi.remove(p.contractId, p.id),
        apply: (done) => options.removed(new Set(done.map((d) => d.item.id))),
        done: worded("lançamento", "excluído"),
        skipped: "adiantamento com dias abatidos",
      }),
    edit: (selected: readonly Payment[], changes: BulkPaymentChanges) =>
      run(selected, {
        action: "edit",
        fits: (p) => bulkPaymentPatch(p, changes) !== null,
        task: async (p) =>
          (await paymentsApi.update(p.contractId, p.id, bulkPaymentPatch(p, changes)!)).payment,
        apply: updated,
        done: worded("lançamento", "atualizado"),
        skipped: "já estavam assim ou o campo não vale para eles",
      }),
  };
}
