import { describe, expect, it } from "vite-plus/test";
import { firstName } from "./format.ts";

describe("firstName", () => {
  it("keeps the honorific with the name households actually use", () => {
    expect(firstName("Maria Aparecida")).toBe("Maria");
    expect(firstName("Dona Cida")).toBe("Dona Cida");
    expect(firstName("seu Antônio Silva")).toBe("seu Antônio");
    expect(firstName("  Rosa ")).toBe("Rosa");
  });
});
