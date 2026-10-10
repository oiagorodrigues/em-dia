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
    columns?: Column<Person>[];
    actions?: boolean;
    selectable?: boolean;
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
      h(
        DataTable as unknown as Component,
        {
          label: "Equipe",
          rows: PEOPLE,
          columns: opts.columns ?? COLUMNS,
          rowKey: (p: Person) => p.id,
          state,
          filter: opts.filter,
          filtersActive: !!opts.filter,
          rowLink: opts.link ? (p: Person) => `/equipe/${p.id}` : undefined,
          selectable: opts.selectable,
          selectLabel: (p: Person) => `Selecionar ${p.name}`,
        },
        {
          ...(opts.actions
            ? { "row-actions": () => h("button", { type: "button", class: "act" }, "Editar") }
            : {}),
          "bulk-actions": ({ rows }: { rows: readonly Person[] }) =>
            h("button", { type: "button", class: "bulk-act" }, rows.map((p) => p.name).join(",")),
        },
      );
  });
  const wrapper = mount(Host, {
    global: { plugins: [router], stubs: { transition: false, "transition-group": false } },
  });
  await flushPromises();
  return { wrapper, router };
}

const names = (w: Awaited<ReturnType<typeof setup>>["wrapper"]) =>
  w
    .findAll("tbody tr")
    // Rows on their way out (leave transition) are still in the DOM for a frame.
    .filter((tr) => !tr.classes().some((c) => c.startsWith("dt-row-leave")))
    .map((tr) => tr.findAll("td")[0]!.text());

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

  it("drops low-priority columns until the row actions fit without horizontal scroll", async () => {
    // happy-dom has no layout: each rendered header cell counts as 100px in a 350px box.
    const scroll = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockImplementation(function (this: Element) {
        return this.querySelectorAll("th").length * 100;
      });
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(350);
    try {
      const { wrapper } = await setup({
        actions: true,
        columns: [COLUMNS[0]!, { ...COLUMNS[1]!, priority: 2 }, { ...COLUMNS[2]!, priority: 1 }],
      });
      await flushPromises();
      const headers = wrapper.findAll("th").map((th) => th.text());
      expect(headers).toEqual(["Nome", "Função", "Ações"]);
      expect(wrapper.find("table").classes()).toContain("is-tight");
      expect(wrapper.findAll("tbody tr")[0]!.find(".act").exists()).toBe(true);
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it("cuts long free text with an ellipsis and keeps the full text for the tooltip", async () => {
    const { wrapper } = await setup({
      columns: [COLUMNS[0]!, { ...COLUMNS[1]!, truncate: true, width: "10ch" }],
    });
    const cell = wrapper.findAll("tbody tr")[0]!.findAll("td")[1]!;
    expect(cell.find(".dt__trunc").attributes("style")).toContain("max-width: 10ch");
    expect(cell.find(".dt__trunc-text").text()).toBe("Diarista");
    expect(cell.find(".tip-anchor").exists()).toBe(true);
  });

  describe("selection", () => {
    const header = (w: Awaited<ReturnType<typeof setup>>["wrapper"]) =>
      w.get("thead input[type='checkbox']").element as HTMLInputElement;
    const boxFor = (w: Awaited<ReturnType<typeof setup>>["wrapper"], name: string) =>
      w
        .findAll(".dt__check")
        .find((l) => l.text() === `Selecionar ${name}`)!
        .get("input");

    it("has no checkboxes or bar unless the table is selectable", async () => {
      const { wrapper } = await setup();
      expect(wrapper.find("input[type='checkbox']").exists()).toBe(false);
      expect(wrapper.find(".dt__bulk").exists()).toBe(false);
    });

    it("selects every shown row from the header and clears from the bar", async () => {
      const { wrapper } = await setup({ selectable: true });
      expect(wrapper.find(".dt__bulk").exists()).toBe(false);
      await wrapper.get("thead input[type='checkbox']").setValue(true);
      expect(header(wrapper).checked).toBe(true);
      expect(wrapper.get(".dt__bulk").text()).toContain("4 selecionados");
      expect(wrapper.get(".bulk-act").text()).toBe("Ângela,Antônio,Joana,Maria");
      expect(wrapper.get(".dt__bulk").attributes("aria-label")).toBe("Ações para 4 selecionados");

      await wrapper.get(".dt__bulk-clear").trigger("click");
      // The bar fades out, so it stays in the DOM for its leave transition.
      expect(wrapper.find(".dt__bulk:not(.dt-bulk-leave-active)").exists()).toBe(false);
      expect(header(wrapper).checked).toBe(false);
    });

    it("shows the header as indeterminate while only some rows are selected", async () => {
      const { wrapper } = await setup({ selectable: true });
      await boxFor(wrapper, "Joana").trigger("click");
      expect(header(wrapper).indeterminate).toBe(true);
      expect(header(wrapper).checked).toBe(false);
      expect(wrapper.get(".dt__bulk").text()).toContain("1 selecionado");
      expect(wrapper.findAll("tbody tr.is-selected")).toHaveLength(1);
    });

    it("selects the run between two rows with shift-click", async () => {
      const { wrapper } = await setup({ selectable: true });
      await boxFor(wrapper, "Ângela").trigger("click");
      await boxFor(wrapper, "Joana").trigger("click", { shiftKey: true });
      expect(wrapper.get(".bulk-act").text()).toBe("Ângela,Antônio,Joana");
    });

    it("drops rows a search hides from the selection", async () => {
      const { wrapper } = await setup({ selectable: true });
      await wrapper.get("thead input[type='checkbox']").setValue(true);
      await wrapper.get('input[type="search"]').setValue("maria");
      expect(wrapper.get(".bulk-act").text()).toBe("Maria");
      await wrapper.get('input[type="search"]').setValue("");
      expect(wrapper.get(".dt__bulk").text()).toContain("1 selecionado");
      expect(header(wrapper).indeterminate).toBe(true);
    });

    it("does not open the row when its checkbox is used", async () => {
      const { wrapper, router } = await setup({ selectable: true, link: true });
      await boxFor(wrapper, "Maria").trigger("click");
      await flushPromises();
      expect(router.currentRoute.value.path).toBe("/equipe");
    });

    it("selects cards on small screens, with a select-all above them", async () => {
      const { wrapper } = await setup({ selectable: true, wide: false });
      const boxes = wrapper.findAll(".dt__card input[type='checkbox']");
      expect(boxes).toHaveLength(4);
      await boxes[1]!.trigger("click");
      expect(wrapper.get(".bulk-act").text()).toBe("Antônio");
      const all = wrapper.get(".dt__select-all input").element as HTMLInputElement;
      expect(all.indeterminate).toBe(true);
      await wrapper.get(".dt__select-all input").setValue(true);
      expect(wrapper.get(".dt__bulk").text()).toContain("4 selecionados");
    });
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
