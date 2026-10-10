import { isOpenAdvance, type Contract, type Payment } from "@emdia/shared";
import { useQueryCache, type EntryKey } from "@pinia/colada";
import { queryKeys } from "@/api/keys.ts";
import type { TeamPayments } from "./teamPayments.ts";

/**
 * Puts a payment the API just created into every cached list that shows it, so the list on
 * screen has it at once; the refetch that `useInvalidate().records` starts only confirms it.
 * Lists that were never loaded stay unloaded.
 */
export function useRecordPayment() {
  const cache = useQueryCache();

  function prepend<T>(key: EntryKey, add: (prev: T) => T): void {
    const prev = cache.getQueryData<T>(key);
    if (prev !== undefined) cache.setQueryData<T>(key, add(prev));
  }

  return (contract: Contract, payment: Payment): void => {
    const year = Number(payment.referenceMonth.slice(0, 4));
    prepend<Payment[]>(queryKeys.payments({ id: contract.id, year }), (list) => [payment, ...list]);
    if (payment.kind === "advance")
      prepend<Payment[]>(queryKeys.advances(contract.id), (list) => [payment, ...list]);
    prepend<TeamPayments>(queryKeys.teamPayments(year), (team) => ({
      ...team,
      rows: [{ payment, contract, agreement: null }, ...team.rows],
      advances:
        payment.kind === "advance" && isOpenAdvance(payment)
          ? [{ payment, contract }, ...team.advances]
          : team.advances,
    }));
  };
}
