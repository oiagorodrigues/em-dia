<script setup lang="ts">
import { MQ, useMediaQuery } from "@/lib/media.ts";
import type { Column } from "@/lib/table.ts";
import Skeleton from "./Skeleton.vue";

type SkeletonColumn = Partial<Pick<Column<unknown>, "label" | "align" | "srOnlyLabel">>;

/**
 * Loading rows in the shape of `DataTable`: the real header and 56px rows on md+, the
 * card list below md. Header labels are the real ones, so only the cells fill in.
 */
const {
  columns,
  rows = 5,
  actions = 0,
  cardLines = 3,
} = defineProps<{
  columns: readonly SkeletonColumn[];
  rows?: number;
  /** Inline action buttons at the end of each row (0 for none). */
  actions?: number;
  /** Text lines on each mobile card. */
  cardLines?: number;
}>();

const wide = useMediaQuery(MQ.md);

/** Varies bar widths a little so the rows read as text, not as a striped block. */
function barWidth(col: number, row: number): string {
  const widths = col === 0 ? [72, 60, 80, 66, 54] : [56, 44, 62, 50, 40];
  return `${widths[(row + col) % widths.length]}%`;
}
</script>

<template>
  <div class="sk-table" aria-busy="true">
    <div v-if="wide" class="sk-table__scroll">
      <table class="sk-table__table" aria-hidden="true">
        <thead>
          <tr>
            <th v-for="(col, c) in columns" :key="c" :class="`is-${col.align ?? 'left'}`">
              <span v-if="!col.srOnlyLabel">{{ col.label }}</span>
            </th>
            <th v-if="actions > 0" class="sk-table__actions-col" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r">
            <td v-for="(col, c) in columns" :key="c" :class="`is-${col.align ?? 'left'}`">
              <Skeleton :w="barWidth(c, r)" h="14px" />
            </td>
            <td v-if="actions > 0" class="sk-table__actions">
              <span class="sk-table__buttons">
                <Skeleton v-for="a in actions" :key="a" w="36px" h="36px" round />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul v-else class="sk-table__cards" aria-hidden="true">
      <li v-for="r in rows" :key="r" class="sk-table__card">
        <span class="sk-table__lines">
          <Skeleton :w="barWidth(0, r)" h="16px" />
          <Skeleton v-for="l in cardLines - 1" :key="l" :w="barWidth(l, r)" h="12px" />
        </span>
        <Skeleton v-if="actions > 0" w="36px" h="36px" round />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sk-table__scroll {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.sk-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-14);
}

.sk-table__table th {
  height: 44px;
  padding: 0 var(--s-4);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--t-12);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--rule);
}

.sk-table__table td {
  height: 56px;
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.sk-table__table tbody tr:last-child td {
  border-bottom: 0;
}

.sk-table__table .is-right {
  text-align: right;
}

.sk-table__table .is-right :deep(.skeleton) {
  margin-left: auto;
}

.sk-table__table .is-center :deep(.skeleton) {
  margin-inline: auto;
}

.sk-table__actions-col,
.sk-table__actions {
  width: 1%;
  padding-right: var(--s-2);
}

.sk-table__buttons {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-1);
}

.sk-table__cards {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.sk-table__card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.sk-table__lines {
  display: grid;
  gap: var(--s-2);
}
</style>
