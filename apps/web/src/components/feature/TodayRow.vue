<script setup lang="ts">
import {
  ENTRY_STATUS_LABEL,
  formatDuration,
  shiftMinutes,
  weekdayOf,
  type IsoDate,
  type WorkEntry,
} from "@emdia/shared";
import { computed } from "vue";
import Stamp from "@/components/ui/Stamp.vue";
import { useNow } from "@/composables/now.ts";
import { formatDayMonth, STATUS_STAMP, WEEKDAY_LONG } from "@/lib/format.ts";
import Typewriter from "./Typewriter.vue";

const {
  entry,
  date,
  fresh = false,
} = defineProps<{ entry: WorkEntry | null; date: IsoDate; fresh?: boolean }>();

const { zoned } = useNow();

/** While the shift is open, the total runs live against the household clock. */
const total = computed(() => {
  if (!entry || entry.status !== "worked" || !entry.checkIn) return null;
  if (entry.checkOut) return formatDuration(entry.minutes);
  return formatDuration(shiftMinutes(entry.checkIn, zoned.value.time, entry.breakMinutes));
});
</script>

<template>
  <section class="today" aria-label="Hoje">
    <p class="today__date">
      <span class="label">hoje</span>
      <span>{{ WEEKDAY_LONG[weekdayOf(date)] }}, {{ formatDayMonth(date) }}</span>
    </p>
    <div v-if="entry && entry.status !== 'worked'" class="today__stamp">
      <Stamp
        :text="STATUS_STAMP[entry.status]"
        :label="ENTRY_STATUS_LABEL[entry.status]"
        :tone="entry.status === 'absent' || entry.status === 'excused' ? 'red' : 'ink'"
        size="lg"
      />
    </div>
    <dl v-else class="today__cols">
      <div>
        <dt class="label">entrada</dt>
        <dd class="mono" :class="{ 'is-ink': entry?.checkIn }">
          <Typewriter v-if="fresh && entry?.checkIn && !entry.checkOut" :text="entry.checkIn" />
          <template v-else>{{ entry?.checkIn ?? "--:--" }}</template>
        </dd>
      </div>
      <div>
        <dt class="label">saída</dt>
        <dd class="mono" :class="{ 'is-ink': entry?.checkOut }">
          <Typewriter v-if="fresh && entry?.checkOut" :text="entry.checkOut" />
          <template v-else>{{ entry?.checkOut ?? "--:--" }}</template>
        </dd>
      </div>
      <div class="today__total">
        <dt class="label">{{ entry?.checkIn && !entry.checkOut ? "até agora" : "total" }}</dt>
        <dd class="mono">{{ total ?? "—" }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.today {
  position: relative;
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  overflow: hidden;
}

.today::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--blue);
}

.today__date {
  display: flex;
  gap: var(--s-2);
  align-items: baseline;
  font-size: var(--t-14);
  color: var(--ink-2);
  margin-bottom: var(--s-3);
}

.today__cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}

.today__cols dd {
  margin-top: 2px;
  font-size: var(--t-20);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ink-3);
}

.today__cols dd.is-ink {
  color: var(--blue);
}

.today__total {
  text-align: right;
}

.today__total dd {
  color: var(--ink);
}

.today__stamp {
  padding: var(--s-2) 0 var(--s-1);
}
</style>
