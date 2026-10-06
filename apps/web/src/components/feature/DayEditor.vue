<script setup lang="ts">
import {
  ENTRY_STATUS_LABEL,
  ENTRY_STATUSES,
  formatDuration,
  shiftMinutes,
  upsertEntrySchema,
  weekdayOf,
  type Contract,
  type EntryStatus,
  type IsoDate,
  type WorkEntry,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { entriesApi, errorMessage } from "@/api";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Stepper from "@/components/ui/Stepper.vue";
import { useForm } from "@/composables/form.ts";
import { formatDayMonth, formatRelative, WEEKDAY_LONG } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";

const open = defineModel<boolean>("open", { required: true });
const { date, entry, contract, today } = defineProps<{
  date: IsoDate | null;
  entry: WorkEntry | null;
  contract: Contract;
  today: IsoDate;
}>();
const emit = defineEmits<{ saved: [entry: WorkEntry]; removed: [date: IsoDate] }>();

const auth = useAuthStore();
const toast = useToastStore();

interface Values {
  status: EntryStatus;
  checkIn: string;
  checkOut: string;
  breakMinutes: number;
  note: string;
}

const { values, errors, formError, submitting, submit, clearError } = useForm(upsertEntrySchema, {
  status: "worked",
  checkIn: "",
  checkOut: "",
  breakMinutes: 0,
  note: "",
} as Values);

const isFuture = computed(() => !!date && date > today);
const statusOptions = computed(() =>
  ENTRY_STATUSES.filter(
    (s) => !isFuture.value || s === "day_off" || s === "holiday" || s === "excused",
  ).map((s) => ({
    value: s,
    label: ENTRY_STATUS_LABEL[s],
  })),
);

watch(
  () => [open.value, date, entry] as const,
  ([isOpen]) => {
    if (!isOpen || !date) return;
    const fallbackStatus: EntryStatus = isFuture.value ? "day_off" : "worked";
    values.status = entry?.status ?? fallbackStatus;
    values.checkIn = entry?.checkIn ?? (entry ? "" : (contract.expectedStart ?? ""));
    values.checkOut = entry?.checkOut ?? (entry ? "" : (contract.expectedEnd ?? ""));
    values.breakMinutes = entry?.breakMinutes ?? (entry ? 0 : 60);
    values.note = entry?.note ?? "";
    errors.value = {};
    formError.value = null;
  },
  { immediate: true },
);

const worked = computed(() => values.status === "worked");
const preview = computed(() =>
  worked.value && values.checkIn && values.checkOut
    ? formatDuration(shiftMinutes(values.checkIn, values.checkOut, values.breakMinutes))
    : null,
);
const overnight = computed(
  () => worked.value && values.checkIn && values.checkOut && values.checkOut < values.checkIn,
);

const mine = computed(() => !!entry && entry.createdBy === auth.user?.id);
const canConfirm = computed(
  () => !!entry && !!contract.workerId && !entry.confirmedAt && !mine.value,
);
const canDelete = computed(
  () => !!entry && (auth.isEmployer || (mine.value && !entry.confirmedAt)),
);
const ended = computed(() => !isWritable(contract));

const authorText = computed(() => {
  if (!entry) return null;
  const who = mine.value
    ? "você"
    : entry.createdByRole === "employer"
      ? contract.employerName
      : contract.workerName;
  return `anotado por ${who} · ${formatRelative(entry.updatedAt)}`;
});

const title = computed(() =>
  date ? `${WEEKDAY_LONG[weekdayOf(date)]}, ${formatDayMonth(date)}` : "",
);

function onSave(): void {
  if (!date) return;
  const input = {
    status: values.status,
    checkIn: worked.value ? values.checkIn || null : null,
    checkOut: worked.value ? values.checkOut || null : null,
    breakMinutes: worked.value ? values.breakMinutes : 0,
    note: values.note.trim() || null,
  };
  void submit(async (data) => {
    const res = await entriesApi.upsert(contract.id, date, data);
    emit("saved", res.entry);
    toast.success(
      entry?.confirmedAt ? "Dia atualizado. Precisa de nova confirmação." : "Dia anotado.",
    );
    open.value = false;
  }, input);
}

const confirming = ref(false);
async function onConfirm(): Promise<void> {
  if (!date) return;
  confirming.value = true;
  try {
    const res = await entriesApi.confirm(contract.id, date);
    emit("saved", res.entry);
    toast.success("Dia confirmado.");
    open.value = false;
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    confirming.value = false;
  }
}

const removing = ref(false);
const confirmRemove = ref(false);
watch(open, () => (confirmRemove.value = false));
async function onRemove(): Promise<void> {
  if (!date) return;
  if (!confirmRemove.value) {
    confirmRemove.value = true;
    return;
  }
  removing.value = true;
  try {
    await entriesApi.remove(contract.id, date);
    emit("removed", date);
    toast.success("Registro apagado.");
    open.value = false;
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <Sheet
    v-model:open="open"
    :title="title"
    :subtitle="authorText ?? (isFuture ? 'dia futuro' : 'sem registro')"
  >
    <form id="day-editor" class="de" novalidate @submit.prevent="onSave">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <p v-if="ended" class="form-error">
        {{
          contract.archivedAt
            ? "Este vínculo foi removido. Só dá para consultar."
            : "Este vínculo foi encerrado. Só dá para consultar."
        }}
      </p>

      <div v-if="entry && contract.workerId" class="de__state">
        <span class="de__dot" :class="entry.confirmedAt ? 'is-ok' : 'is-open'" aria-hidden="true" />
        <span v-if="entry.confirmedAt">confirmado {{ formatRelative(entry.confirmedAt) }}</span>
        <span v-else-if="mine">aguardando a outra parte confirmar</span>
        <span v-else>aguardando sua confirmação</span>
      </div>

      <fieldset class="de__set" :disabled="ended">
        <legend class="label">O que aconteceu</legend>
        <Segmented v-model="values.status" :options="statusOptions" label="O que aconteceu" wrap />
      </fieldset>

      <template v-if="worked">
        <div class="de__times">
          <Field v-slot="{ id, invalid, describedBy }" label="Entrada" :error="errors.checkIn">
            <input
              :id="id"
              v-model="values.checkIn"
              class="input"
              type="time"
              required
              :disabled="ended"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              @input="clearError('checkIn')"
            />
          </Field>
          <Field v-slot="{ id, invalid, describedBy }" label="Saída" :error="errors.checkOut">
            <input
              :id="id"
              v-model="values.checkOut"
              class="input"
              type="time"
              :disabled="ended"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              @input="clearError('checkOut')"
            />
          </Field>
        </div>
        <Field v-slot="{ id }" label="Pausa (almoço, descanso)">
          <Stepper :id="id" v-model="values.breakMinutes" label="Pausa" />
        </Field>
        <p v-if="preview" class="de__preview">
          total do dia <strong class="mono">{{ preview }}</strong>
          <span v-if="overnight" class="de__night">· passou da meia-noite</span>
        </p>
      </template>

      <Field v-slot="{ id, invalid, describedBy }" label="Observação" optional :error="errors.note">
        <textarea
          :id="id"
          v-model="values.note"
          class="input"
          rows="2"
          maxlength="500"
          :disabled="ended"
          placeholder="Ex.: saiu mais cedo para levar o filho ao médico"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
        />
      </Field>

      <div v-if="canDelete && !ended" class="de__danger">
        <Button variant="danger" icon="trash" :loading="removing" @click="onRemove">
          {{ confirmRemove ? "toque de novo para apagar" : "apagar registro" }}
        </Button>
      </div>
    </form>

    <template v-if="!ended" #footer>
      <Button v-if="canConfirm" icon="check" :loading="confirming" @click="onConfirm"
        >confirmar</Button
      >
      <Button type="submit" form="day-editor" variant="primary" :loading="submitting">
        {{ entry ? "salvar" : "anotar" }}
      </Button>
    </template>
  </Sheet>
</template>

<style scoped>
.de {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.de__state {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.de__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.de__dot.is-ok {
  background: var(--green);
}

.de__dot.is-open {
  border: 1.5px solid var(--ink-2);
}

.de__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.de__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.de__times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.de__preview {
  font-size: var(--t-14);
  color: var(--ink-2);
  padding: var(--s-3) 0;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
}

.de__preview strong {
  margin-left: var(--s-1);
  font-size: var(--t-20);
  color: var(--ink);
}

.de__night {
  color: var(--blue);
}

.de__danger {
  padding-top: var(--s-2);
}
</style>
