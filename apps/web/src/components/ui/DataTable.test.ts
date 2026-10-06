import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, h, nextTick, reactive, type Component } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import type { Column, TableState } from "@/lib/table.ts";
import DataTable from "./DataTable.vue";

interface Person {
  id: string;
  name: string;
  role: string;
  hours: number | null;
}

const PEOPLE: Person[] = [
  { id: "1", name: "Maria", role: "Diarista", hours: 40 },
  { id: "2", name: "Antônio", role: "Jardineiro", hours: 8 },
  { id: "3", name: "Joana", role: "Babá", hours: 120 },
  { id: "4", name: "Ângela", role: "Diarista", hours: null },
];

const COLUMNS: Column<Person>[] = [
  { key: "nome", label: "Nome", value: (p) => p.name, sortable: true, searchable: true },
  { key: "funcao", label: "Função", value: (p) => p.role, searchable: true },
  {
    key: "horas",
    label: "Horas",
    value: (p) => p.hours,
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
];

function stubMatchMedia(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("640") ? wide : wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Mounts DataTable inside a router with an externally owned state (as useTableState provides). */
async function setup(
  opts: {
    wide?: boolean;
    filter?: (p: Person) => boolean;
    link?: boolean;
    state?: TableState;
  } = {},
) {
  stubMatchMedia(opts.wide ?? true);
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/equipe", component: { render: () => null } },
      { path: "/equipe/:id", component: { render: () => null } },
    ],
  });
  await router.push("/equipe");
  const Host = defineComponent(() => {
    const state = reactive<TableState>(
      opts.state ?? { q: "", sort: { key: "nome", dir: "asc" }, filters: {} },
    );
    return () =>
      // vue-tsc sees the generic SFC and tsgolint the .vue shim; erase both to the runtime contract.
      h(DataTable as unknown as Component, {
        label: "Equipe",
        rows: PEOPLE,
        columns: COLUMNS,
        rowKey: (p: Person) => p.id,
        state,
        filter: opts.filter,
        filtersActive: !!opts.filter,
        rowLink: opts.link ? (p: Person) => `/equipe/${p.id}` : undefined,
      });
  });
  const wrapper = mount(Host, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

const names = (w: Awaited<ReturnType<typeof setup>>["wrapper"]) =>
  w.findAll("tbody tr").map((tr) => tr.findAll("td")[0]!.text());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataTable", () => {
  it("sorts by the default column with pt-BR collation", async () => {
    const { wrapper } = await setup();
    expect(names(wrapper)).toEqual(["Ângela", "Antônio", "Joana", "Maria"]);
    expect(wrapper.find('th[aria-sort="ascending"]').text()).toContain("Nome");
  });

  it("sorts numbers biggest-first on first click and keeps empty values last", async () => {
    const { wrapper } = await setup();
    const horas = wrapper.findAll("th").find((th) => th.text().includes("Horas"))!;
    await horas.get("button").trigger("click");
    expect(names(wrapper)).toEqual(["Joana", "Maria", "Antônio", "Ângela"]);
    expect(horas.attributes("aria-sort")).toBe("descending");

    await horas.get("button").trigger("click");
    expect(names(wrapper)).toEqual(["Antônio", "Maria", "Joana", "Ângela"]);
    expect(horas.attributes("aria-sort")).toBe("ascending");
  });

  it("searches without caring about accents", async () => {
    const { wrapper } = await setup();
    await wrapper.get('input[type="search"]').setValue("antonio");
    expect(names(wrapper)).toEqual(["Antônio"]);
    expect(wrapper.text()).toContain("1 resultado");
  });

  it("matches every word against the searchable columns", async () => {
    const { wrapper } = await setup();
    await wrapper.get('input[type="search"]').setValue("diarista ang");
    expect(names(wrapper)).toEqual(["Ângela"]);
  });

  it("starts from the given state (e.g. restored from the URL)", async () => {
    const { wrapper } = await setup({
      state: { q: "diarista", sort: { key: "nome", dir: "desc" }, filters: {} },
    });
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe(
      "diarista",
    );
    expect(names(wrapper)).toEqual(["Maria", "Ângela"]);
  });

  it("applies the page filter and offers to clear when nothing matches", async () => {
    const { wrapper } = await setup({ filter: (p) => p.role === "Babá" });
    expect(names(wrapper)).toEqual(["Joana"]);
    await wrapper.get('input[type="search"]').setValue("maria");
    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.text()).toContain("Nenhum resultado para “maria”");
    await wrapper.get(".dt__clear").trigger("click");
    await nextTick();
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.emitted()).toBeDefined();
  });

  it("opens the row on click and on Enter, but not when an inner button is used", async () => {
    const { wrapper, router } = await setup({ link: true });
    const rows = wrapper.findAll("tbody tr");
    expect(rows[0]!.attributes("tabindex")).toBe("0");
    await rows[2]!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/equipe/3");
    await router.push("/equipe");
    await flushPromises();
    await wrapper.findAll("tbody tr")[3]!.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/equipe/1");
  });

  it("renders a card list on small screens from the same columns", async () => {
    const { wrapper } = await setup({ wide: false });
    expect(wrapper.find("table").exists()).toBe(false);
    const cards = wrapper.findAll(".dt__card");
    expect(cards).toHaveLength(4);
    expect(cards[0]!.text()).toContain("Ângela");
    expect(cards[0]!.text()).toContain("Função");
  });
});
