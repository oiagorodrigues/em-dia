<script setup lang="ts">
import { daysInMonth, parseYearMonth, type YearMonth } from "@emdia/shared";
import { computed } from "vue";
import Skeleton from "./Skeleton.vue";

/**
 * The time card while it loads: same perforated sheet, column header and one row per day of
 * the month, with the same grid and container breakpoints as `TimeCard`.
 */
const { month } = defineProps<{ month: YearMonth }>();

const rows = computed(() => {
  const { year, month: m } = parseYearMonth(month);
  return daysInMonth(year, m);
});
</script>

<template>
  <div class="sk-card" aria-busy="true" aria-label="Carregando cartão">
    <div class="sk-card__perf" aria-hidden="true" />
    <div class="sk-card__head" aria-hidden="true">
      <span>dia</span>
      <span>entrada</span>
      <span>saída</span>
      <span class="col-break">pausa</span>
      <span>total</span>
      <span class="col-wide">status</span>
      <span class="col-wide">nota</span>
      <span class="col-wide">confirmação</span>
      <span class="col-dot" />
    </div>
    <ol class="sk-card__rows" aria-hidden="true">
      <li v-for="r in rows" :key="r" class="sk-card__row">
        <Skeleton w="32px" h="14px" />
        <Skeleton w="44px" h="14px" />
        <Skeleton w="44px" h="14px" />
        <Skeleton class="col-break" w="32px" h="14px" />
        <Skeleton w="40px" h="14px" />
        <Skeleton class="col-wide" w="72px" h="20px" />
        <span class="col-wide" />
        <Skeleton class="col-wide" w="64px" h="12px" />
        <Skeleton class="col-dot" w="8px" h="8px" round />
      </li>
    </ol>
  </div>
</template>

<style scoped>
.sk-card {
  position: relative;
  container: skcard / inline-size;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  padding-top: 14px;
  overflow: hidden;
}

.sk-card__perf {
  position: absolute;
  inset: 0 0 auto;
  height: 7px;
  background: radial-gradient(circle at 50% 0, var(--bg) 4px, transparent 4.5px) 0 0 / 16px 8px
    repeat-x;
  border-bottom: 1px dashed var(--rule);
}

.sk-card__head,
.sk-card__row {
  display: grid;
  grid-template-columns: 52px 1fr 1fr 0.8fr 0.9fr 20px;
  align-items: center;
  column-gap: var(--s-2);
  padding: 0 var(--s-3) 0 var(--s-4);
}

.sk-card__head {
  padding-top: var(--s-2);
  padding-bottom: var(--s-2);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-2);
  border-bottom: 1px solid var(--ink);
}

.sk-card__rows {
  list-style: none;
  padding: 0;
}

.sk-card__row {
  min-height: 46px;
}

.sk-card__row + .sk-card__row {
  border-top: 1px solid var(--rule);
}

.col-wide {
  display: none;
}

@media (max-width: 400px) {
  .sk-card__head,
  .sk-card__row {
    grid-template-columns: 46px 1fr 1fr 0.9fr 16px;
    padding-left: var(--s-3);
    padding-right: var(--s-2);
  }
  .col-break {
    display: none;
  }
}

@container skcard (min-width: 640px) {
  .sk-card__head,
  .sk-card__row {
    grid-template-columns: 60px 1fr 1fr 0.8fr 0.9fr 132px minmax(0, 1.6fr) 112px;
    padding-left: var(--s-5);
    padding-right: var(--s-4);
    column-gap: var(--s-3);
  }
  .sk-card__row {
    min-height: 50px;
  }
  .sk-card__head {
    font-size: 11px;
  }
  .col-wide {
    display: block;
  }
  .col-dot {
    display: none;
  }
}
</style>
