import { describe, expect, it } from "vite-plus/test";
import { initialsOf, tintFor, TINTS } from "./tint.ts";

describe("avatar tint", () => {
  it("is stable for the same person, whatever the casing or accents", () => {
    expect(tintFor("Antônio Lima")).toBe(tintFor("antonio lima"));
    expect(tintFor("  Maria  ")).toBe(tintFor("maria"));
  });

  it("always returns one of the palette tints", () => {
    for (const name of ["Ana", "Joana", "Seu Antônio", "Dona Cida", "Rosa", ""]) {
      expect(TINTS).toContain(tintFor(name));
    }
  });

  it("spreads a household's names over several tints", () => {
    const names = [
      "Ana Souza",
      "Maria Aparecida",
      "Joana",
      "Seu Antônio",
      "Rosa",
      "Dona Cida",
      "Lúcia",
      "Bete",
    ];
    expect(new Set(names.map(tintFor)).size).toBeGreaterThanOrEqual(3);
  });

  it("builds initials from first and last word", () => {
    expect(initialsOf("Maria Aparecida da Silva")).toBe("MS");
    expect(initialsOf("Rosa")).toBe("RO");
    expect(initialsOf("  ")).toBe("?");
  });
});
