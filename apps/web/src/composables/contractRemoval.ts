import type { Contract } from "@emdia/shared";
import { ref, type Ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import { useToastStore } from "@/stores/toast.ts";

/**
 * Logical removal with a confirmation step and an undo toast. DELETE answers 204, so the
 * contract is fetched again to pick up `archivedAt`.
 */
export function useContractRemoval(
  contract: Readonly<Ref<Contract | null | undefined>>,
  replace: (next: Contract) => void,
) {
  const toast = useToastStore();
  const confirmOpen = ref(false);
  const removing = ref(false);
  const restoring = ref(false);

  async function restore(): Promise<void> {
    const c = contract.value;
    if (!c) return;
    restoring.value = true;
    try {
      replace((await contractsApi.restore(c.id)).contract);
      toast.success(`${c.workerName} voltou para a equipe.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      restoring.value = false;
    }
  }

  async function confirmRemove(): Promise<void> {
    const c = contract.value;
    if (!c) return;
    removing.value = true;
    try {
      await contractsApi.remove(c.id);
      replace((await contractsApi.get(c.id)).contract);
      confirmOpen.value = false;
      toast.undoable(`${c.workerName} saiu da equipe.`, () => void restore());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      removing.value = false;
    }
  }

  return {
    confirmOpen,
    removing,
    restoring,
    askRemove: () => (confirmOpen.value = true),
    confirmRemove,
    restore,
  };
}
