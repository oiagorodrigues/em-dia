<script setup lang="ts">
import { describeSchedule, OCCUPATION_LABEL, type Contract } from "@emdia/shared";
import { computed, nextTick, onBeforeUnmount, reactive, useTemplateRef, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { contractsApi } from "@/api";
import ContactActions from "@/components/feature/ContactActions.vue";
import ContractTabSkeleton from "@/components/feature/ContractTabSkeleton.vue";
import Avatar from "@/components/ui/Avatar.vue";
import Button from "@/components/ui/Button.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import Menu from "@/components/ui/Menu.vue";
import type { MenuItem } from "@/components/ui/menu.ts";
import Skeleton from "@/components/ui/Skeleton.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import { provideContract, useMonthQuery } from "@/composables/contractContext.ts";
import { useContractRemoval } from "@/composables/contractRemoval.ts";
import { useResource } from "@/composables/resource.ts";
import { contactChannels, contractStatus, isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import { useBack } from "@/composables/back.ts";
import { useSlidingIndicator } from "@/lib/motion.ts";
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

const { confirmOpen, removing, restoring, askRemove, confirmRemove, restore } = useContractRemoval(
  data,
  (next) => mutate(next),
);

provideContract({
  contract,
  month,
  currentMonth,
  setMonth,
  replaceContract: (next) => mutate(next),
  askRemove,
  restore,
  restoring,
});

const tabs = computed(() => {
  const base = [
    { name: "contract-overview", label: "Visão geral" },
    { name: "contract-card", label: "Cartão" },
    { name: "contract-payments", label: "Pagamentos" },
    { name: "contract-extras", label: "Extras" },
    { name: "contract-agreements", label: "Acordos" },
    { name: "contract-history", label: "Histórico" },
  ];
  if (auth.isEmployer) base.push({ name: "contract-settings", label: "Ajustes" });
  return base;
});

const status = computed(() => (data.value ? contractStatus(data.value) : null));
const channels = computed(() => (data.value ? contactChannels(data.value) : null));
const writable = computed(() => !!data.value && isWritable(data.value));

const wide = useMediaQuery(MQ.md);

const title = computed(() =>
  data.value ? (auth.isEmployer ? data.value.workerName : data.value.employerName) : "",
);

const menuItems = computed<MenuItem[]>(() => {
  if (!data.value) return [];
  if (data.value.archivedAt)
    return [{ label: "Restaurar", icon: "undo", onSelect: () => void restore() }];
  return [{ label: "Remover da equipe", icon: "archive", danger: true, onSelect: askRemove }];
});

const backNav = useBack(auth.isEmployer ? "/equipe" : "/");
const tabsEl = useTemplateRef<HTMLElement>("tabsEl");
const tabIndicator = useSlidingIndicator(tabsEl, ".is-active", "x", () => route.name);
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
      <div class="pf">
        <span class="cv__back"><Skeleton w="64px" h="14px" /></span>
        <div class="pf__row">
          <Skeleton :w="wide ? '64px' : '48px'" :h="wide ? '64px' : '48px'" round />
          <div class="pf__id cv__skelid">
            <Skeleton w="min(320px, 70%)" h="clamp(1.75rem, 3vw, 2.5rem)" />
            <Skeleton w="min(240px, 50%)" h="14px" />
          </div>
          <div v-if="auth.isEmployer" class="pf__actions">
            <Skeleton w="176px" h="44px" />
            <Skeleton w="96px" h="44px" class="pf__edit" />
            <Skeleton w="44px" h="44px" />
          </div>
        </div>
      </div>
      <div class="tabs-wrap" aria-hidden="true">
        <div class="tabs">
          <span
            v-for="tab in tabs"
            :key="tab.name"
            class="tabs__item"
            :class="{ 'is-active': route.name === tab.name }"
            >{{ tab.label }}</span
          >
        </div>
      </div>
      <ContractTabSkeleton :tab="String(route.name ?? '')" :month="month" />
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
        <Button to="/" icon="arrow-left">Voltar ao início</Button>
        <Button v-if="error.code !== 'NOT_FOUND'" variant="ghost" @click="reload"
          >Tentar de novo</Button
        >
      </template>
    </EmptyState>

    <template v-else-if="data">
      <header class="pf">
        <RouterLink :to="backNav.to.value" class="cv__back" @click.prevent="backNav.go"
          ><Icon name="arrow-left" :size="18" /> voltar</RouterLink
        >
        <div class="pf__row">
          <Avatar :name="title" :size="wide ? 64 : 48" />
          <div class="pf__id">
            <div class="pf__name">
              <h1 class="page-title">{{ title }}</h1>
              <StatusChip v-if="status" :tone="status.tone">
                {{ status.label
                }}<template v-if="status.state === 'ended' && data.endedOn">
                  em <span class="mono">{{ formatDateShort(data.endedOn) }}</span></template
                >
              </StatusChip>
            </div>
            <p class="pf__sub">
              <span v-if="auth.isWorker">{{ data.householdName }} · </span
              >{{ OCCUPATION_LABEL[data.occupation] }} · {{ describeSchedule(data.schedule) }}
            </p>
          </div>
          <div v-if="auth.isEmployer" class="pf__actions">
            <ContactActions v-if="channels" :channels="channels" />
            <Button
              v-if="writable"
              :to="{ path: '/pagamentos/novo', query: { vinculo: data.id, mes: month } }"
              variant="primary"
              icon="plus"
              >Registrar pagamento</Button
            >
            <Button
              v-if="writable"
              :to="{ name: 'contract-settings', params: { id }, query: route.query }"
              icon="pencil"
              class="pf__edit"
              >Editar</Button
            >
            <Menu :items="menuItems" label="Mais ações" />
          </div>
        </div>
      </header>

      <div v-if="data.archivedAt" class="cv__archived" role="status">
        <Icon name="archive" :size="18" />
        <p>
          {{
            auth.isEmployer
              ? "Removido da equipe. Dá para consultar tudo, mas nada pode ser anotado até restaurar."
              : "Este vínculo foi removido por quem contrata. Seu histórico continua aqui."
          }}
        </p>
        <Button v-if="auth.isEmployer" icon="undo" :loading="restoring" @click="restore"
          >Restaurar</Button
        >
      </div>

      <div class="tabs-wrap">
        <nav
          ref="tabsEl"
          class="tabs"
          :class="{ 'fade-left': fade.left, 'fade-right': fade.right }"
          aria-label="Seções do vínculo"
          @scroll.passive="measureTabs"
        >
          <span class="tabs__indicator" aria-hidden="true" :style="tabIndicator" />
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

      <RouterView v-slot="{ Component, route: tabRoute }">
        <Transition name="tab-fade" mode="out-in">
          <component :is="Component" :key="`${id}:${String(tabRoute.name)}`" />
        </Transition>
      </RouterView>

      <ConfirmDialog
        v-model:open="confirmOpen"
        :title="`Remover ${data.workerName} da equipe?`"
        message="O histórico fica guardado e você pode restaurar em Equipe → removidos."
        confirm-label="Remover"
        :loading="removing"
        @confirm="confirmRemove"
      />
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
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.cv__skelid {
  display: grid;
  gap: var(--s-2);
}

.cv__head .tabs__item.is-active {
  box-shadow: inset 0 -3px 0 var(--brand);
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

.pf {
  display: grid;
  gap: var(--s-2);
}

.pf__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3) var(--s-4);
}

.pf__id {
  flex: 1 1 16rem;
  min-width: 0;
}

.pf__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-1) var(--s-3);
}

.pf__name h1 {
  font-size: clamp(var(--t-28), 3vw, var(--t-40));
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.pf__sub {
  margin-top: var(--s-1);
  color: var(--ink-2);
}

.pf__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

@media (max-width: 639px) {
  .pf__actions {
    flex-basis: 100%;
  }
  /* The Ajustes tab is one tap away; the row keeps contact, payment and the menu. */
  .pf__edit {
    display: none;
  }
}

.cv__archived {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
  border-radius: var(--r-2);
  background: var(--coral-wash);
  color: var(--coral-ink);
  font-size: var(--t-14);
}

.cv__archived p {
  flex: 1 1 18rem;
  color: var(--ink);
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

/* One underline that slides to the active tab. */
.tabs__indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--brand);
  pointer-events: none;
  transition:
    transform var(--d-sheet) var(--ease-out),
    width var(--d-sheet) var(--ease-out);
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
}
</style>
