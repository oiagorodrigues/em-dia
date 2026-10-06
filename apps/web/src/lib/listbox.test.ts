import { describe, expect, it } from "vite-plus/test";
import { firstEnabled, moveActive, typeahead, type Option } from "./listbox.ts";

const O: Option[] = [
  { value: "diarista", label: "Diarista" },
  { value: "baba", label: "Babá" },
  { value: "cozinheira", label: "Cozinheira" },
  { value: "cuidadora", label: "Cuidadora" },
  { value: "jardineiro", label: "Jardineiro", disabled: true },
  { value: "passadeira", label: "Passadeira" },
];

describe("typeahead", () => {
  it("finds the next label starting with the typed text, accent-insensitive", () => {
    expect(typeahead(O, "b", -1)).toBe(1);
    expect(typeahead(O, "baba", 0)).toBe(1);
    expect(typeahead(O, "cu", 0)).toBe(3);
  });

  it("cycles through options that share the first letter when it is repeated", () => {
    expect(typeahead(O, "c", 2)).toBe(3);
    expect(typeahead(O, "cc", 3)).toBe(2);
  });

  it("skips disabled options and returns -1 when nothing matches", () => {
    expect(typeahead(O, "j", 0)).toBe(-1);
    expect(typeahead(O, "x", 0)).toBe(-1);
  });
});

describe("moveActive", () => {
  it("skips disabled options and stops at the ends", () => {
    expect(moveActive(O, 3, 1)).toBe(5);
    expect(moveActive(O, 5, 1)).toBe(5);
    expect(moveActive(O, 0, -1)).toBe(0);
    expect(firstEnabled(O, true)).toBe(5);
  });
});
