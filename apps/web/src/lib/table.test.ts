import { describe, expect, it } from "vite-plus/test";
import { dropOrder, type Column } from "./table.ts";

describe("dropOrder", () => {
  it("drops hideBelow columns first, then by priority, right to left on ties", () => {
    const cols: Column<unknown>[] = [
      { key: "nome", label: "Nome" },
      { key: "nota", label: "Observação", priority: 1 },
      { key: "forma", label: "Forma", hideBelow: "lg" },
      { key: "contato", label: "Contato", hideBelow: "2xl" },
      { key: "valor", label: "Valor" },
    ];
    expect(dropOrder(cols)).toEqual(["contato", "forma", "nota"]);
  });
});
