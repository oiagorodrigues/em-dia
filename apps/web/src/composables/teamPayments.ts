import { contractsApi, paymentsApi } from "@/api";
import type { PaymentRow } from "@/lib/payments.ts";
import { useResource } from "./resource.ts";

/** Every payment of the year across the caller's contracts (removed ones too: it's history). */
export function useTeamPayments(year: () => number) {
  return useResource(year, async (y) => {
    const { contracts } = await contractsApi.list({ archived: true });
    const lists = await Promise.all(
      contracts.map((c) => paymentsApi.list(c.id, y).then((r) => r.payments)),
    );
    const rows: PaymentRow[] = contracts.flatMap((contract, k) =>
      lists[k]!.map((payment) => ({ payment, contract })),
    );
    return { contracts, rows };
  });
}
