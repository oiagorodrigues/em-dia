<script setup lang="ts">
import { OCCUPATION_LABEL, PAY_TYPE_LABEL, formatCents, type Contract } from "@emdia/shared";
import { computed, nextTick, onBeforeUnmount, reactive, useTemplateRef, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { contractsApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import Stamp from "@/components/ui/Stamp.vue";
import WorkerContact from "@/components/feature/WorkerContact.vue";
import { provideContract, useMonthQuery } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { formatDateShort } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";

const { id } = defineProps<{ id: string }>();

const auth = useAuthStore();
const route = useRoute();
const { month, currentMonth, setMonth } = useMonthQuery();

const { data, error, loading, reload, mutate } = useResource(
  () => id,
  (cid) => contractsApi.get(cid).then((r) => r.contract),
);

// Tabs only render once `data` is loaded, so children always see a contract.
const contract = computed(() => data.value as Contract);

provideContract({
  contract,
  month,
  currentMonth,
  setMonth,
  replaceContract: (next) => mutate(next),
});

const tabs = computed(() => {
  const base = [
    { name: "contract-card", label: "Cartão" },
    { name: "contract-payments", label: "Pagamentos" },
    { name: "contract-extras", label: "Extras" },
    { name: "contract-history", label: "Histórico" },
  ];
  if (auth.isEmployer) base.push({ name: "contract-settings", label: "Ajustes" });
  return base;
});

const counterpart = computed(() =>
  data.value
    ? auth.isEmployer
      ? data.value.workerName
      : `${data.value.employerName} · ${data.value.householdName}`
    : "",
);

const tabsEl = useTemplateRef<HTMLElement>("tabsEl");
const fade = reactive({ left: false, right: false });

function measureTabs(): void {
  const el = tabsEl.value;
  if (!el) return;
  fade.left = el.scrollLeft > 2;
  fade.right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}

/** Keeps the active tab visible on narrow screens without scrolling the page vertically. */
function revealActiveTab(): void {
  const el = tabsEl.value;
  const active = el?.querySelector<HTMLElement>(".is-active");
  if (!el || !active) return;
  const left = active.offsetLeft;
  const right = left + active.offsetWidth;
  if (left < el.scrollLeft) el.scrollLeft = left - 16;
  else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 16;
  measureTabs();
}

const resize = new ResizeObserver(measureTabs);
watch(
  [tabsEl, () => route.name],
  async ([el], [prevEl]) => {
    if (prevEl && prevEl !== el) resize.unobserve(prevEl);
    if (!el) return;
    resize.observe(el);
    await nextTick();
    revealActiveTab();
  },
  { immediate: true },
);
onBeforeUnmount(() => resize.disconnect());
</script>

<template>
  <div class="cv">
    <div v-if="loading && !data" class="cv__head" aria-busy="true">
      <Skeleton w="30%" h="14px" />
      <Skeleton w="60%" h="36px" gap="10px" />
      <Skeleton h="44px" gap="24px" />
      <Skeleton h="420px" gap="24px" />
    </div>

    <EmptyState
      v-else-if="error && !data"
      :tone="error.code === 'NOT_FOUND' ? 'neutral' : 'error'"
      :title="
        error.code === 'NOT_FOUND' ? 'Vínculo não encontrado.' : 'Não deu para abrir o vínculo.'
      "
    >
      {{
        error.code === "NOT_FOUND"
          ? "Ele pode ter sido removido, ou o link está errado."
          : error.message
      }}
      <template #actions>
        <Button to="/" icon="arrow-left">voltar ao início</Button>
        <Button v-if="error.code !== 'NOT_FOUND'" variant="ghost" @click="reload"
          >tentar de novo</Button
        >
      </template>
    </EmptyState>

    <template v-else-if="data">
      <header class="cv__head">
        <RouterLink to="/" class="cv__back"
          ><Icon name="arrow-left" :size="18" /> início</RouterLink
        >
        <div class="cv__title">
          <div>
            <p class="cv__meta">
              <span class="label"
                >{{ OCCUPATION_LABEL[data.occupation] }} ·
                {{ PAY_TYPE_LABEL[data.payType].toLowerCase() }}</span
              >
              <span class="mono cv__rate">{{ formatCents(data.rateCents) }}</span>
            </p>
            <h1 class="page-title">{{ counterpart }}</h1>
          </div>
          <Stamp
            v-if="data.status === 'ended'"
            text="encerrado"
            :label="`Vínculo encerrado em ${data.endedOn ? formatDateShort(data.endedOn) : ''}`"
            tone="ink"
            size="md"
          />
          <span v-else-if="auth.isEmployer && !data.workerId" class="cv__pending"
            >convite pendente</span
          >
        </div>
        <WorkerContact
          v-if="auth.isEmployer"
          :pix-key="data.workerPixKey"
          :phone="data.workerPhone"
        />
      </header>

      <div class="tabs-wrap">
        <nav
          ref="tabsEl"
          class="tabs"
          :class="{ 'fade-left': fade.left, 'fade-right': fade.right }"
          aria-label="Seções do vínculo"
          @scroll.passive="measureTabs"
        >
          <RouterLink
            v-for="tab in tabs"
            :key="tab.name"
            :to="{ name: tab.name, params: { id }, query: route.query }"
            class="tabs__item"
            :class="{ 'is-active': route.name === tab.name }"
            :aria-current="route.name === tab.name ? 'page' : undefined"
          >
            {{ tab.label }}
          </RouterLink>
        </nav>
      </div>

      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="id" />
      </RouterView>
    </template>
  </div>
</template>

<style scoped>
.cv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.cv__head {
  display: grid;
  gap: var(--s-2);
}

.cv__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  margin: calc(var(--s-3) * -1) 0 0 -4px;
  justify-self: start;
  color: var(--ink-2);
  text-decoration: none;
  font-size: var(--t-14);
  font-weight: 600;
}

.cv__back:hover {
  color: var(--ink);
}

.cv__title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-3);
}

.cv__title h1 {
  margin-top: var(--s-1);
}

.cv__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px var(--s-2);
}

.cv__rate {
  font-size: var(--t-12);
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink);
}

.cv__pending {
  font-size: var(--t-12);
  color: var(--blue);
  font-weight: 600;
  white-space: nowrap;
}

.tabs-wrap {
  margin: 0 calc(var(--gutter) * -1);
  border-bottom: 1px solid var(--ink);
}

.tabs {
  position: relative;
  display: flex;
  gap: var(--s-1);
  padding: 0 var(--gutter);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs.fade-right {
  mask-image: linear-gradient(to right, black calc(100% - 40px), transparent);
}

.tabs.fade-left {
  mask-image: linear-gradient(to left, black calc(100% - 40px), transparent);
}

.tabs.fade-left.fade-right {
  mask-image: linear-gradient(
    to right,
    transparent,
    black 40px,
    black calc(100% - 40px),
    transparent
  );
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--s-3);
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--t-14);
  white-space: nowrap;
}

.tabs__item:hover {
  color: var(--ink);
}

.tabs__item.is-active {
  color: var(--ink);
}

.tabs__item.is-active::after {
  content: "";
  position: absolute;
  left: var(--s-3);
  right: var(--s-3);
  bottom: 0;
  height: 3px;
  background: var(--blue);
}

.tabs__item:focus-visible {
  outline-offset: -2px;
}

@media (min-width: 960px) {
  .tabs-wrap {
    margin: 0;
  }
  .tabs {
    padding: 0;
  }
  .tabs__item:first-child {
    padding-left: 0;
  }
  .tabs__item:first-child.is-active::after {
    left: 0;
  }
}
</style>
