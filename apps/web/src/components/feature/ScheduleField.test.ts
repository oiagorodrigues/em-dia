import type { Schedule } from "@emdia/shared";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SCHEDULE } from "@/lib/schedule.ts";
import ScheduleField from "./ScheduleField.vue";

function setup(initial: Schedule = DEFAULT_SCHEDULE) {
  const state = { value: structuredClone(initial) };
  const wrapper = mount(ScheduleField, {
    props: {
      modelValue: state.value,
      month: "2026-10",
      startedOn: "2026-01-01",
      "onUpdate:modelValue": (v: Schedule) => {
        state.value = v;
        // The .vue shim types props loosely for .ts files; the runtime prop is `modelValue`.
        void wrapper.setProps({ modelValue: v } as never);
      },
    },
  });
  return { wrapper, state };
}

describe("ScheduleField", () => {
  it("applies a weekday preset and updates the live summary", async () => {
    const { wrapper, state } = setup();
    const preset = wrapper.findAll(".sf__preset").find((b) => b.text() === "Seg a sex")!;
    await preset.trigger("click");
    expect(state.value.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(wrapper.get(".sf__summary").text()).toBe("seg a sex · 22 dias previstos em outubro");
    expect(preset.attributes("aria-pressed")).toBe("true");
  });

  it("switches to fixed month dates and toggles days on the grid", async () => {
    const { wrapper, state } = setup();
    await wrapper
      .findAll('input[type="radio"]')
      .find((r) => (r.element as HTMLInputElement).value === "month_days")!
      .setValue();
    expect(state.value.kind).toBe("month_days");
    await wrapper
      .findAll(".mdg__day")
      .find((b) => b.text() === "20")!
      .trigger("click");
    expect(state.value.monthDays).toEqual([5, 20]);
    expect(wrapper.get(".sf__summary").text()).toBe(
      "dias 5 e 20 de cada mês · 2 dias previstos em outubro",
    );
  });

  it("steps visits per month", async () => {
    const { wrapper, state } = setup({ ...DEFAULT_SCHEDULE, kind: "per_month", visitsPerMonth: 2 });
    await wrapper.get('button[aria-label="Mais 1 vez"]').trigger("click");
    expect(state.value.visitsPerMonth).toBe(3);
    expect(wrapper.get(".stp__val").text()).toBe("3");
  });

  it("offers a custom repetition of up to 12 weeks", async () => {
    const { wrapper, state } = setup();
    await wrapper
      .findAll('input[type="radio"]')
      .find((r) => (r.element as HTMLInputElement).value === "custom")!
      .setValue();
    expect(state.value.everyWeeks).toBe(4);
    const weeks = wrapper.get('input[type="number"]');
    await weeks.setValue("6");
    await weeks.trigger("change");
    expect(state.value.everyWeeks).toBe(6);
    await weeks.setValue("20");
    await weeks.trigger("change");
    expect(state.value.everyWeeks).toBe(12);
    expect(wrapper.get(".sf__summary").text()).not.toContain("~");
  });

  it("shows the field error", () => {
    const wrapper = mount(ScheduleField, {
      props: {
        modelValue: DEFAULT_SCHEDULE,
        month: "2026-10",
        startedOn: "2026-01-01",
        error: "Escolha pelo menos um dia",
      },
    });
    expect(wrapper.get('[role="alert"]').text()).toBe("Escolha pelo menos um dia");
  });
});
