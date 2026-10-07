import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import { defineComponent, h, ref, type Component } from "vue";
import ReceiptDrop from "./ReceiptDrop.vue";

function png(name = "pix.png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

function dragEvent(files: File[] = []) {
  return { dataTransfer: { types: ["Files"], files, dropEffect: "none" } };
}

function setup() {
  const picked: (File | null)[] = [];
  const model = ref<File | null>(null);
  const Host = defineComponent(
    () => () =>
      // tsgolint sees the .vue shim; erase to the runtime contract (as in DataTable.test).
      h(ReceiptDrop as unknown as Component, {
        modelValue: model.value,
        "onUpdate:modelValue": (f: File | null) => {
          picked.push(f);
          model.value = f;
        },
      }),
  );
  return { wrapper: mount(Host), picked };
}

describe("ReceiptDrop", () => {
  it("says you can drag and drop or click, with the accepted types and size", () => {
    const { wrapper } = setup();
    const zone = wrapper.get(".rd__zone");
    expect(zone.text()).toContain("Arraste e solte o arquivo aqui ou clique para escolher");
    expect(zone.text()).toContain("JPG, PNG, WebP ou PDF, até 5 MB");
    expect(zone.classes()).not.toContain("is-over");
  });

  it("shows the drag-over state while a file is over the zone, across child elements", async () => {
    const { wrapper } = setup();
    const root = wrapper.get(".rd");
    await root.trigger("dragenter", dragEvent());
    expect(wrapper.get(".rd__zone").classes()).toContain("is-over");
    expect(wrapper.get(".rd__zone").text()).toContain("Solte o arquivo para anexar");

    // Crossing into a child fires enter on the child before leave on the parent.
    await wrapper.get(".rd__icon").trigger("dragenter", dragEvent());
    await root.trigger("dragleave");
    expect(wrapper.get(".rd__zone").classes()).toContain("is-over");

    await root.trigger("dragleave");
    expect(wrapper.get(".rd__zone").classes()).not.toContain("is-over");
    expect(wrapper.get(".rd__zone").text()).toContain("Arraste e solte");
  });

  it("ignores drags that carry no files, like selected text", async () => {
    const { wrapper } = setup();
    await wrapper.get(".rd").trigger("dragenter", { dataTransfer: { types: ["text/plain"] } });
    expect(wrapper.get(".rd__zone").classes()).not.toContain("is-over");
  });

  it("takes a dropped receipt and leaves the drag state", async () => {
    const { wrapper, picked } = setup();
    const file = png();
    await wrapper.get(".rd").trigger("dragenter", dragEvent([file]));
    await wrapper.get(".rd").trigger("drop", dragEvent([file]));
    expect(picked).toEqual([file]);
    expect(wrapper.find(".rd__zone").exists()).toBe(false);
    expect(wrapper.get(".rd__file").classes()).not.toContain("is-over");
    expect(wrapper.get(".rd__name").text()).toBe("pix.png");
  });

  it("refuses a dropped file of the wrong type with a message", async () => {
    const { wrapper, picked } = setup();
    const doc = new File(["x"], "notas.docx", { type: "application/msword" });
    await wrapper.get(".rd").trigger("drop", dragEvent([doc]));
    expect(picked).toEqual([]);
    expect(wrapper.get(".rd__zone").classes()).toContain("is-error");
    expect(wrapper.get("[role=alert]").text()).toContain("JPG, PNG, WebP");
  });
});
