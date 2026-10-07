import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastTone = "neutral" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
  /** ms; 0 keeps it until dismissed. */
  timeout: number;
}

let nextId = 1;

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }

  function show(message: string, opts: Partial<Omit<Toast, "id" | "message">> = {}): number {
    const toast: Toast = {
      id: nextId++,
      message,
      tone: opts.tone ?? "neutral",
      action: opts.action,
      timeout: opts.timeout ?? 4000,
    };
    toasts.value = [...toasts.value.slice(-2), toast];
    if (toast.timeout > 0)
      timers.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), toast.timeout),
      );
    return toast.id;
  }

  const success = (message: string) => show(message, { tone: "success" });
  const error = (message: string) => show(message, { tone: "error", timeout: 6000 });

  /** Confirms a reversible action and offers "desfazer" for a few seconds. */
  const undoable = (message: string, undo: () => void, timeout = 6000) =>
    show(message, { tone: "success", timeout, action: { label: "Desfazer", run: undo } });

  return { toasts, show, success, error, undoable, dismiss };
});
