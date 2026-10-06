<script setup lang="ts">
import {
  describeSchedule,
  formatCents,
  formatDuration,
  OCCUPATION_LABEL,
  type DashboardItem,
} from "@emdia/shared";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import { todayStatusText } from "@/lib/entry.ts";

const { item } = defineProps<{ item: DashboardItem }>();

const missing = computed(() => item.summary.unrecordedDates.length);
const working = computed(
  () => item.today?.status === "worked" && !!item.today.checkIn && !item.today.checkOut,
);
const balance = computed(() => item.summary.balanceCents);
const showExpected = computed(
  () => item.contract.schedule.kind !== "on_demand" && item.summary.expectedDays > 0,
);
</script>

<template>
  <RouterLink :to="`/equipe/${item.contract.id}`" class="cs">
    <div class="cs__head">
      <div class="cs__who">
        <p class="cs__name">{{ item.contract.workerName }}</p>
        <p class="cs__occ">
          {{ OCCUPATION_LABEL[item.contract.occupation] }}
          <span v-if="!item.contract.workerId" class="cs__pending">· convite pendente</span>
        </p>
        <p class="cs__sched">{{ describeSchedule(item.contract.schedule) }}</p>
      </div>
      <p class="cs__today" :class="{ 'is-live': working }">
        <span class="cs__live" aria-hidden="true" />
        {{ todayStatusText(item.today) }}
      </p>
    </div>
    <dl class="cs__nums">
      <div>
        <dt class="label">horas</dt>
        <dd class="mono">{{ formatDuration(item.summary.totalMinutes) }}</dd>
      </div>
      <div>
        <dt class="label">
          {{ item.contract.schedule.kind === "per_month" ? "visitas" : "dias" }}
        </dt>
        <dd class="mono">
          {{ item.summary.daysWorked
          }}<span v-if="showExpected" class="cs__of">/{{ item.summary.expectedDays }}</span>
        </dd>
      </div>
      <div class="cs__bal">
        <dt class="label">{{ balance < 0 ? "pago a mais" : "a pagar" }}</dt>
        <dd class="mono">{{ formatCents(Math.abs(balance)) }}</dd>
      </div>
    </dl>
    <p v-if="missing > 0" class="cs__warn">
      <Icon name="alert" :size="16" />
      {{ missing === 1 ? "1 dia previsto sem registro" : `${missing} dias previstos sem registro` }}
    </p>
    <p v-else-if="item.contract.workerId && item.summary.pendingConfirmation > 0" class="cs__note">
      {{ item.summary.pendingConfirmation }}
      {{ item.summary.pendingConfirmation === 1 ? "dia aguarda" : "dias aguardam" }}
      confirmação
    </p>
    <Icon name="chevron-right" class="cs__chev" />
  </RouterLink>
</template>

<style scoped>
.cs {
  position: relative;
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5) var(--s-9) var(--s-5) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--ink);
  border-radius: var(--r-1) var(--r-2) var(--r-2) var(--r-1);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.cs:hover {
  border-color: var(--ink-3);
  border-left-color: var(--brand);
}

.cs:active {
  transform: translateY(1px);
}

.cs__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-2) var(--s-4);
}

.cs__name {
  font-weight: 700;
  font-size: var(--t-20);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.cs__occ {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.cs__sched {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.cs__pending {
  color: var(--brand);
}

.cs__today {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-12);
  font-family: var(--font-mono);
  color: var(--ink-2);
}

.cs__live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--ink-3);
}

.is-live {
  color: var(--ink);
}

.is-live .cs__live {
  border: 0;
  background: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-wash);
}

.cs__nums {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: var(--s-6);
  padding-top: var(--s-4);
  border-top: 1px dashed var(--rule);
}

.cs__nums dd {
  margin-top: 2px;
  font-size: var(--t-20);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.cs__of {
  color: var(--ink-3);
  font-size: var(--t-14);
}

.cs__bal {
  justify-self: end;
  text-align: right;
}

.cs__warn {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--coral-ink);
  font-size: var(--t-14);
  font-weight: 600;
}

.cs__note {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.cs__chev {
  position: absolute;
  right: var(--s-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-3);
}

@media (max-width: 400px) {
  .cs__nums {
    gap: var(--s-4);
  }
}
</style>
