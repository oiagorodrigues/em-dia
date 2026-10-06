import { agreementsApi, contractsApi, paymentsApi } from "@/api";
import type { PaymentRow } from "@/lib/payments.ts";
import { useResource } from "./resource.ts";

/** Every payment of the year across the caller's contracts (removed ones too: it's history). */
export function useTeamPayments(year: () => number) {
  return useResource(year, async (y) => {
    const { contracts } = await contractsApi.list({ archived: true });
    const lists = await Promise.all(
      contracts.map((c) => paymentsApi.list(c.id, y).then((r) => r.payments)),
    );
    // Only contracts with compensation installments need their agreements, for the description.
    const withAgreements = contracts.filter((_, k) => lists[k]!.some((p) => p.agreementId));
    const agreementLists = await Promise.all(
      withAgreements.map((c) => agreementsApi.list(c.id).then((r) => r.agreements)),
    );
    const descriptions = new Map(agreementLists.flat().map((a) => [a.id, a.description]));
    const rows: PaymentRow[] = contracts.flatMap((contract, k) =>
      lists[k]!.map((payment) => ({
        payment,
        contract,
        agreement: payment.agreementId ? (descriptions.get(payment.agreementId) ?? null) : null,
      })),
    );
    return { contracts, rows };
  });
}
