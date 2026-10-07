import { watch } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";
import { useToastStore } from "@/stores/toast.ts";

const HOUR = 60 * 60 * 1000;

export function useServiceWorker(): void {
  const toast = useToastStore();
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), HOUR);
    },
  });

  watch(needRefresh, (value) => {
    if (!value) return;
    toast.show("Nova versão disponível.", {
      timeout: 0,
      action: { label: "Atualizar", run: () => void updateServiceWorker(true) },
    });
  });

  watch(offlineReady, (value) => {
    if (value) toast.show("Pronto para funcionar sem internet.");
  });
}
