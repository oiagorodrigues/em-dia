import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import { useFeedbackSheet } from "@/composables/feedback.ts";
import FeedbackButton from "./FeedbackButton.vue";

describe("FeedbackButton", () => {
  it("opens the feedback sheet", async () => {
    const { open } = useFeedbackSheet();
    open.value = false;
    const w = mount(FeedbackButton);
    expect(w.text()).toBe("Feedback");
    await w.get("button").trigger("click");
    expect(open.value).toBe(true);
    open.value = false;
  });
});
