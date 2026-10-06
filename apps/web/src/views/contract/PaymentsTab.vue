<script setup lang="ts">
import { formatCents, parseYearMonth, type Payment } from "@emdia/shared";
import { computed, ref } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { receiptProblem } from "@/lib/receipt.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth } = useContract();

const thisYear = parseYearMonth(currentMonth).year;
const firstYear = computed(() => Number(contract.value.startedOn.slice(0, 4)));
const year = ref(parseYearMonth(month.value).year);

const payments = useResource(
  () => `${contract.value.id}|${year.value}`,
  () => paymentsApi.list(contract.value.id, year.value).then((r) => r.payments),
);

const total = computed(() => payments.data.value?.reduce((s, p) => s + p.amountCents, 0) ?? 0);
const busyId = ref<string | null>(null);

function replace(updated: Payment): void {
  payments.mutate((list = []) => list.map((p) => (p.id === updated.id ? updated : p)));
}

async function acknowledge(p: Payment): Promise<void> {
  busyId.value = p.id;
  try {
    replace((await paymentsApi.acknowledge(contract.value.id, p.id)).payment);
    toast.success("Recebimento confirmado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

const pendingRemove = ref<string | null>(null);
async function remove(p: Payment): Promise<void> {
  if (pendingRemove.value !== p.id) {
    pendingRemove.value = p.id;
    setTimeout(() => {
      if (pendingRemove.value === p.id) pendingRemove.value = null;
    }, 6000);
    toast.show(`Excluir o pagamento de ${formatCents(p.amountCents)}?`, {
      timeout: 6000,
      action: { label: "excluir", run: () => void remove(p) },
    });
    return;
  }
  pendingRemove.value = null;
  busyId.value = p.id;
  try {
    await paymentsApi.remove(contract.value.id, p.id);
    payments.mutate((list = []) => list.filter((x) => x.id !== p.id));
    toast.success("Pagamento excluído.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

async function attach(p: Payment, file: File): Promise<void> {
  const problem = receiptProblem(file);
  if (problem) {
    toast.error(problem);
    return;
  }
  const form = new FormData();
  form.append("receipt", file);
  busyId.value = p.id;
  try {
    replace((await paymentsApi.replaceReceipt(contract.value.id, p.id, form)).payment);
    toast.success("Comprovante anexado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(p: Payment): void {
  viewing.value = p;
  viewerOpen.value = true;
}
</script>

<template>
  <div class="pt">
    <div class="pt__bar">
      <div class="pt__year">
        <button
          type="button"
          class="pt__ybtn"
          :disabled="year <= firstYear"
          aria-label="Ano anterior"
          @click="year--"
        >
          <Icon name="arrow-left" :size="18" />
        </button>
        <h2 class="pt__ylabel mono" aria-live="polite">{{ year }}</h2>
        <button
          type="button"
          class="pt__ybtn"
          :disabled="year >= thisYear"
          aria-label="Próximo ano"
          @click="year++"
        >
          <Icon name="arrow-right" :size="18" />
        </button>
      </div>
      <Button
        v-if="auth.isEmployer && contract.status === 'active'"
        :to="{ path: '/pagamentos/novo', query: { vinculo: contract.id, mes: month } }"
        variant="primary"
        icon="plus"
        >novo pagamento</Button
      >
    </div>

    <div v-if="payments.loading.value && !payments.data.value" class="pt__list" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" h="132px" />
    </div>

    <EmptyState
      v-else-if="payments.error.value"
      tone="error"
      title="Não deu para carregar os pagamentos."
    >
      {{ payments.error.value.message }}
      <template #actions><Button @click="payments.reload">tentar de novo</Button></template>
    </EmptyState>

    <EmptyState
      v-else-if="payments.data.value?.length === 0"
      :title="`Nenhum pagamento em ${year}.`"
    >
      <template v-if="auth.isEmployer"
        >Registre cada pagamento com o comprovante. Fica guardado para os dois lados.</template
      >
      <template v-else
        >Quando houver um pagamento, ele aparece aqui para você confirmar que recebeu.</template
      >
    </EmptyState>

    <template v-else-if="payments.data.value">
      <p class="pt__sum">
        <span class="label">total pago em {{ year }}</span>
        <span class="mono pt__total">{{ formatCents(total) }}</span>
      </p>
      <ul class="pt__list">
        <li v-for="p in payments.data.value" :key="p.id">
          <ReceiptStub
            :payment="p"
            :can-acknowledge="auth.isWorker"
            :can-manage="auth.isEmployer"
            :busy="busyId === p.id"
            @acknowledge="acknowledge(p)"
            @remove="remove(p)"
            @attach="attach(p, $event)"
            @view="view(p)"
          />
        </li>
      </ul>
    </template>

    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
  </div>
</template>

<style scoped>
.pt {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.pt__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.pt__year {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.pt__ybtn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--sheet);
}

.pt__ybtn:hover:not(:disabled) {
  border-color: var(--ink);
}

.pt__ybtn:disabled {
  opacity: 0.35;
}

.pt__ylabel {
  font-size: var(--t-28);
  font-weight: 600;
  letter-spacing: -0.04em;
  min-width: 4.2ch;
  text-align: center;
}

.pt__sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--s-3);
  border-bottom: 3px double var(--ink);
}

.pt__total {
  font-size: var(--t-20);
  font-weight: 600;
}

.pt__list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-4);
}
</style>
