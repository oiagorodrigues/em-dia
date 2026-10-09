import type { Contract, Payment } from "@emdia/shared";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it } from "vite-plus/test";
import { defineComponent } from "vue";
import { queryKeys } from "@/api/keys.ts";
import { queryCacheOptions } from "@/api/query.ts";
import { useRecordPayment } from "./paymentsCache.ts";
import type { TeamPayments } from "./teamPayments.ts";

describe("useRecordPayment", () => {
  it("puts the new payment at the top of the lists already loaded, and leaves the rest alone", () => {
    let record!: ReturnType<typeof useRecordPayment>;
    let cache!: ReturnType<typeof useQueryCache>;
    mount(
      defineComponent(() => {
        record = useRecordPayment();
        cache = useQueryCache();
        return () => null;
      }),
      { global: { plugins: [createPinia(), [PiniaColada, queryCacheOptions({ retry: false })]] } },
    );
    const contract = { id: "c1" } as Contract;
    const old = { id: "p0", kind: "pay", referenceMonth: "2026-10" } as Payment;
    cache.setQueryData(queryKeys.payments({ id: "c1", year: 2026 }), [old]);
    cache.setQueryData<TeamPayments>(queryKeys.teamPayments(2026), {
      contracts: [contract],
      rows: [{ payment: old, contract, agreement: null }],
      advances: [],
    });

    const advance = {
      id: "p1",
      kind: "advance",
      referenceMonth: "2026-10",
      remainingCents: 30000,
    } as Payment;
    record(contract, advance);

    expect(
      cache.getQueryData<Payment[]>(queryKeys.payments({ id: "c1", year: 2026 }))!.map((p) => p.id),
    ).toEqual(["p1", "p0"]);
    const team = cache.getQueryData<TeamPayments>(queryKeys.teamPayments(2026))!;
    expect(team.rows.map((r) => r.payment.id)).toEqual(["p1", "p0"]);
    expect(team.advances.map((a) => a.payment.id)).toEqual(["p1"]);
    expect(cache.getQueryData(queryKeys.advances("c1"))).toBeUndefined();
  });
});
