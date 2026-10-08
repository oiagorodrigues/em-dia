<script setup lang="ts">
import type { YearMonth } from "@emdia/shared";
import Skeleton from "@/components/ui/Skeleton.vue";
import SkeletonKpi from "@/components/ui/SkeletonKpi.vue";
import SkeletonLedger from "@/components/ui/SkeletonLedger.vue";
import SkeletonMonth from "@/components/ui/SkeletonMonth.vue";
import SkeletonTable from "@/components/ui/SkeletonTable.vue";
import SkeletonTimeCard from "@/components/ui/SkeletonTimeCard.vue";

/**
 * The body of a contract tab while the contract itself loads, in that tab's layout, so the
 * page keeps its shape when the real tab mounts. `tab` is the route name.
 */
const { tab, month } = defineProps<{ tab: string; month: YearMonth }>();

const TABLE_COLUMNS = [{}, {}, {}, { align: "right" as const }, {}];
</script>

<template>
  <div v-if="tab === 'contract-card'" class="sk-ct" aria-busy="true">
    <div class="sk-ct__main">
      <div class="sk-ct__head">
        <SkeletonMonth prefix />
        <Skeleton w="min(260px, 60%)" h="14px" class="sk-ct__sched" />
      </div>
      <div class="sk-ct__card"><SkeletonTimeCard :month="month" /></div>
    </div>
    <div class="sk-ct__aside">
      <div class="sk-ct__clock">
        <Skeleton w="168px" h="168px" round />
        <Skeleton w="70%" h="14px" />
      </div>
      <div class="sk-ct__totals sheet">
        <Skeleton w="50%" h="20px" />
        <SkeletonLedger />
        <Skeleton w="160px" h="44px" />
      </div>
    </div>
  </div>

  <div v-else-if="tab === 'contract-overview'" class="sk-ov" aria-busy="true">
    <SkeletonMonth prefix />
    <div class="kpi-grid"><SkeletonKpi v-for="i in 4" :key="i" /></div>
    <div class="page-grid">
      <div class="span-8 sk-ov__col">
        <div v-for="(n, i) in [2, 3, 2]" :key="i" class="sheet sk-ov__box">
          <Skeleton w="40%" h="20px" />
          <Skeleton v-for="r in n" :key="r" h="36px" />
        </div>
      </div>
      <div class="span-4 sk-ov__col">
        <div v-for="(n, i) in [6, 2]" :key="i" class="sheet sk-ov__box">
          <Skeleton w="45%" h="20px" />
          <Skeleton v-for="r in n" :key="r" :w="`${55 + ((r * 17) % 40)}%`" h="14px" />
        </div>
      </div>
    </div>
  </div>

  <div v-else class="sk-table" aria-busy="true">
    <div class="sk-table__toolbar">
      <Skeleton w="min(360px, 100%)" h="44px" />
      <Skeleton w="140px" h="44px" class="sk-table__action" />
    </div>
    <SkeletonTable :columns="TABLE_COLUMNS" :actions="1" />
  </div>
</template>

<style scoped>
.sk-ct {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

/* Below lg the two columns dissolve so the clock sits above the card, as in CardTab. */
.sk-ct__main,
.sk-ct__aside {
  display: contents;
}

.sk-ct__head {
  order: 1;
  display: grid;
  justify-items: center;
  gap: var(--s-3);
}

.sk-ct__clock {
  order: 2;
  display: grid;
  justify-items: center;
  gap: var(--s-3);
  padding: var(--s-4) 0;
}

.sk-ct__card {
  order: 3;
}

.sk-ct__totals {
  order: 4;
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
}

@media (min-width: 960px) {
  .sk-ct {
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
    gap: var(--s-6);
    align-items: start;
  }
  .sk-ct__main,
  .sk-ct__aside {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-5);
    align-content: start;
  }
  .sk-ct__head {
    grid-template-columns: auto 1fr;
    justify-items: stretch;
    align-items: center;
    gap: var(--s-5);
  }
  .sk-ct__head > :first-child {
    min-width: 320px;
  }
  .sk-ct__sched {
    justify-self: end;
  }
  .sk-ct__clock {
    padding: var(--s-5);
  }
}

.sk-ov {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.sk-ov__col {
  display: grid;
  gap: var(--s-5);
  align-content: start;
}

.sk-ov__box {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
}

.sk-table {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
}

.sk-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}

.sk-table__action {
  margin-left: auto;
}
</style>
