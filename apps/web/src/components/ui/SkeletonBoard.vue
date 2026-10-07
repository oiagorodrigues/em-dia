<script setup lang="ts">
import { daysInMonth, parseYearMonth, type YearMonth } from "@emdia/shared";
import { computed } from "vue";
import Skeleton from "./Skeleton.vue";

/**
 * The month board while it loads. `wide`: one row per person and a column per day, like
 * `BoardGrid`. Otherwise the phone cards of `BoardWeekList` with a 7-day strip.
 */
const {
  month,
  rows = 4,
  wide = true,
} = defineProps<{ month: YearMonth; rows?: number; wide?: boolean }>();

const days = computed(() => {
  const { year, month: m } = parseYearMonth(month);
  return daysInMonth(year, m);
});
</script>

<template>
  <div v-if="wide" class="sk-board" aria-busy="true" aria-label="Carregando quadro">
    <table class="sk-board__table" aria-hidden="true">
      <thead>
        <tr>
          <th class="sk-board__name"><Skeleton w="64px" h="12px" /></th>
          <th v-for="d in days" :key="d" class="sk-board__day">
            <Skeleton w="8px" h="8px" />
            <Skeleton w="14px" h="10px" />
          </th>
          <th class="sk-board__total"><Skeleton w="36px" h="12px" /></th>
          <th class="sk-board__total"><Skeleton w="30px" h="12px" /></th>
          <th class="sk-board__total sk-board__due"><Skeleton w="52px" h="12px" /></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r">
          <th class="sk-board__name">
            <span class="sk-board__who">
              <Skeleton w="32px" h="32px" round />
              <span class="sk-board__lines">
                <Skeleton :w="`${60 + ((r * 13) % 30)}%`" h="14px" />
                <Skeleton w="50%" h="10px" />
              </span>
            </span>
          </th>
          <td v-for="d in days" :key="d" class="sk-board__cell">
            <span class="sk-board__square" />
          </td>
          <td class="sk-board__total"><Skeleton w="40px" h="12px" /></td>
          <td class="sk-board__total"><Skeleton w="28px" h="12px" /></td>
          <td class="sk-board__total sk-board__due"><Skeleton w="64px" h="12px" /></td>
        </tr>
      </tbody>
    </table>
  </div>
  <ul v-else class="sk-week" aria-busy="true" aria-label="Carregando quadro">
    <li v-for="r in rows" :key="r" class="sk-week__card" aria-hidden="true">
      <span class="sk-week__head">
        <Skeleton w="40px" h="40px" round />
        <span class="sk-board__lines">
          <Skeleton :w="`${50 + ((r * 13) % 30)}%`" h="16px" />
          <Skeleton w="35%" h="12px" />
        </span>
      </span>
      <span class="sk-week__strip">
        <span v-for="d in 7" :key="d" class="sk-week__day">
          <Skeleton w="8px" h="10px" />
          <span class="sk-board__square" />
          <Skeleton w="14px" h="10px" />
        </span>
      </span>
      <span class="sk-week__totals">
        <span v-for="t in 3" :key="t" class="sk-board__lines">
          <Skeleton w="48%" h="10px" />
          <Skeleton w="70%" h="14px" />
        </span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.sk-board {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.sk-board__table {
  width: 100%;
  min-width: 960px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.sk-board__table th,
.sk-board__table td {
  border-bottom: 1px solid var(--rule);
}

.sk-board__table tbody tr:last-child > * {
  border-bottom: 0;
}

.sk-board__table thead th {
  height: 52px;
  background: var(--surface-2);
}

.sk-board__name {
  width: 192px;
  padding: 0 var(--s-4);
  text-align: left;
  border-right: 1px solid var(--rule);
}

.sk-board__day {
  padding: 0;
}

.sk-board__day :deep(.skeleton) {
  margin: 2px auto;
}

.sk-board__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) 0;
}

.sk-board__lines {
  flex: 1;
  display: grid;
  gap: 6px;
  min-width: 0;
}

.sk-board__cell {
  padding: 10px 2px;
}

.sk-board__square {
  display: block;
  width: 100%;
  max-width: 26px;
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 4px;
  background: var(--surface-2);
}

.sk-board__total {
  width: 76px;
  padding: 0 var(--s-3);
}

.sk-board__total :deep(.skeleton) {
  margin-left: auto;
}

.sk-board__due {
  width: 116px;
}

.sk-week {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-3);
}

.sk-week__card {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.sk-week__head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.sk-week__strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.sk-week__day {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 4px 0;
}

.sk-week__day .sk-board__square {
  max-width: 30px;
}

.sk-week__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px dashed var(--rule);
}

.sk-week__totals > :last-child {
  justify-items: end;
}

@media (min-width: 1600px) {
  .sk-board__name {
    width: 240px;
  }
  .sk-board__total {
    width: 92px;
  }
  .sk-board__due {
    width: 116px;
  }
}
</style>
