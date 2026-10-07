import {
  DEFAULT_TIMEZONE,
  nowInZone,
  toYearMonth,
  type Agreement,
  type Contract,
  type MonthSummary,
} from "@emdia/shared";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { agreementsApi, contractsApi, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import { queryCacheOptions } from "@/api/query.ts";
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
  props: { amountCents: { type: Number, default: null }, kind: { type: String, default: "pay" } },
  template: "<div />",
});

async function setup(query: string, cached: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.spyOn(contractsApi, "list").mockResolvedValue({ contracts: [contract] });
  vi.spyOn(contractsApi, "summary").mockResolvedValue({ summary } as never);
  vi.spyOn(agreementsApi, "list").mockResolvedValue({ agreements: [mesa] });
  vi.spyOn(paymentsApi, "advances").mockResolvedValue({ advances: [] });
  const client = createApp({}).runWithContext(() => useQueryCache(pinia));
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
      plugins: [router, pinia, [PiniaColada, queryCacheOptions({ retry: false })]],
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

describe("NewPaymentView type field", () => {
  it("opens on diárias/salário and passes the type to the fields", async () => {
    const fields = await setup("?vinculo=c1", true);
    expect(fields.props("kind")).toBe("pay");
  });

  it("opens on a desconto from the link, without the month's balance as amount", async () => {
    const fields = await setup("?vinculo=c1&tipo=deduction", true);
    expect(fields.props("kind")).toBe("deduction");
    expect(fields.props("amountCents")).toBeNull();
  });

  it("reads the old extra link as a gratificação", async () => {
    const fields = await setup("?vinculo=c1&extra=1", true);
    expect(fields.props("kind")).toBe("bonus");
  });

  it("names the button after the type", async () => {
    const fields = await setup("?vinculo=c1&tipo=deduction", true);
    const button = fields.element.closest("form")?.querySelector('button[type="submit"]');
    expect(button?.textContent).toContain("Lançar desconto");
  });
});
