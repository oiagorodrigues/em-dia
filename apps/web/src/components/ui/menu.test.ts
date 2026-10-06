import { describe, expect, it, vi } from "vite-plus/test";
import { layoutActions, type InlineAction, type MenuItem } from "./menu.ts";

const view: InlineAction = { label: "Ver", icon: "eye" };
const pay: InlineAction = { label: "Registrar pagamento", icon: "wallet-plus", tone: "brand" };
const clockIn: InlineAction = { label: "Bater entrada", icon: "clock-in", tone: "brand" };
const edit: MenuItem = { label: "Editar", icon: "pencil", onSelect: () => {} };
const remove: MenuItem = { label: "Remover", icon: "trash", danger: true, onSelect: () => {} };

describe("layoutActions", () => {
  it("shows a lone action inline", () => {
    expect(layoutActions([view], [])).toEqual({ inline: [view], menu: [] });
  });

  it("turns a lone menu item into an inline button, coral when destructive", () => {
    const onSelect = vi.fn();
    const out = layoutActions([], [{ ...remove, onSelect }]);
    expect(out.menu).toEqual([]);
    expect(out.inline[0]).toMatchObject({ label: "Remover", icon: "trash", tone: "coral" });
    out.inline[0]!.onClick?.();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("keeps at most two inline and moves the rest into the menu, first", () => {
    const out = layoutActions([clockIn, pay, view], [edit, remove]);
    expect(out.inline.map((a) => a.label)).toEqual(["Bater entrada", "Registrar pagamento"]);
    expect(out.menu.map((m) => m.label)).toEqual(["Ver", "Editar", "Remover"]);
  });

  it("returns nothing for no actions", () => {
    expect(layoutActions([], [])).toEqual({ inline: [], menu: [] });
  });
});
