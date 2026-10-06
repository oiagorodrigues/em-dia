<script setup lang="ts">
import {
  formatCents,
  formatDuration,
  monthName,
  parseYearMonth,
  type DashboardItem,
  type Payment,
} from "@ponto/shared";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { dashboardApi, entriesApi, errorMessage, paymentsApi } from "@/api";
import ClockButton from "@/components/feature/ClockButton.vue";
import InstallHint from "@/components/feature/InstallHint.vue";
import Ledger from "@/components/feature/Ledger.vue";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import TodayRow from "@/components/feature/TodayRow.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useResource } from "@/composables/resource.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { firstName } from "@/lib/format.ts";
import { greeting } from "@/lib/greeting.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();

const { data, error, loading, reload, mutate } = useResource(
  () => 0,
  () => dashboardApi.get(),
);

const selectedId = ref<string>("");
watch(
  data,
  (d) => {
    if (!d?.items.length) return;
    if (!d.items.some((i) => i.contract.id === selectedId.value))
      selectedId.value = d.items[0]!.contract.id;
  },
  { immediate: true },
);

const item = computed<DashboardItem | null>(
  () => data.value?.items.find((i) => i.contract.id === selectedId.value) ?? null,
);
const options = computed(
  () =>
    data.value?.items.map((i) => ({ value: i.contract.id, label: i.contract.employerName })) ?? [],
);
const clockState = computed(() =>
  item.value ? clockStateOf(item.value.today, item.value.contract.status === "active") : "off",
);
const month = computed(() => (data.value ? monthName(parseYearMonth(data.value.month).month) : ""));

const clocking = ref(false);
const freshDate = ref<string | null>(null);

async function onClock(action: "in" | "out"): Promise<void> {
  const current = item.value;
  if (!current || clocking.value) return;
  clocking.value = true;
  try {
    const { entry } = await entriesApi.clock(current.contract.id, action);
    mutate((d) => ({
      ...d!,
      items: d!.items.map((i) =>
        i.contract.id === current.contract.id ? { ...i, today: entry } : i,
      ),
    }));
    freshDate.value = entry.date;
    toast.success(
      action === "in"
        ? `Entrada às ${entry.checkIn} registrada.`
        : `Saída às ${entry.checkOut} registrada.`,
    );
    void reload();
  } catch (e) {
    toast.error(errorMessage(e));
    void reload();
  } finally {
    clocking.value = false;
  }
}

const acking = ref(false);
async function acknowledge(payment: Payment): Promise<void> {
  acking.value = true;
  try {
    const { payment: updated } = await paymentsApi.acknowledge(payment.contractId, payment.id);
    mutate((d) => ({
      ...d!,
      items: d!.items.map((i) =>
        i.lastPayment?.id === updated.id ? { ...i, lastPayment: updated } : i,
      ),
    }));
    toast.success("Recebimento confirmado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    acking.value = false;
  }
}

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(payment: Payment): void {
  viewing.value = payment;
  viewerOpen.value = true;
}

const clockEl = useTemplateRef<HTMLElement>("clockWrap");
// The "Bater ponto" app shortcut lands on /?bater=1: focus the clock once it renders, never auto-press.
const stopShortcut = watch(
  () => route.query.bater !== undefined && !!item.value,
  async (ready) => {
    if (!ready) return;
    await nextTick();
    clockEl.value?.querySelector("button")?.focus();
    stopShortcut();
  },
  { immediate: true },
);
</script>

<template>
  <div class="wh">
    <header>
      <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
      <h1 class="visually-hidden">Início</h1>
    </header>

    <div v-if="loading && !data" class="wh__clock" aria-busy="true">
      <Skeleton w="200px" h="200px" class="round" />
      <Skeleton h="56px" gap="24px" />
      <Skeleton h="120px" gap="24px" />
    </div>

    <EmptyState v-else-if="error && !data" tone="error" title="Não deu para carregar o início.">
      {{ error.message }}
      <template #actions><Button @click="reload">tentar de novo</Button></template>
    </EmptyState>

    <EmptyState
      v-else-if="data && data.items.length === 0"
      title="Você ainda não está em nenhum vínculo."
    >
      Peça o código de 8 letras para quem te contratou e coloque aqui. Aí é só bater o ponto.
      <template #actions>
        <Button to="/entrar-no-vinculo" variant="primary" icon="key">tenho um código</Button>
      </template>
    </EmptyState>

    <template v-else-if="data && item">
      <Segmented
        v-if="options.length > 1"
        v-model="selectedId"
        :options="options"
        label="Onde você está trabalhando"
      />

      <section ref="clockWrap" class="wh__clock" aria-label="Bater ponto">
        <ClockButton :state="clockState" :loading="clocking" @press="onClock" />
        <p class="wh__where">
          <span class="label">em</span>
          {{ item.contract.householdName }} · {{ item.contract.employerName }}
        </p>
      </section>

      <TodayRow :entry="item.today" :date="data.today" :fresh="freshDate === data.today" />

      <section class="wh__month" aria-labelledby="wh-month">
        <div class="wh__monthhead">
          <h2 id="wh-month" class="section-title">{{ month }}</h2>
          <Button :to="`/vinculos/${item.contract.id}`" variant="ghost" icon-right="arrow-right"
            >ver cartão</Button
          >
        </div>
        <div class="wh__big">
          <div>
            <p class="label">horas</p>
            <p class="wh__num mono">{{ formatDuration(item.summary.totalMinutes) }}</p>
          </div>
          <div class="wh__right">
            <p class="label">a receber</p>
            <p class="wh__num mono">{{ formatCents(Math.max(0, item.summary.balanceCents)) }}</p>
          </div>
        </div>
        <Ledger
          :lines="[
            {
              label: 'Dias trabalhados',
              value: `${item.summary.daysWorked} de ${item.summary.expectedDays}`,
            },
            { label: 'Ganho no mês', value: formatCents(item.summary.grossCents) },
            {
              label: 'Extras e descontos',
              value: formatCents(item.summary.adjustmentsCents),
              tone: item.summary.adjustmentsCents < 0 ? 'red' : 'neutral',
            },
            {
              label: 'Já recebido',
              value: formatCents(item.summary.paidCents),
              tone: item.summary.paidCents > 0 ? 'green' : 'neutral',
            },
          ]"
        />
        <p v-if="item.summary.pendingConfirmation > 0" class="wh__pending">
          {{ item.summary.pendingConfirmation }}
          {{
            item.summary.pendingConfirmation === 1
              ? "dia aguardando confirmação"
              : "dias aguardando confirmação"
          }}
        </p>
      </section>

      <section v-if="item.lastPayment" class="wh__pay" aria-labelledby="wh-pay">
        <h2 id="wh-pay" class="section-title">último pagamento</h2>
        <ReceiptStub
          :payment="item.lastPayment"
          can-acknowledge
          :busy="acking"
          @acknowledge="acknowledge(item.lastPayment)"
          @view="view(item.lastPayment)"
        />
      </section>

      <InstallHint />
    </template>

    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
  </div>
</template>

<style scoped>
.wh {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-7);
}

.wh__clock {
  display: grid;
  justify-items: center;
  gap: var(--s-4);
  padding: var(--s-4) 0 0;
}

.wh__clock :deep(.round) {
  border-radius: 50%;
}

.wh__where {
  display: flex;
  gap: var(--s-2);
  align-items: baseline;
  font-size: var(--t-14);
  color: var(--ink-2);
  text-align: center;
}

.wh__month {
  display: grid;
  gap: var(--s-5);
}

.wh__monthhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wh__big {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  padding-bottom: var(--s-4);
  border-bottom: 1px solid var(--ink);
}

.wh__right {
  text-align: right;
}

.wh__num {
  font-size: clamp(var(--t-28), 9vw, var(--t-40));
  font-weight: 600;
  letter-spacing: -0.05em;
  line-height: 1.1;
}

.wh__pending {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.wh__pay {
  display: grid;
  gap: var(--s-4);
}
</style>
