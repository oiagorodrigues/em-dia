import type { CreateContractInput } from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import ContractForm from "./ContractForm.vue";

const initial = {
  workerName: "Maria",
  occupation: "diarista",
  payType: "daily",
  rateCents: 18000,
  startedOn: "2026-10-01",
} as const;

function setup(props: Record<string, unknown>) {
  const saved: CreateContractInput[] = [];
  const wrapper = mount(ContractForm, {
    props: {
      initial,
      submitLabel: "salvar",
      save: async (data: CreateContractInput) => void saved.push(data),
      ...props,
    },
    attachTo: document.body,
  });
  return { wrapper, saved };
}

describe("ContractForm", () => {
  it("leaves contact fields out unless the contact section is shown", async () => {
    const { wrapper, saved } = setup({});
    expect(wrapper.find('input[type="tel"]').exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(saved).toHaveLength(1);
    expect("contactEmail" in saved[0]!).toBe(false);
    expect("contactPhone" in saved[0]!).toBe(false);
    wrapper.unmount();
  });

  it("masks the phone and sends the contact when shown", async () => {
    const { wrapper, saved } = setup({ contact: true });
    const tel = wrapper.get('input[type="tel"]');
    await tel.setValue("11912345678");
    expect((tel.element as HTMLInputElement).value).toBe("(11) 91234-5678");
    await wrapper.get('input[type="email"]').setValue("maria@email.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(saved[0]).toMatchObject({
      contactEmail: "maria@email.com",
      contactPhone: "(11) 91234-5678",
    });
    wrapper.unmount();
  });

  it("shows the estimated cost in the resumo panel", () => {
    const { wrapper } = setup({ summary: true });
    expect(wrapper.get(".ep__cost").text()).toMatch(/custo estimado/);
    expect(wrapper.get(".ep__breakdown").text()).toMatch(/diárias? × R\$/);
    wrapper.unmount();
  });
});
