<script setup lang="ts">
import {
  formatCents,
  monthName,
  OCCUPATION_LABEL,
  parseYearMonth,
  type Contract,
  type MonthSummary,
  type YearMonth,
} from "@emdia/shared";
import { computed } from "vue";
import Avatar from "@/components/ui/Avatar.vue";
import Icon from "@/components/ui/Icon.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { firstName } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";
import Ledger, { type LedgerLine } from "./Ledger.vue";

const {
  contract,
  month,
  summary,
  loading = false,
  highlightPix = false,
} = defineProps<{
  contract: Contract;
  month: YearMonth;
  summary: MonthSummary | null;
  loading?: boolean;
  highlightPix?: boolean;
}>();

const toast = useToastStore();
const monthLabel = computed(() => {
  const { month: m } = parseYearMonth(month);
  return monthName(m);
});

const lines = computed<LedgerLine[]>(() => {
  if (!summary) return [];
  const out: LedgerLine[] = [{ label: "a receber no mês", value: formatCents(summary.dueCents) }];
  out.push({
    label: "já pago",
    value: formatCents(summary.paidCents),
    tone: summary.paidCents > 0 ? "green" : "neutral",
  });
  return out;
});
const total = computed<LedgerLine | undefined>(() =>
  summary
    ? {
        label: summary.balanceCents > 0 ? "falta pagar" : "em dia",
        value: formatCents(Math.max(0, summary.balanceCents)),
        tone: summary.balanceCents > 0 ? "neutral" : "green",
      }
    : undefined,
);

async function copyPix(): Promise<void> {
  if (!contract.workerPixKey) return;
  try {
    await navigator.clipboard.writeText(contract.workerPixKey);
    toast.success("Chave Pix copiada.");
  } catch {
    toast.error("Não deu para copiar. Selecione a chave e copie à mão.");
  }
}
</script>

<template>
  <aside class="psp" aria-label="Saldo e Pix">
    <div class="psp__who">
      <Avatar :name="contract.workerName" :size="44" />
      <div class="psp__who-text">
        <strong>{{ contract.workerName }}</strong>
        <span>{{ OCCUPATION_LABEL[contract.occupation] }}</span>
      </div>
    </div>

    <div class="psp__saldo">
      <p class="label">saldo de {{ monthLabel }}</p>
      <div v-if="loading && !summary" aria-busy="true">
        <Skeleton h="18px" />
        <Skeleton h="18px" gap="8px" />
        <Skeleton h="22px" gap="12px" />
      </div>
      <Ledger v-else-if="summary" :lines="lines" :total="total" />
      <p v-else class="psp__muted">Escolha o mês de referência para ver o saldo.</p>
    </div>

    <div class="psp__pix" :class="{ 'is-on': highlightPix }">
      <p class="label">chave pix</p>
      <template v-if="contract.workerPixKey">
        <p class="psp__key mono">{{ contract.workerPixKey }}</p>
        <button type="button" class="psp__copy" @click="copyPix">
          <Icon name="copy" :size="16" />
          copiar chave
        </button>
      </template>
      <p v-else class="psp__muted">
        {{ firstName(contract.workerName) }} ainda não cadastrou uma chave Pix no perfil.
      </p>
    </div>
  </aside>
</template>

<style scoped>
.psp {
  display: grid;
  gap: var(--s-5);
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.psp__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.psp__who-text {
  display: grid;
  min-width: 0;
}

.psp__who-text strong {
  font-size: var(--t-16);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.psp__who-text span {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.psp__saldo {
  display: grid;
  gap: var(--s-3);
}

.psp__pix {
  display: grid;
  gap: var(--s-2);
  justify-items: start;
  padding: var(--s-4);
  border-radius: var(--r-2);
  background: var(--surface-2);
  transition: background-color var(--d-base) var(--ease);
}

.psp__pix.is-on {
  background: var(--brand-wash);
  color: var(--brand-ink);
}

.psp__pix.is-on .label {
  color: inherit;
}

.psp__key {
  max-width: 100%;
  font-size: var(--t-14);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.psp__copy {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 40px;
  padding: 0 var(--s-3);
  border: 1px solid currentColor;
  border-radius: var(--r-1);
  font-size: var(--t-14);
  font-weight: 600;
}

.psp__muted {
  font-size: var(--t-14);
  color: var(--ink-2);
}
</style>
