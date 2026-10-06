<script setup lang="ts">
import {
  formatDuration,
  shiftMinutes,
  type Contract,
  type IsoDate,
  type WorkEntry,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { entriesApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Stepper from "@/components/ui/Stepper.vue";
import TimeField from "@/components/ui/TimeField.vue";
import { formatDayMonth } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";

const open = defineModel<boolean>("open", { required: true });
const { contract, dates } = defineProps<{
  contract: Pick<Contract, "id" | "expectedStart" | "expectedEnd" | "workerName">;
  /** Expected past dates with no entry, oldest first. */
  dates: readonly IsoDate[];
}>();
const emit = defineEmits<{ saved: [entry: WorkEntry] }>();

const toast = useToastStore();

const checkIn = ref("08:00");
const checkOut = ref("17:00");
const breakMinutes = ref(60);
const running = ref(false);
const done = ref(0);
const failed = ref(0);
let cancelled = false;

watch(open, (isOpen) => {
  if (!isOpen && running.value) cancelled = true;
  if (!isOpen || running.value) return;
  checkIn.value = contract.expectedStart ?? "08:00";
  checkOut.value = contract.expectedEnd ?? "17:00";
  breakMinutes.value = 60;
  done.value = 0;
  failed.value = 0;
});

const perDay = computed(() =>
  checkIn.value && checkOut.value
    ? formatDuration(shiftMinutes(checkIn.value, checkOut.value, breakMinutes.value))
    : "—",
);
const span = computed(() => {
  if (dates.length === 0) return "";
  const first = formatDayMonth(dates[0]!);
  return dates.length === 1 ? first : `de ${first} a ${formatDayMonth(dates[dates.length - 1]!)}`;
});

/** Sequential on purpose: one PUT per day keeps the activity log readable and the API's rate limits happy. */
async function run(): Promise<void> {
  if (!checkIn.value) return;
  running.value = true;
  cancelled = false;
  done.value = 0;
  failed.value = 0;
  // Snapshot: `dates` shrinks as each saved entry reaches the card.
  const queue = dates.slice();
  for (const date of queue) {
    if (cancelled) break;
    try {
      const { entry } = await entriesApi.upsert(contract.id, date, {
        status: "worked",
        checkIn: checkIn.value,
        checkOut: checkOut.value || null,
        breakMinutes: breakMinutes.value,
        note: null,
      });
      emit("saved", entry);
    } catch {
      failed.value++;
    }
    done.value++;
  }
  running.value = false;
  const ok = done.value - failed.value;
  if (failed.value) toast.error(`${ok} dias marcados, ${failed.value} não foram salvos.`);
  else
    toast.success(
      ok === 1 ? "1 dia marcado como trabalhado." : `${ok} dias marcados como trabalhados.`,
    );
  open.value = false;
}

function stop(): void {
  cancelled = true;
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Marcar dias previstos"
    :subtitle="`${dates.length} ${dates.length === 1 ? 'dia' : 'dias'} sem registro ${span}`"
  >
    <div class="bf">
      <p>
        Anota como <strong>trabalhado</strong> cada dia previsto que ficou sem registro. Faltas e
        folgas você marca antes, tocando no dia.
      </p>
      <div class="bf__times">
        <Field v-slot="{ id }" label="Entrada">
          <TimeField :id="id" v-model="checkIn" label="Entrada" :step="15" :disabled="running" />
        </Field>
        <Field v-slot="{ id }" label="Saída">
          <TimeField :id="id" v-model="checkOut" label="Saída" :step="15" :disabled="running" />
        </Field>
      </div>
      <Field v-slot="{ id }" label="Pausa (minutos)">
        <Stepper :id="id" v-model="breakMinutes" label="Pausa" />
      </Field>
      <p class="bf__total">
        <span>{{ perDay }} por dia</span>
        <span class="mono">× {{ dates.length }}</span>
      </p>
      <div v-if="running" class="bf__progress" role="status">
        <div class="bf__bar"><span :style="{ width: `${(done / dates.length) * 100}%` }" /></div>
        <p class="mono">{{ done }} de {{ dates.length }}</p>
      </div>
    </div>
    <template #footer>
      <Button v-if="running" @click="stop">Parar</Button>
      <Button v-else @click="open = false">Cancelar</Button>
      <Button
        variant="primary"
        icon="check"
        :loading="running"
        :disabled="!checkIn || dates.length === 0"
        @click="run"
      >
        Marcar {{ dates.length }} {{ dates.length === 1 ? "dia" : "dias" }}
      </Button>
    </template>
  </Sheet>
</template>

<style scoped>
.bf {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.bf__times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.bf__total {
  display: flex;
  justify-content: space-between;
  padding: var(--s-3) 0;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.bf__total .mono {
  color: var(--ink);
}

.bf__progress {
  display: grid;
  gap: var(--s-2);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.bf__bar {
  height: 6px;
  background: var(--rule);
  border-radius: 3px;
  overflow: hidden;
}

.bf__bar span {
  display: block;
  height: 100%;
  background: var(--brand);
  transition: width var(--d-base) var(--ease);
}
</style>
