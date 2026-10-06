import { describe, expect, it } from "vite-plus/test";
import { layerFor } from "./layer.ts";

describe("layerFor", () => {
  it("returns the nearest open dialog, else body", () => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const inner = document.createElement("button");
    dialog.append(inner);
    document.body.append(dialog);
    expect(layerFor(inner)).toBe(dialog);
    dialog.removeAttribute("open");
    expect(layerFor(inner)).toBe("body");
    expect(layerFor(null)).toBe("body");
    dialog.remove();
  });
});
