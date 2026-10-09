<script setup lang="ts">
export interface LedgerLine {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "red" | "green" | "blue";
}

const { lines, total, caption } = defineProps<{
  lines: readonly LedgerLine[];
  total?: LedgerLine;
  caption?: string;
}>();
</script>

<template>
  <section class="ledger" :aria-label="caption ?? 'Totais'">
    <p v-if="caption" class="label ledger__cap">{{ caption }}</p>
    <dl class="ledger__list">
      <div
        v-for="line in lines"
        :key="line.label"
        class="ledger__line"
        :class="`ln-tone-${line.tone ?? 'neutral'}`"
      >
        <dt>
          <span class="ledger__label">{{ line.label }}</span>
          <span v-if="line.hint" class="ledger__hint">{{ line.hint }}</span>
        </dt>
        <span class="ledger__lead" aria-hidden="true" />
        <dd class="mono">{{ line.value }}</dd>
      </div>
      <div
        v-if="total"
        class="ledger__line ledger__total"
        :class="`ln-tone-${total.tone ?? 'neutral'}`"
      >
        <dt>{{ total.label }}</dt>
        <span class="ledger__lead" aria-hidden="true" />
        <dd class="mono">{{ total.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.ledger {
  min-width: 0;
}

.ledger__cap {
  margin-bottom: var(--s-3);
}

/* minmax(0, 1fr): an auto track would grow to the longest line's text and push the amounts
   past the card's edge; this keeps the list as wide as the card and lets the hints give way. */
.ledger__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-2);
}

.ledger__line {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  font-size: var(--t-14);
}

/* Only the hint gives way (ellipsis): the label and the amount always show whole. */
.ledger__line dt {
  display: flex;
  align-items: baseline;
  min-width: 0;
  color: var(--ink-2);
  white-space: nowrap;
}

.ledger__label {
  flex-shrink: 0;
}

.ledger__hint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: var(--s-1);
  color: var(--ink-3);
  font-size: var(--t-12);
}

.ledger__line dd {
  flex-shrink: 0;
}

.ledger__lead {
  flex: 1;
  min-width: var(--s-4);
  border-bottom: 2px dotted var(--rule);
  transform: translateY(-4px);
}

.ledger__line dd {
  font-size: var(--t-14);
  white-space: nowrap;
}

.ledger__total {
  margin-top: var(--s-2);
  padding-top: var(--s-3);
  border-top: 3px double var(--ink);
  font-size: var(--t-16);
}

.ledger__total dt {
  color: var(--ink);
  font-weight: 700;
}

.ledger__total dd {
  font-size: var(--t-20);
  font-weight: 700;
}

.ln-tone-red dd {
  color: var(--coral-ink);
}
.ln-tone-green dd {
  color: var(--brand);
}
.ln-tone-blue dd {
  color: var(--brand);
}
</style>
