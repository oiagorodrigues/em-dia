import { describe, expect, it } from "vite-plus/test";
import { maskPhone } from "./phone.ts";

describe("maskPhone", () => {
  it("formats mobile and landline numbers as they are typed", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("1")).toBe("(1");
    expect(maskPhone("119")).toBe("(11) 9");
    expect(maskPhone("1134567890")).toBe("(11) 3456-7890");
    expect(maskPhone("11912345678")).toBe("(11) 91234-5678");
  });

  it("drops letters and extra digits", () => {
    expect(maskPhone("(11) 9a1234-56789999")).toBe("(11) 91234-5678");
  });
});
