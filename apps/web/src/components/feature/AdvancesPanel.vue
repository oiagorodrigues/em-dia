<script setup lang="ts">
import { formatCents, type Payment } from "@emdia/shared";
import { formatDateShort } from "@/lib/format.ts";
import { advanceProgress } from "@/lib/payments.ts";

export interface AdvanceItem {
  payment: Payment;
  /** Whose adiantamento, on the team page. */
  who?: string;
}

/** Open adiantamentos with what is left to abate in work days. */
const { items, employer = false } = defineProps<{
  items: readonly AdvanceItem[];
  employer?: boolean;
}>();

function abatedShare(p: Payment): number {
  if (p.amountCents <= 0) return 0;
  return Math.round(((p.settledCents ?? 0) / p.amountCents) * 100);
}
</script>

<template>
  <section v-if="items.length > 0" class="adv" aria-labelledby="adv-title">
    <h2 id="adv-title" class="adv__title">Adiantamentos em aberto</h2>
    <p class="adv__how">
      {{
        employer
          ? "Ao anotar um dia trabalhado no cartão, escolha “abater do adiantamento”."
          : "Cada dia abatido conta como pago e diminui o que falta."
      }}
    </p>
    <ul class="adv__list">
      <li v-for="item in items" :key="item.payment.id" class="adv__item">
        <div class="adv__head">
          <span class="adv__what">
            <strong v-if="item.who">{{ item.who }}</strong>
            <span>Adiantamento de {{ formatDateShort(item.payment.paidOn) }}</span>
          </span>
          <span class="adv__left mono">{{ formatCents(item.payment.remainingCents ?? 0) }}</span>
        </div>
        <span
          class="adv__bar"
          role="progressbar"
          :aria-valuenow="abatedShare(item.payment)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="advanceProgress(item.payment)"
          ><span class="adv__fill" :style="{ width: `${abatedShare(item.payment)}%` }"
        /></span>
        <span class="adv__caption">{{ advanceProgress(item.payment) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.adv {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--amber);
  border-radius: var(--r-2);
}

.adv__title {
  font-size: var(--t-16);
  font-weight: 600;
}

.adv__how {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.adv__list {
  display: grid;
  gap: var(--s-4);
  list-style: none;
  padding: 0;
  margin: 0;
}

@media (min-width: 720px) {
  .adv__list {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

.adv__item {
  display: grid;
  gap: var(--s-2);
  min-width: 0;
}

.adv__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.adv__what {
  display: grid;
  min-width: 0;
  font-size: var(--t-14);
}

.adv__left {
  font-weight: 600;
  color: var(--amber-ink);
  white-space: nowrap;
}

.adv__bar {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.adv__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
}

.adv__caption {
  font-size: var(--t-12);
  color: var(--ink-2);
}
</style>
