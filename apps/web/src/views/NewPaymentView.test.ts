import {
  DEFAULT_TIMEZONE,
  nowInZone,
  toYearMonth,
  type Agreement,
  type Contract,
  type MonthSummary,
} from "@emdia/shared";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { agreementsApi, contractsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import { createQueryClient } from "@/api/query.ts";
import NewPaymentView from "./NewPaymentView.vue";

const month = toYearMonth(nowInZone(DEFAULT_TIMEZONE).date);

const contract = {
  id: "c1",
  workerName: "Rosa",
  status: "active",
  archivedAt: null,
} as unknown as Contract;
const summary = { balanceCents: 10800 } as unknown as MonthSummary;
const mesa = {
  id: "a1",
  contractId: "c1",
  description: "Mesa",
  totalCents: 60000,
  installmentCents: 20000,
  settledCents: 0,
  remainingCents: 60000,
  acceptedAt: "2026-01-01T00:00:00Z",
  cancelledAt: null,
  archivedAt: null,
} as unknown as Agreement;

const PaymentFields = defineComponent({
  name: "PaymentFields",
  props: { amountCents: { type: Number, default: null } },
  template: "<div />",
});

async function setup(query: string, cached: boolean) {
  setActivePinia(createPinia());
  vi.spyOn(contractsApi, "list").mockResolvedValue({ contracts: [contract] });
  vi.spyOn(contractsApi, "summary").mockResolvedValue({ summary } as never);
  vi.spyOn(agreementsApi, "list").mockResolvedValue({ agreements: [mesa] });
  const client = createQueryClient();
  if (cached) {
    client.setQueryData(queryKeys.contracts(), [contract]);
    client.setQueryData(queryKeys.summary({ id: "c1", month }), summary);
    client.setQueryData(queryKeys.agreements("c1"), [mesa]);
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push(`/pagamentos/novo${query}`);
  const wrapper = mount(NewPaymentView, {
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: client }]],
      stubs: { PaymentFields, PaymentsSidePanel: true, PageHeader: true },
    },
  });
  await flushPromises();
  return wrapper.getComponent(PaymentFields);
}

afterEach(() => vi.restoreAllMocks());

describe("NewPaymentView prefill", () => {
  for (const cached of [false, true]) {
    const from = cached ? "from the cache" : "from the network";
    it(`fills the agreement installment, ${from}`, async () => {
      const fields = await setup("?vinculo=c1&acordo=a1", cached);
      expect(fields.props("amountCents")).toBe(20000);
    });

    it(`fills what is still owed for the month, ${from}`, async () => {
      const fields = await setup("?vinculo=c1", cached);
      expect(fields.props("amountCents")).toBe(10800);
    });
  }
});
