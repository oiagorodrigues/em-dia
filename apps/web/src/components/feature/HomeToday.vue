<script setup lang="ts">
import type { DashboardItem, IsoDate } from "@emdia/shared";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { entriesApi, errorMessage } from "@/api";
import Avatar from "@/components/ui/Avatar.vue";
import Button from "@/components/ui/Button.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { isWritable } from "@/lib/contract.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { formatDayMonth, WEEKDAY_LONG } from "@/lib/format.ts";
import { teamStatus, todayInfo } from "@/lib/team.ts";
import { useToastStore } from "@/stores/toast.ts";
import { weekdayOf } from "@emdia/shared";

const {
  items,
  today,
  loading = false,
} = defineProps<{ items: readonly DashboardItem[]; today: IsoDate; loading?: boolean }>();
const emit = defineEmits<{ reload: [] }>();

const toast = useToastStore();

/** Expected today, or already recorded something today (on-demand people show up when they come). */
const rows = computed(() =>
  items
    .filter((i) => {
      const s = teamStatus(i.contract);
      return (
        (s === "active" || s === "pending") && (todayInfo(i, today).expected || i.today !== null)
      );
    })
    .map((i) => ({
      item: i,
      info: todayInfo(i, today),
      clock: clockStateOf(i.today, isWritable(i.contract)),
    })),
);

const busy = ref<string | null>(null);
async function clock(item: DashboardItem, action: "in" | "out"): Promise<void> {
  busy.value = item.contract.id;
  try {
    const { entry } = await entriesApi.clock(item.contract.id, action);
    toast.success(
      action === "in"
        ? `Entrada de ${item.contract.workerName} às ${entry.checkIn}.`
        : `Saída de ${item.contract.workerName} às ${entry.checkOut}.`,
    );
    emit("reload");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <section class="ht sheet" aria-labelledby="ht-title">
    <header class="ht__head">
      <h2 id="ht-title" class="section-title">Hoje</h2>
      <p class="ht__date">{{ WEEKDAY_LONG[weekdayOf(today)] }}, {{ formatDayMonth(today) }}</p>
    </header>
    <ul v-if="loading" class="ht__list" aria-busy="true">
      <li v-for="i in 2" :key="i" class="ht__row">
        <Skeleton w="36px" h="36px" round />
        <span class="ht__who ht__skel">
          <Skeleton :w="i === 1 ? '55%' : '45%'" h="14px" />
          <Skeleton w="35%" h="12px" />
        </span>
        <Skeleton w="96px" h="44px" />
      </li>
    </ul>
    <p v-else-if="rows.length === 0" class="ht__empty">Ninguém previsto para hoje.</p>
    <ul v-else class="ht__list">
      <li v-for="{ item, info, clock: state } in rows" :key="item.contract.id" class="ht__row">
        <Avatar :name="item.contract.workerName" :size="36" />
        <span class="ht__who">
          <RouterLink :to="`/equipe/${item.contract.id}`" class="ht__name">{{
            item.contract.workerName
          }}</RouterLink>
          <span class="ht__state" :class="`is-${info.state}`">{{ info.text }}</span>
        </span>
        <Button
          v-if="state === 'in' || state === 'out'"
          :icon="state === 'in' ? 'clock-in' : 'clock-out'"
          :class="state === 'in' ? 'ht__btn--in' : 'ht__btn--out'"
          :loading="busy === item.contract.id"
          :aria-label="`${state === 'in' ? 'Bater entrada' : 'Bater saída'} de ${item.contract.workerName}`"
          @click="clock(item, state)"
          >{{ state === "in" ? "Entrada" : "Saída" }}</Button
        >
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ht {
  display: grid;
  align-content: start;
  gap: var(--s-3);
  padding: var(--s-5);
}

.ht__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.ht__date {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ht__empty {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.ht__list {
  list-style: none;
  padding: 0;
  display: grid;
}

.ht__row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) 0;
}

.ht__row + .ht__row {
  border-top: 1px solid var(--rule);
}

.ht__who {
  flex: 1;
  display: grid;
  min-width: 0;
}

.ht__skel {
  gap: 6px;
}

.ht__name {
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ht__name:hover {
  text-decoration: underline;
}

.ht__state {
  font-family: var(--font-mono);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ht__state.is-in {
  color: var(--brand);
}

.ht__state.is-absent {
  color: var(--coral-ink);
}

.ht__row :deep(.btn) {
  min-height: 40px;
  padding: 0 var(--s-3);
  font-size: var(--t-14);
}

/* Same meaning colors as the table's inline actions: entrada brand, saída amber. */
.ht__row :deep(.ht__btn--in) {
  color: var(--brand-ink);
  border-color: color-mix(in srgb, var(--brand) 40%, var(--rule));
}

.ht__row :deep(.ht__btn--in:hover:not(:disabled)) {
  background: var(--brand-wash);
}

.ht__row :deep(.ht__btn--out) {
  color: var(--amber-ink);
  border-color: color-mix(in srgb, var(--amber) 45%, var(--rule));
}

.ht__row :deep(.ht__btn--out:hover:not(:disabled)) {
  background: var(--amber-wash);
}
</style>
