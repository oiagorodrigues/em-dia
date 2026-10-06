import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import { ref } from "vue";
import MoneyInput from "./MoneyInput.vue";

function setup(initial: number | null = null) {
  const model = ref<number | null>(initial);
  const wrapper = mount(MoneyInput, {
    props: {
      modelValue: model.value,
      "onUpdate:modelValue": (v: number | null) => {
        model.value = v;
        // The .vue shim types props loosely for .ts files; the runtime prop is `modelValue`.
        void wrapper.setProps({ modelValue: v } as never);
      },
    },
  });
  return { wrapper, model, input: wrapper.get("input") };
}

describe("MoneyInput", () => {
  it("formats the initial value in pt-BR without the currency symbol", () => {
    const { input } = setup(123456);
    expect((input.element as HTMLInputElement).value).toBe("1.234,56");
  });

  it("shifts typed digits in from the right, like a cash register", async () => {
    const { input, model } = setup();
    await input.setValue("1");
    expect(model.value).toBe(1);
    await input.setValue("0,012");
    expect(model.value).toBe(12);
    await input.setValue("0,1250");
    expect(model.value).toBe(1250);
    expect((input.element as HTMLInputElement).value).toBe("12,50");
  });

  it("ignores letters and clears to null", async () => {
    const { input, model } = setup(500);
    await input.setValue("5,00x");
    expect(model.value).toBe(500);
    await input.setValue("");
    expect(model.value).toBeNull();
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("reads a pasted amount as reais", async () => {
    const { input, model } = setup();
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "R$ 1.234,5" } });
    input.element.dispatchEvent(event);
    expect(model.value).toBe(123450);
    expect(event.defaultPrevented).toBe(true);
  });

  it("caps absurd values at the schema limit", async () => {
    const { input, model } = setup();
    await input.setValue("99999999999999");
    expect(model.value).toBe(100_000_000);
  });

  it("marks itself invalid for assistive tech", () => {
    const wrapper = mount(MoneyInput, {
      props: { modelValue: null, invalid: true, describedBy: "err" },
    });
    expect(wrapper.get("input").attributes("aria-invalid")).toBe("true");
    expect(wrapper.get("input").attributes("aria-describedby")).toBe("err");
  });
});
