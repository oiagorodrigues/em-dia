import { ref } from "vue";

const open = ref(false);

/** One feedback sheet for the whole app; the sidebar and the account menu open it. */
export function useFeedbackSheet() {
  return {
    open,
    show: () => {
      open.value = true;
    },
  };
}
