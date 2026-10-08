import type { Contract, PublicUser } from "@emdia/shared";
import { PiniaColada } from "@pinia/colada";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { queryCacheOptions } from "@/api/query.ts";
import { provideContract } from "@/composables/contractContext.ts";
import { useAuthStore } from "@/stores/auth.ts";
import SettingsTab from "./SettingsTab.vue";

const base = {
  id: "c1",
  householdId: "h1",
  householdName: "Casa",
  employerId: "u1",
  employerName: "Ana",
  workerId: "w1",
  workerName: "Joana",
  workerEmail: "joana@exemplo.com",
  workerPhone: "(11) 98765-4321",
  workerPixKey: null,
  contactEmail: "antigo@exemplo.com",
  contactPhone: null,
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
  deductAbsences: false,
  expectedStart: "08:00",
  expectedEnd: "16:00",
  startedOn: "2026-08-01",
  endedOn: null,
  status: "active",
  archivedAt: null,
  createdAt: "2026-08-01T00:00:00Z",
} as Contract;

async function render(patch: Partial<Contract> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", name: "Ana", role: "employer" } as PublicUser;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push("/equipe/c1/ajustes");
  const contract = shallowRef({ ...base, ...patch });
  const Host = defineComponent(() => {
    provideContract({
      contract,
      month: computed(() => "2026-10"),
      currentMonth: "2026-10",
      setMonth: () => {},
      replaceContract: (next) => (contract.value = next),
      askRemove: () => {},
      restore: async () => {},
      restoring: ref(false),
    });
    return () => h(SettingsTab);
  });
  const wrapper = mount(Host, {
    global: { plugins: [pinia, router, [PiniaColada, queryCacheOptions({ retry: false })]] },
  });
  await flushPromises();
  return wrapper;
}

afterEach(() => document.body.replaceChildren());

describe("SettingsTab", () => {
  it("shows the e-mail and phone the worker registered, not the typed contact", async () => {
    const w = await render();
    const card = w.get(".st__who");
    expect(card.text()).toContain("Contato de Joana");
    expect(card.get("a[href^='mailto:']").text()).toBe("joana@exemplo.com");
    expect(card.get("a[href^='tel:']").attributes("href")).toBe("tel:11987654321");
    expect(w.find("input[type='email']").exists()).toBe(false);
  });

  it("says when the worker left a field empty", async () => {
    const w = await render({ workerPhone: null });
    expect(w.get(".st__who").text()).toContain("não informado");
  });

  it("keeps the typed contact editable before the worker joins", async () => {
    const w = await render({ workerId: null, workerEmail: null, workerPhone: null });
    expect(w.find(".st__who").exists()).toBe(false);
    expect(w.find("input[type='email']").exists()).toBe(true);
  });

  it("leaves frequência and horário out of the resumo", async () => {
    const w = await render();
    const panel = w.get(".ep");
    expect(panel.text()).not.toContain("Frequência");
    expect(panel.text()).not.toContain("Horário");
    expect(panel.text()).toContain("Custo estimado");
  });
});
