<script setup lang="ts">
import {
  datesOfMonth,
  ENTRY_STATUS_LABEL,
  formatDuration,
  weekdayOf,
  type Contract,
  type EntryStatus,
  type IsoDate,
  type WorkEntry,
  type YearMonth,
} from "@ponto/shared";
import { computed } from "vue";
import Stamp from "@/components/ui/Stamp.vue";
import {
  formatBreak,
  formatDayMonth,
  STATUS_STAMP,
  WEEKDAY_LETTER,
  WEEKDAY_LONG,
} from "@/lib/format.ts";
import Typewriter from "./Typewriter.vue";

const {
  month,
  entries,
  contract,
  today,
  fresh = null,
  readonly = false,
  confirmable = true,
} = defineProps<{
  month: YearMonth;
  entries: readonly WorkEntry[];
  contract: Pick<Contract, "scheduleDays" | "startedOn" | "endedOn">;
  today: IsoDate;
  /** Date whose times were just stamped; they type themselves in. */
  fresh?: IsoDate | null;
  readonly?: boolean;
  /** False while nobody has joined the contract: there is no other party to confirm. */
  confirmable?: boolean;
}>();

const emit = defineEmits<{ select: [date: IsoDate] }>();

type RowKind = "entry" | "missing" | "idle" | "outside";

interface Row {
  date: IsoDate;
  day: number;
  weekday: number;
  entry: WorkEntry | null;
  kind: RowKind;
  scheduled: boolean;
  weekend: boolean;
  isToday: boolean;
  future: boolean;
  label: string;
}

const rows = computed<Row[]>(() => {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const schedule = new Set(contract.scheduleDays);
  return datesOfMonth(month).map((date) => {
    const weekday = weekdayOf(date);
    const entry = byDate.get(date) ?? null;
    const inside =
      date >= contract.startedOn && (contract.endedOn === null || date <= contract.endedOn);
    const scheduled = schedule.has(weekday);
    const future = date > today;
    let kind: RowKind;
    if (entry) kind = "entry";
    else if (!inside) kind = "outside";
    else if (scheduled && !future) kind = "missing";
    else kind = "idle";
    return {
      date,
      day: Number(date.slice(8)),
      weekday,
      entry,
      kind,
      scheduled,
      weekend: weekday === 0 || weekday === 6,
      isToday: date === today,
      future,
      label: describe(date, weekday, entry, kind),
    };
  });
});

function stampText(status: EntryStatus): string {
  return status === "worked" ? "" : STATUS_STAMP[status];
}

function describe(date: IsoDate, weekday: number, entry: WorkEntry | null, kind: RowKind): string {
  const head = `${WEEKDAY_LONG[weekday]}, ${formatDayMonth(date)}`;
  if (kind === "outside") return `${head}: fora do período do vínculo`;
  if (!entry)
    return kind === "missing"
      ? `${head}: dia previsto sem registro. Registrar`
      : `${head}: sem registro`;
  const confirmed = !confirmable
    ? ""
    : entry.confirmedAt
      ? ", confirmado"
      : ", aguardando confirmação";
  if (entry.status !== "worked") return `${head}: ${ENTRY_STATUS_LABEL[entry.status]}${confirmed}`;
  const times = [
    entry.checkIn ? `entrada ${entry.checkIn}` : null,
    entry.checkOut ? `saída ${entry.checkOut}` : "sem saída",
    entry.breakMinutes ? `pausa ${formatDuration(entry.breakMinutes)}` : null,
    `total ${formatDuration(entry.minutes)}`,
  ].filter(Boolean);
  return `${head}: ${times.join(", ")}${confirmed}`;
}
</script>

<template>
  <section class="card" aria-label="Cartão de ponto do mês">
    <div class="card__perf" aria-hidden="true" />
    <div class="card__head" aria-hidden="true">
      <span>dia</span>
      <span>entrada</span>
      <span>saída</span>
      <span class="col-break">pausa</span>
      <span class="col-total">total</span>
      <span />
    </div>
    <ol class="card__rows">
      <li v-for="row in rows" :key="row.date">
        <button
          type="button"
          class="row"
          :class="[
            `row--${row.kind}`,
            {
              'is-today': row.isToday,
              'is-weekend': row.weekend && !row.scheduled,
              'is-future': row.future,
            },
          ]"
          :disabled="row.kind === 'outside' || readonly"
          :aria-label="row.label"
          :aria-current="row.isToday ? 'date' : undefined"
          @click="emit('select', row.date)"
        >
          <span class="row__day">
            <span class="row__wd">{{ WEEKDAY_LETTER[row.weekday] }}</span>
            <span class="row__num mono">{{ String(row.day).padStart(2, "0") }}</span>
          </span>

          <template v-if="row.entry && row.entry.status === 'worked'">
            <span class="row__t mono is-ink">
              <Typewriter v-if="fresh === row.date" :text="row.entry.checkIn ?? '--:--'" />
              <template v-else>{{ row.entry.checkIn ?? "--:--" }}</template>
            </span>
            <span class="row__t mono" :class="row.entry.checkOut ? 'is-ink' : 'is-open'">
              <Typewriter
                v-if="fresh === row.date && row.entry.checkOut"
                :text="row.entry.checkOut"
              />
              <template v-else>{{
                row.entry.checkOut ?? (row.isToday ? "em curso" : "--:--")
              }}</template>
            </span>
            <span class="row__t mono col-break is-ink">{{
              formatBreak(row.entry.breakMinutes)
            }}</span>
            <span class="row__t mono col-total row__total">{{
              row.entry.checkOut ? formatDuration(row.entry.minutes) : "—"
            }}</span>
          </template>

          <span v-else-if="row.entry" class="row__stamp">
            <Stamp
              :text="stampText(row.entry.status)"
              :label="ENTRY_STATUS_LABEL[row.entry.status]"
              :tone="
                row.entry.status === 'absent' || row.entry.status === 'excused' ? 'red' : 'ink'
              "
              :tilt="row.day % 2 ? -4 : -2.5"
              size="sm"
            />
            <span v-if="row.entry.note" class="row__note">{{ row.entry.note }}</span>
          </span>

          <span v-else-if="row.kind === 'missing'" class="row__missing">— registrar</span>
          <span v-else class="row__blank" />

          <span class="row__state" aria-hidden="true">
            <span
              v-if="row.entry && confirmable"
              class="dot"
              :class="row.entry.confirmedAt ? 'dot--ok' : 'dot--open'"
            />
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.card {
  position: relative;
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  padding-top: 14px;
  overflow: hidden;
}

/* perforated top edge: a row of half-circle cut-outs */
.card__perf {
  position: absolute;
  inset: 0 0 auto;
  height: 7px;
  background: radial-gradient(circle at 50% 0, var(--paper) 4px, transparent 4.5px) 0 0 / 16px 8px
    repeat-x;
  border-bottom: 1px dashed var(--rule);
}

.card__head,
.row {
  display: grid;
  grid-template-columns: 52px 1fr 1fr 0.8fr 0.9fr 20px;
  align-items: center;
  column-gap: var(--s-2);
  padding: 0 var(--s-3) 0 var(--s-4);
}

.card__head {
  padding-top: var(--s-2);
  padding-bottom: var(--s-2);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-2);
  border-bottom: 1px solid var(--ink);
}

.card__rows {
  list-style: none;
  padding: 0;
}

.card__rows li + li .row {
  border-top: 1px solid var(--rule);
}

.row {
  position: relative;
  width: 100%;
  min-height: 46px;
  text-align: left;
  color: var(--ink);
  transition: background-color var(--d-fast) var(--ease);
}

.row:not(:disabled):hover {
  background: color-mix(in srgb, var(--blue-wash) 55%, transparent);
}

.row:focus-visible {
  outline-offset: -2px;
}

.row:disabled {
  cursor: default;
}

.row.is-today::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--blue);
}

.row.is-weekend,
.row--outside {
  background: color-mix(in srgb, var(--paper) 55%, transparent);
}

.row--outside {
  opacity: 0.45;
  background-image: repeating-linear-gradient(
    -45deg,
    transparent 0 6px,
    color-mix(in srgb, var(--rule) 60%, transparent) 6px 7px
  );
}

.row__day {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.row__wd {
  width: 1ch;
  font-size: var(--t-12);
  font-weight: 600;
  color: var(--ink-2);
}

.row__num {
  font-size: var(--t-14);
  font-weight: 600;
}

.is-weekend .row__num,
.is-weekend .row__wd,
.row--idle.is-future .row__num {
  color: var(--ink-3);
}

.row__t {
  font-size: var(--t-14);
  font-stretch: 87.5%;
  white-space: nowrap;
}

.is-ink {
  color: var(--blue);
}

.is-open {
  color: var(--ink-2);
  font-size: var(--t-12);
}

.row__total {
  font-weight: 700;
  color: var(--ink);
}

.row__stamp {
  grid-column: 2 / span 4;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.row__note {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-12);
  color: var(--ink-2);
  font-style: italic;
}

.row__missing {
  grid-column: 2 / span 4;
  color: var(--blue);
  font-size: var(--t-14);
  border-bottom: 1px dotted currentColor;
  justify-self: start;
  line-height: 1.4;
}

.row__blank {
  grid-column: 2 / span 4;
}

.row__state {
  display: grid;
  place-items: center;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.dot--ok {
  background: var(--green);
}

.dot--open {
  border: 1.5px solid var(--ink-2);
}

@media (max-width: 400px) {
  .card__head,
  .row {
    grid-template-columns: 46px 1fr 1fr 0.9fr 16px;
    padding-left: var(--s-3);
    padding-right: var(--s-2);
  }
  .col-break {
    display: none;
  }
  .row__stamp,
  .row__missing,
  .row__blank {
    grid-column: 2 / span 3;
  }
}
</style>
