import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, h, nextTick, ref, type Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import Button from "./Button.vue";
import ChoiceField from "./ChoiceField.vue";
import DateField from "./DateField.vue";
import Select from "./Select.vue";
import Sheet from "./Sheet.vue";
import TableActions from "./TableActions.vue";
import TimeField from "./TimeField.vue";
import Tooltip from "./Tooltip.vue";
import { TOOLTIP_DELAY, tooltipWarm } from "./tooltip.ts";

// vue-tsc sees the generic SFCs and tsgolint the .vue shim; erase both to the runtime contract.
const C = (c: unknown) => c as Component;

function media({ coarse = false, wide = true } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("coarse") ? coarse : query.includes("min-width") ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** Mounts `comp` with a v-model bound to a ref we can inspect. */
function withModel<T>(comp: unknown, initial: T, props: Record<string, unknown> = {}) {
  const model = ref(initial) as { value: T };
  const wrapper = mount(
    defineComponent(
      () => () =>
        h(C(comp), {
          ...props,
          modelValue: model.value,
          "onUpdate:modelValue": (v: T) => (model.value = v),
        }),
    ),
    { attachTo: document.body },
  );
  return { wrapper, model };
}

const OPTIONS = [
  { value: "diarista", label: "Diarista" },
  { value: "baba", label: "Babá", description: "cuida das crianças" },
  { value: "cuidadora", label: "Cuidadora" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Select", () => {
  it("opens a listbox on a fine pointer and picks with the keyboard", async () => {
    media();
    const { wrapper, model } = withModel(Select, "diarista" as string | null, {
      options: OPTIONS,
      label: "Função",
    });
    const button = wrapper.get('[role="combobox"]');
    expect(button.text()).toContain("Diarista");
    await button.trigger("keydown", { key: "ArrowDown" });
    await flushPromises();
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(list).not.toBeNull();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();
    expect(model.value).toBe("baba");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("type-ahead on the closed control changes the value like a native select", async () => {
    media();
    const { wrapper, model } = withModel(Select, null as string | null, {
      options: OPTIONS,
      label: "Função",
    });
    await wrapper.get('[role="combobox"]').trigger("keydown", { key: "c" });
    expect(model.value).toBe("cuidadora");
  });

  it("keeps a real <select> in the DOM, and uses it directly on touch screens", async () => {
    media({ coarse: true });
    const { wrapper, model } = withModel(Select, "diarista" as string | null, {
      options: OPTIONS,
      label: "Função",
    });
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
    const select = wrapper.get("select");
    expect(select.attributes("aria-label")).toBe("Função");
    await select.setValue("cuidadora");
    expect(model.value).toBe("cuidadora");
  });
});

describe("ChoiceField", () => {
  it("is a segmented control on wide screens and a Select on small ones", () => {
    media({ wide: true });
    const wide = withModel(ChoiceField, "daily", {
      label: "Como paga",
      options: [
        { value: "hourly", label: "Por hora" },
        { value: "daily", label: "Por diária" },
      ],
    });
    expect(wide.wrapper.find('[role="radiogroup"]').exists()).toBe(true);

    media({ wide: false });
    const small = withModel(ChoiceField, "daily", {
      label: "Como paga",
      options: [
        { value: "hourly", label: "Por hora" },
        { value: "daily", label: "Por diária" },
      ],
    });
    expect(small.wrapper.find('[role="radiogroup"]').exists()).toBe(false);
    expect(small.wrapper.find('[role="combobox"]').exists()).toBe(true);
  });
});

describe("TimeField", () => {
  it("masks typing and commits a normalized time on blur", async () => {
    media();
    const { wrapper, model } = withModel(TimeField, "", { label: "Entrada" });
    const input = wrapper.get("input");
    await input.setValue("0830");
    expect((input.element as HTMLInputElement).value).toBe("08:30");
    expect(model.value).toBe("08:30");
    await input.setValue("8");
    await input.trigger("blur");
    expect(model.value).toBe("08:00");
  });

  it("offers 15-minute slots on desktop", async () => {
    media();
    const { wrapper, model } = withModel(TimeField, "08:10", { label: "Entrada" });
    await wrapper.get('button[aria-label="Escolher entrada"]').trigger("click");
    await flushPromises();
    const slots = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(slots).toHaveLength(96);
    slots.find((s) => s.textContent?.trim() === "17:45")!.click();
    await nextTick();
    expect(model.value).toBe("17:45");
  });
});

describe("DateField", () => {
  it("shows DD/MM/AAAA and stores ISO", async () => {
    media();
    const { wrapper, model } = withModel(DateField, "2026-10-06", { label: "Início" });
    const input = wrapper.get("input");
    expect((input.element as HTMLInputElement).value).toBe("06/10/2026");
    await input.setValue("01112026");
    expect((input.element as HTMLInputElement).value).toBe("01/11/2026");
    expect(model.value).toBe("2026-11-01");
  });

  it("accepts a pasted ISO date", async () => {
    media();
    const { wrapper, model } = withModel(DateField, "", { label: "Início" });
    await wrapper.get("input").setValue("2026-09-01");
    expect(model.value).toBe("2026-09-01");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("01/09/2026");
  });

  it("picks a day from the calendar and respects min", async () => {
    media();
    const { wrapper, model } = withModel(DateField, "2026-10-06", {
      label: "Início",
      min: "2026-10-05",
    });
    await wrapper.get("button").trigger("click");
    await flushPromises();
    const day = (date: string) =>
      document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
    expect(day("2026-10-04").disabled).toBe(true);
    day("2026-10-20").click();
    await nextTick();
    expect(model.value).toBe("2026-10-20");
  });
});

describe("Tooltip", () => {
  it("renders its bubble on <body>, never inside the trigger's container", async () => {
    vi.useFakeTimers();
    const wrapper = mount(Tooltip, {
      props: { text: "Ver cartão" },
      slots: { default: () => h("button", "x") },
      attachTo: document.body,
    });
    await wrapper.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await flushPromises();
    const tip = document.body.querySelector('[role="tooltip"]');
    expect(tip?.textContent?.trim()).toBe("Ver cartão");
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    await wrapper.get(".tip-anchor").trigger("mouseleave");
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    vi.useRealTimers();
  });

  function mountTip(props: Record<string, unknown> = {}) {
    return mount(Tooltip, {
      props: { text: "Adicionar profissional", ...props },
      slots: { default: () => h("button", "x") },
      attachTo: document.body,
    });
  }
  const bubble = () => document.body.querySelector('[role="tooltip"]');

  it("waits for the hover delay before showing", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const wrapper = mountTip();
    await wrapper.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY - 1);
    await flushPromises();
    expect(bubble()).toBeNull();
    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(bubble()?.textContent?.trim()).toBe("Adicionar profissional");
    vi.useRealTimers();
  });

  it("never shows when the pointer leaves before the delay", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const wrapper = mountTip();
    await wrapper.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY / 2);
    await wrapper.get(".tip-anchor").trigger("mouseleave");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await flushPromises();
    expect(bubble()).toBeNull();
    vi.useRealTimers();
  });

  it("shows at once on keyboard focus and closes on Escape", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const wrapper = mountTip();
    const button = wrapper.get("button").element;
    button.matches = ((selector: string): boolean =>
      selector === ":focus-visible") as Element["matches"];
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vi.advanceTimersByTime(0);
    await flushPromises();
    expect(bubble()).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(bubble()).toBeNull();
    vi.useRealTimers();
  });

  it("skips the delay right after another tooltip closed", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const first = mountTip({ text: "Primeiro" });
    const second = mountTip({ text: "Segundo" });
    await first.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await first.get(".tip-anchor").trigger("mouseleave");
    await second.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(0);
    await flushPromises();
    expect(bubble()?.textContent?.trim()).toBe("Segundo");
    vi.useRealTimers();
  });

  it("stays hidden while disabled", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const wrapper = mountTip({ disabled: true });
    await wrapper.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY * 2);
    await flushPromises();
    expect(bubble()).toBeNull();
    vi.useRealTimers();
  });
});

describe("Button iconOnly", () => {
  it("keeps the label as the accessible name and as a tooltip", async () => {
    vi.useFakeTimers();
    tooltipWarm.reset();
    const wrapper = mount(C(Button), {
      props: { icon: "user-plus", iconOnly: true, label: "Adicionar profissional" },
      attachTo: document.body,
    });
    const button = wrapper.get("button");
    expect(button.attributes("aria-label")).toBe("Adicionar profissional");
    expect(button.classes()).toContain("btn--icon-only");
    expect(button.text()).toBe("Adicionar profissional");
    await wrapper.get(".tip-anchor").trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await flushPromises();
    expect(document.body.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe(
      "Adicionar profissional",
    );
    wrapper.unmount();
    vi.useRealTimers();
  });

  it("forwards listeners to the button, not the tooltip wrapper", async () => {
    const onClick = vi.fn();
    const wrapper = mount(C(Button), {
      props: { icon: "refresh", iconOnly: true, label: "Tentar de novo", onClick },
      attachTo: document.body,
    });
    await wrapper.get("button").trigger("click");
    expect(onClick).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});

describe("TableActions", () => {
  async function render(props: Record<string, unknown>) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { render: () => null } }],
    });
    await router.push("/");
    return mount(C(TableActions), {
      props,
      global: { plugins: [router] },
      attachTo: document.body,
    });
  }

  it("renders a single inline button for a single action", async () => {
    const wrapper = await render({ actions: [{ label: "Ver", icon: "eye" }] });
    expect(wrapper.findAll(".ib")).toHaveLength(1);
    expect(wrapper.find('[aria-haspopup="menu"]').exists()).toBe(false);
  });

  it("shows two colored inline buttons and a menu for the rest", async () => {
    const onPay = vi.fn();
    const wrapper = await render({
      actions: [
        { label: "Bater entrada", icon: "clock-in", tone: "brand" },
        { label: "Registrar pagamento", icon: "wallet-plus", tone: "brand", onClick: onPay },
        { label: "Ver", icon: "eye" },
      ],
      menu: [{ label: "Remover", icon: "trash", danger: true, onSelect: () => {} }],
    });
    const buttons = wrapper.findAll(".ib");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.classes()).toContain("ib--brand");
    await buttons[1]!.trigger("click");
    expect(onPay).toHaveBeenCalledOnce();
    expect(wrapper.find('[aria-haspopup="menu"]').exists()).toBe(true);
  });
});

describe("floating layers inside a modal dialog", () => {
  it("mounts the Select listbox inside the open <dialog>, not behind it on <body>", async () => {
    media();
    const model = ref<string | null>("worked");
    const open = ref(true);
    const wrapper = mount(
      defineComponent(
        () => () =>
          h(
            C(Sheet),
            { open: open.value, "onUpdate:open": (v: boolean) => (open.value = v), title: "Dia" },
            {
              default: () =>
                h(C(Select), {
                  modelValue: model.value,
                  "onUpdate:modelValue": (v: string | null) => (model.value = v),
                  label: "O que aconteceu",
                  options: [
                    { value: "worked", label: "Trabalhou" },
                    { value: "absent", label: "Faltou" },
                  ],
                }),
            },
          ),
      ),
      { attachTo: document.body },
    );
    await flushPromises();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);

    await wrapper.get('[role="combobox"]').trigger("click");
    await flushPromises();
    const list = document.querySelector('[role="listbox"]')!;
    expect(list).not.toBeNull();
    expect(dialog.contains(list)).toBe(true);

    // Esc closes the listbox only; the dialog stays open.
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(open.value).toBe(true);

    await wrapper.get('[role="combobox"]').trigger("click");
    await flushPromises();
    [...document.querySelectorAll<HTMLElement>('[role="option"]')][1]!.click();
    await flushPromises();
    expect(model.value).toBe("absent");
  });

  it("keeps using <body> outside dialogs", async () => {
    media();
    const { wrapper } = withModel(Select, null as string | null, {
      options: OPTIONS,
      label: "Função",
    });
    await wrapper.get('[role="combobox"]').trigger("click");
    await flushPromises();
    const list = document.querySelector('[role="listbox"]')!;
    expect(list.closest("dialog")).toBeNull();
    expect(wrapper.element.contains(list)).toBe(false);
  });
});
