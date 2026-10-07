import {
  DEFAULT_TIMEZONE,
  formatCents,
  nowInZone,
  toYearMonth,
  type Contract,
  type DashboardItem,
  type MonthSummary,
  type PublicUser,
} from "@emdia/shared";
import { PiniaColada } from "@pinia/colada";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory, createRouter } from "vue-router";
import { teamApi } from "@/api";
import { queryCacheOptions } from "@/api/query.ts";
import { useAuthStore } from "@/stores/auth.ts";
import EmployerHome from "./EmployerHome.vue";

const today = nowInZone(DEFAULT_TIMEZONE).date;
const month = toYearMonth(today);

function item(name: string, estimateCents: number | null, days: number): DashboardItem {
  return {
    contract: {
      id: name.toLowerCase(),
      workerName: name,
      workerId: "w",
      status: "active",
      archivedAt: null,
      schedule: {
        kind: "weekly",
        weekdays: [2, 5],
        everyWeeks: 1,
        monthDays: [],
        visitsPerMonth: null,
      },
    } as unknown as Contract,
    summary: {
      totalMinutes: 960,
      daysWorked: 2,
      expectedDays: days,
      expectedDates: [],
      unrecordedDates: [],
      pendingConfirmation: 0,
      dueCents: 36000,
      paidCents: 18000,
      balanceCents: 18000,
    } as unknown as MonthSummary,
    today: null,
    lastPayment: null,
    estimate: { month, days, minutesPerDay: 480, cents: estimateCents },
  };
}

async function setup(items: DashboardItem[]) {
  // Reduced motion: KPI values land at once instead of counting up.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", name: "Ana Souza", role: "employer" } as PublicUser;
  let respond: () => void = () => {};
  const list = vi.spyOn(teamApi, "list").mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = () => resolve({ items, month, today });
      }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push("/");
  const stub = { template: "<div />" };
  const wrapper = mount(EmployerHome, {
    global: {
      plugins: [router, pinia, [PiniaColada, queryCacheOptions({ retry: false })]],
      stubs: {
        TeamTable: stub,
        HomeToday: stub,
        HomePendencies: stub,
        InstallHint: stub,
        MonthSwitcher: stub,
      },
    },
  });
  return { wrapper, list, respond: () => respond() };
}

const labels = (w: Awaited<ReturnType<typeof setup>>["wrapper"]) =>
  w.findAll(".kpi__label").map((l) => l.text());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EmployerHome KPIs", () => {
  it("shows the month's forecast cost instead of the hours worked", async () => {
    const { wrapper, respond } = await setup([item("Maria", 144000, 8), item("Joana", 60000, 4)]);
    respond();
    await flushPromises();

    expect(labels(wrapper).some((l) => /horas/i.test(l))).toBe(false);

    const forecast = wrapper.findAll(".kpi").find((k) => /custo do mês/i.test(k.text()));
    expect(forecast).toBeDefined();
    expect(forecast!.classes()).toContain("is-projected");
    expect(forecast!.get(".kpi__label").text()).toContain("Previsto");
    expect(forecast!.get(".kpi__value").text()).toBe(formatCents(204000));
    expect(forecast!.get(".kpi__caption").text()).toBe("2 pessoas · 12 dias combinados");

    expect(labels(wrapper).map((l) => l.replace(/previsto$/, "").trim())).toEqual([
      "A pagar",
      expect.stringMatching(/^Pago em /),
      expect.stringMatching(/^Custo do mês/),
      "Pendências",
    ]);
  });

  it("says who can't be priced instead of hiding them in the total", async () => {
    const { wrapper, respond } = await setup([item("Maria", 144000, 8), item("Cida", null, 0)]);
    respond();
    await flushPromises();
    const forecast = wrapper.findAll(".kpi").find((k) => /custo do mês/i.test(k.text()));
    expect(forecast!.get(".kpi__caption").text()).toBe("sem estimativa para 1 pessoa");
  });

  it("keeps the KPI row and the header actions in place while the team loads", async () => {
    const { wrapper, respond } = await setup([]);
    // Before the request resolves: four placeholder values, no captions with made-up numbers.
    expect(wrapper.findAll(".kpi")).toHaveLength(4);
    expect(wrapper.findAll(".kpi__value[aria-busy='true']")).toHaveLength(4);
    expect(wrapper.text()).toContain("Registrar pagamento");
    respond();
    await flushPromises();
    expect(wrapper.text()).toContain("Ninguém cadastrado ainda.");
  });
});
