import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import SkeletonTable from "./SkeletonTable.vue";

function stubWide(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const columns = [
  { label: "Pessoa" },
  { label: "Avatar", srOnlyLabel: true },
  { label: "Valor", align: "right" as const },
];

afterEach(() => vi.unstubAllGlobals());

describe("SkeletonTable", () => {
  it("keeps the real header and the row grid on wide screens", () => {
    stubWide(true);
    const w = mount(SkeletonTable, { props: { columns, rows: 4, actions: 1 } });
    expect(w.findAll("th").map((th) => th.text())).toEqual(["Pessoa", "", "Valor", ""]);
    expect(w.findAll("tbody tr")).toHaveLength(4);
    expect(w.findAll("tbody tr")[0]!.findAll("td")).toHaveLength(4);
    expect(w.findAll("td.is-right")).toHaveLength(4);
  });

  it("becomes the card list on phones", () => {
    stubWide(false);
    const w = mount(SkeletonTable, { props: { columns, rows: 3 } });
    expect(w.find("table").exists()).toBe(false);
    expect(w.findAll(".sk-table__card")).toHaveLength(3);
  });
});
