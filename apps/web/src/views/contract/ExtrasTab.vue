<script setup lang="ts">
import {
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_KINDS,
  ADJUSTMENT_SIGN,
  createAdjustmentSchema,
  formatCents,
  shiftMonth,
  toYearMonth,
  type Adjustment,
  type AdjustmentKind,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { adjustmentsApi, errorMessage } from "@/api";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import Icon from "@/components/ui/Icon.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { formatRelative } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth, setMonth } = useContract();

const monthModel = computed({ get: () => month.value, set: setMonth });
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 1),
);

const list = useResource(
  () => `${contract.value.id}|${month.value}`,
  () => adjustmentsApi.list(contract.value.id, month.value).then((r) => r.adjustments),
);

const net = computed(
  () => list.data.value?.reduce((s, a) => s + ADJUSTMENT_SIGN[a.kind] * a.amountCents, 0) ?? 0,
);
const canWrite = computed(() => auth.isEmployer && contract.value.status === "active");

const kindOptions = ADJUSTMENT_KINDS.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k] }));
const { values, errors, formError, submitting, submit, clearError } = useForm(
  createAdjustmentSchema,
  {
    kind: "bonus" as AdjustmentKind,
    amountCents: null as number | null,
    description: "",
  },
);

function onAdd(): void {
  const input = {
    month: month.value,
    kind: values.kind,
    amountCents: values.amountCents ?? 0,
    description: values.description.trim() || null,
  };
  void submit(async (data) => {
    const { adjustment } = await adjustmentsApi.create(contract.value.id, data);
    list.mutate((l = []) => [...l, adjustment]);
    values.amountCents = null;
    values.description = "";
    toast.success(`${ADJUSTMENT_KIND_LABEL[adjustment.kind]} lançado.`);
  }, input);
}

const removing = ref<string | null>(null);
async function remove(a: Adjustment): Promise<void> {
  removing.value = a.id;
  try {
    await adjustmentsApi.remove(contract.value.id, a.id);
    list.mutate((l = []) => l.filter((x) => x.id !== a.id));
    toast.success("Lançamento removido.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removing.value = null;
  }
}
</script>

<template>
  <div class="ex">
    <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="extras de" />

    <div v-if="list.loading.value && !list.data.value" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" h="52px" :gap="i === 1 ? '0' : '8px'" />
    </div>
    <EmptyState v-else-if="list.error.value" tone="error" title="Não deu para carregar os extras.">
      {{ list.error.value.message }}
      <template #actions><Button @click="list.reload">tentar de novo</Button></template>
    </EmptyState>
    <EmptyState v-else-if="list.data.value?.length === 0" title="Nada lançado neste mês.">
      Extras, vale-transporte, adiantamentos e descontos entram aqui e mudam o valor do mês.
    </EmptyState>
    <section v-else-if="list.data.value" class="ex__list" aria-label="Lançamentos do mês">
      <ul>
        <li v-for="a in list.data.value" :key="a.id" class="ex__item">
          <div class="ex__what">
            <p class="ex__kind">{{ ADJUSTMENT_KIND_LABEL[a.kind] }}</p>
            <p v-if="a.description" class="ex__desc">{{ a.description }}</p>
            <p class="ex__when">{{ formatRelative(a.createdAt) }}</p>
          </div>
          <p class="ex__amt mono" :class="ADJUSTMENT_SIGN[a.kind] < 0 ? 'is-minus' : 'is-plus'">
            {{ ADJUSTMENT_SIGN[a.kind] < 0 ? "−" : "+" }} {{ formatCents(a.amountCents) }}
          </p>
          <button
            v-if="canWrite"
            type="button"
            class="ex__rm"
            :disabled="removing === a.id"
            :aria-label="`Remover ${ADJUSTMENT_KIND_LABEL[a.kind]} de ${formatCents(a.amountCents)}`"
            @click="remove(a)"
          >
            <Icon name="trash" :size="18" />
          </button>
        </li>
      </ul>
      <p class="ex__net">
        <span>saldo dos lançamentos</span>
        <span class="mono" :class="{ 'is-minus': net < 0 }"
          >{{ net < 0 ? "−" : "+" }} {{ formatCents(Math.abs(net)) }}</span
        >
      </p>
    </section>

    <form v-if="canWrite" class="ex__form" novalidate @submit.prevent="onAdd">
      <h2 class="section-title">lançar</h2>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <fieldset class="ex__set">
        <legend class="label">Tipo</legend>
        <Segmented v-model="values.kind" :options="kindOptions" label="Tipo" wrap />
      </fieldset>
      <div class="ex__two">
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Valor"
          :error="errors.amountCents ? 'Informe o valor' : null"
        >
          <MoneyInput
            :id="id"
            v-model="values.amountCents"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('amountCents')"
          />
        </Field>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Descrição"
          optional
          :error="errors.description"
        >
          <input
            :id="id"
            v-model="values.description"
            class="input"
            type="text"
            maxlength="500"
            placeholder="Ex.: passou roupa extra"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" icon="plus" :loading="submitting"
        >lançar em {{ month.slice(5) }}/{{ month.slice(0, 4) }}</Button
      >
    </form>
    <p v-else-if="auth.isWorker" class="ex__ro">
      Só quem contrata lança extras e descontos. Você vê tudo aqui.
    </p>
  </div>
</template>

<style scoped>
.ex {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.ex__list ul {
  list-style: none;
  padding: 0;
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.ex__item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-2) var(--s-3) var(--s-4);
}

.ex__item + .ex__item {
  border-top: 1px solid var(--rule);
}

.ex__what {
  flex: 1;
  min-width: 0;
}

.ex__kind {
  font-weight: 600;
}

.ex__desc {
  font-size: var(--t-14);
  color: var(--blue);
  overflow-wrap: anywhere;
}

.ex__when {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ex__amt {
  white-space: nowrap;
  font-size: var(--t-14);
  font-weight: 600;
}

.is-minus {
  color: var(--red-text);
}

.ex__rm {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--ink-2);
  border-radius: var(--r-1);
}

.ex__rm:hover:not(:disabled) {
  color: var(--red-text);
  background: var(--red-wash);
}

.ex__net {
  display: flex;
  justify-content: space-between;
  margin-top: var(--s-3);
  padding: var(--s-3) var(--s-4) 0;
  border-top: 3px double var(--ink);
  font-weight: 600;
}

.ex__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
  padding-top: var(--s-5);
  border-top: 1px dashed var(--rule);
}

.ex__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.ex__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.ex__two {
  display: grid;
  gap: var(--s-4);
}

.ex__form > :deep(.btn) {
  justify-self: start;
}

.ex__ro {
  font-size: var(--t-14);
  color: var(--ink-2);
}

@media (min-width: 600px) {
  .ex__two {
    grid-template-columns: 220px 1fr;
  }
}
</style>
