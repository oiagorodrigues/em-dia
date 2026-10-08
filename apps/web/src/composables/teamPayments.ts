import { isOpenAdvance, type Contract, type Payment } from "@emdia/shared";
import { agreementsApi, contractsApi, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import { abatementLabel, type PaymentRow } from "@/lib/payments.ts";
import { useCachedRead, useResource } from "./resource.ts";

export interface OpenAdvance {
  payment: Payment;
  contract: Contract;
}

/** Every payment of the year across the caller's contracts (removed ones too: it's history). */
export function useTeamPayments(year: () => number) {
  const read = useCachedRead();
  return useResource(year, queryKeys.teamPayments, async (y) => {
    const contracts = await read(queryKeys.contractsWithArchived(), () =>
      contractsApi.list({ archived: true }).then((r) => r.contracts),
    );
    // Adiantamentos come whatever their year: one from December can be abated in January.
    const [lists, advanceLists] = await Promise.all([
      Promise.all(
        contracts.map((c) =>
          read(queryKeys.payments({ id: c.id, year: y }), () =>
            paymentsApi.list(c.id, y).then((r) => r.payments),
          ),
        ),
      ),
      Promise.all(
        contracts.map((c) =>
          read(queryKeys.advances(c.id), () => paymentsApi.advances(c.id).then((r) => r.advances)),
        ),
      ),
    ]);
    // Only contracts with compensation installments need their agreements, for the description.
    const withAgreements = contracts.filter((_, k) => lists[k]!.some((p) => p.agreementId));
    const agreementLists = await Promise.all(
      withAgreements.map((c) =>
        read(queryKeys.agreements(c.id), () =>
          agreementsApi.list(c.id, { archived: true }).then((r) => r.agreements),
        ),
      ),
    );
    const descriptions = new Map(agreementLists.flat().map((a) => [a.id, a.description]));
    const rows: PaymentRow[] = contracts.flatMap((contract, k) =>
      lists[k]!.map((payment) => ({
        payment,
        contract,
        agreement: payment.agreementId
          ? (descriptions.get(payment.agreementId) ?? null)
          : abatementLabel(payment, advanceLists[k]!),
      })),
    );
    const advances: OpenAdvance[] = contracts.flatMap((contract, k) =>
      advanceLists[k]!.filter(isOpenAdvance).map((payment) => ({ payment, contract })),
    );
    return { contracts, rows, advances };
  });
}
