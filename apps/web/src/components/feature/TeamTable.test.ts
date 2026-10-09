import {
  DEFAULT_TIMEZONE,
  nowInZone,
  toYearMonth,
  type Contract,
  type DashboardItem,
  type MonthSummary,
} from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory, createRouter } from "vue-router";
import { ApiError, contractsApi } from "@/api";
import type { TableState } from "@/lib/table.ts";
import { useToastStore } from "@/stores/toast.ts";
import TeamTable from "./TeamTable.vue";

const today = nowInZone(DEFAULT_TIMEZONE).date;
const month = toYearMonth(today);

function item(name: string, archived = false): DashboardItem {
  return {
    contract: {
      id: name.toLowerCase(),
      workerName: name,
      workerId: "w",
      status: "active",
      archivedAt: archived ? "2026-10-01T00:00:00Z" : null,
      occupation: "diarista",
      payType: "daily",
      rateCents: 18000,
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
      expectedDays: 8,
      expectedDates: [],
      unrecordedDates: [],
      pendingConfirmation: 0,
      dueCents: 36000,
      paidCents: 18000,
      balanceCents: 18000,
    } as unknown as MonthSummary,
    today: null,
    lastPayment: null,
    estimate: { month, days: 8, minutesPerDay: 480, cents: 144000 },
  };
}

async function setup(items: DashboardItem[], selectable = true) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !query.includes("reduce") && !query.includes("coarse"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push("/equipe");
  const state: TableState = { q: "", sort: { key: "nome", dir: "asc" }, filters: {} };
  const wrapper = mount(TeamTable, {
    attachTo: document.body,
    props: { items, state, today, month, variant: "full", selectable },
    global: {
      plugins: [router, pinia],
      stubs: { transition: false, "transition-group": false },
    },
  });
  await flushPromises();
  return { wrapper, toast: useToastStore() };
}

const bulkButton = (w: Awaited<ReturnType<typeof setup>>["wrapper"], text: string) =>
  w.findAll(".dt__bulk button").find((b) => b.text() === text);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("TeamTable bulk actions", () => {
  it("has no checkboxes on Início", async () => {
    const { wrapper } = await setup([item("Rosa")], false);
    expect(wrapper.find("input[type='checkbox']").exists()).toBe(false);
  });

  it("removes the selected people after one confirmation, with undo", async () => {
    const { wrapper, toast } = await setup([item("Rosa"), item("Lia"), item("Bia")]);
    const remove = vi.spyOn(contractsApi, "remove").mockImplementation(async (id) => {
      if (id === "bia") throw new ApiError(404, "NOT_FOUND", "Vínculo não encontrado");
    });
    const restore = vi
      .spyOn(contractsApi, "restore")
      .mockResolvedValue({ contract: item("Rosa").contract });

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    expect(wrapper.get(".dt__bulk").text()).toContain("3 pessoas selecionadas");
    expect(bulkButton(wrapper, "Restaurar")).toBeUndefined();
    await bulkButton(wrapper, "Remover da equipe")!.trigger("click");
    await flushPromises();

    const dialog = document.body.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain("Remover 3 pessoas da equipe?");
    [...dialog.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Remover")!
      .click();
    await flushPromises();

    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(["bia", "lia", "rosa"]);
    expect(wrapper.emitted("reload")).toHaveLength(1);
    const last = toast.toasts.at(-1)!;
    expect(last.message).toBe("2 pessoas saíram da equipe; 1 não deu: Vínculo não encontrado.");
    expect(wrapper.get(".dt__bulk").text()).toContain("1 pessoa selecionada");

    last.action!.run();
    await flushPromises();
    expect(restore.mock.calls.map((c) => c[0]).sort()).toEqual(["lia", "rosa"]);
  });

  it("restores removed people without asking", async () => {
    const { wrapper, toast } = await setup([item("Rosa", true), item("Lia", true)]);
    const restore = vi
      .spyOn(contractsApi, "restore")
      .mockResolvedValue({ contract: item("Rosa").contract });

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    expect(bulkButton(wrapper, "Remover da equipe")).toBeUndefined();
    await bulkButton(wrapper, "Restaurar")!.trigger("click");
    await flushPromises();

    expect(restore).toHaveBeenCalledTimes(2);
    expect(toast.toasts.at(-1)?.message).toBe("2 pessoas voltaram para a equipe.");
  });
});
