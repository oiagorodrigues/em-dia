import { describe, expect, it } from "vite-plus/test";
import { initialsOf } from "./initials.ts";

describe("initialsOf", () => {
  it("uses first and last word", () => {
    expect(initialsOf("Maria Aparecida da Silva")).toBe("MS");
    expect(initialsOf("Rosa")).toBe("RO");
    expect(initialsOf("  ")).toBe("?");
  });
});
