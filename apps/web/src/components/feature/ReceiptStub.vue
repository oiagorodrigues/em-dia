<script setup lang="ts">
import {
  formatCents,
  formatYearMonth,
  PAYMENT_METHOD_LABEL,
  RECEIPT_MIME_TYPES,
  type Payment,
} from "@emdia/shared";
import { computed } from "vue";
import { sanitizeFilename } from "@/api/client.ts";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import Stamp from "@/components/ui/Stamp.vue";
import { formatDateShort } from "@/lib/format.ts";
import { receivedStatus } from "@/lib/payments.ts";
import ReceiptThumb from "./ReceiptThumb.vue";

const {
  payment,
  canAcknowledge = false,
  canManage = false,
  busy = false,
  agreement = null,
} = defineProps<{
  payment: Payment;
  canAcknowledge?: boolean;
  canManage?: boolean;
  busy?: boolean;
  /** Description of the agreement a compensation payment pays down. */
  agreement?: string | null;
}>();

const emit = defineEmits<{
  view: [];
  acknowledge: [];
  /** The employer closes the payment without waiting for the worker. */
  confirm: [];
  edit: [];
  remove: [];
  attach: [file: File];
}>();

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("attach", file);
}

const status = computed(() => receivedStatus(payment));

const fileName = computed(() =>
  payment.receipt ? sanitizeFilename(payment.receipt.originalName) : null,
);
</script>

<template>
  <article
    class="stub"
    :aria-label="`Pagamento de ${formatCents(payment.amountCents)} referente a ${formatYearMonth(payment.referenceMonth)}`"
  >
    <div class="stub__main">
      <p class="label">
        ref. {{ formatYearMonth(payment.referenceMonth) }}
        <span v-if="payment.isExtra" class="stub__extra">· extra</span>
      </p>
      <p class="stub__amount mono">{{ formatCents(payment.amountCents) }}</p>
      <p class="stub__meta">
        <span>{{ PAYMENT_METHOD_LABEL[payment.method] }}</span>
        <span aria-hidden="true">·</span>
        <span class="mono">Pago em {{ formatDateShort(payment.paidOn) }}</span>
      </p>
      <p v-if="agreement" class="stub__note">Acordo: {{ agreement }}</p>
      <p v-if="payment.note" class="stub__note">{{ payment.note }}</p>
    </div>

    <div class="stub__perf" aria-hidden="true" />

    <div class="stub__side">
      <button v-if="payment.receipt" type="button" class="stub__receipt" @click="emit('view')">
        <ReceiptThumb
          :contract-id="payment.contractId"
          :payment-id="payment.id"
          :receipt="payment.receipt"
        />
        <span class="stub__rlabel">
          <span>Ver comprovante</span>
          <span class="stub__fname">{{ fileName }}</span>
        </span>
      </button>
      <label v-else-if="canManage" class="stub__attach">
        <Icon name="upload" :size="18" />
        <span>Anexar comprovante</span>
        <input
          class="visually-hidden"
          type="file"
          :accept="RECEIPT_MIME_TYPES.join(',')"
          :disabled="busy"
          @change="onPick"
        />
      </label>
      <p v-else class="stub__noreceipt">Sem comprovante</p>

      <div class="stub__ack">
        <Stamp
          v-if="payment.acknowledgedAt"
          :text="`${status.label} ✓`"
          :label="
            payment.acknowledgedByRole === 'employer'
              ? 'Concluído por quem contratou'
              : 'Recebimento confirmado'
          "
          tone="green"
          size="sm"
          :tilt="-3"
        />
        <Button
          v-else-if="canAcknowledge"
          variant="primary"
          icon="check"
          :loading="busy"
          @click="emit('acknowledge')"
          >Recebi</Button
        >
        <Button v-else-if="canManage" icon="check" :loading="busy" @click="emit('confirm')"
          >Concluir</Button
        >
        <span v-else class="stub__wait">Aguardando “recebi”</span>
        <button
          v-if="canManage"
          type="button"
          class="stub__remove"
          :aria-label="`Editar pagamento de ${formatCents(payment.amountCents)}`"
          :disabled="busy"
          @click="emit('edit')"
        >
          <Icon name="pencil" :size="18" />
        </button>
        <button
          v-if="canManage"
          type="button"
          class="stub__remove"
          :aria-label="`Excluir pagamento de ${formatCents(payment.amountCents)}`"
          :disabled="busy"
          @click="emit('remove')"
        >
          <Icon name="trash" :size="18" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.stub {
  --notch: 9px;
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.stub__main {
  padding: var(--s-4) var(--s-5) var(--s-4);
  min-width: 0;
}

.stub__extra {
  color: var(--brand-ink);
}

.stub__amount {
  margin-top: var(--s-1);
  font-size: var(--t-28);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.stub__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-2);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.stub__meta .mono {
  font-size: var(--t-12);
  align-self: center;
}

.stub__note {
  margin-top: var(--s-2);
  font-size: var(--t-14);
  color: var(--ink);
  overflow-wrap: anywhere;
}

/* perforation: dashed line with half-circle notches biting into both edges */
.stub__perf {
  position: relative;
  height: 0;
  margin: 0 var(--s-4);
  border-top: 1.5px dashed var(--rule);
}

.stub__perf::before,
.stub__perf::after {
  content: "";
  position: absolute;
  top: calc(var(--notch) * -1 - 1px);
  width: calc(var(--notch) * 2);
  height: calc(var(--notch) * 2);
  border-radius: 50%;
  background: var(--bg);
  border: 1px solid var(--rule);
}

.stub__perf::before {
  left: calc(var(--s-4) * -1 - var(--notch) - 1px);
  clip-path: inset(0 0 0 50%);
}

.stub__perf::after {
  right: calc(var(--s-4) * -1 - var(--notch) - 1px);
  clip-path: inset(0 50% 0 0);
}

.stub__side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2) var(--s-3);
  padding: var(--s-3) var(--s-4) var(--s-3) var(--s-5);
  min-width: 0;
}

.stub__receipt {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
  min-height: 44px;
  text-align: left;
  border-radius: var(--r-1);
}

.stub__receipt:hover .stub__rlabel > span:first-child {
  text-decoration: underline;
}

.stub__rlabel {
  display: grid;
  min-width: 0;
  color: var(--brand);
  font-size: var(--t-14);
  font-weight: 600;
}

.stub__fname {
  color: var(--ink-2);
  font-weight: 400;
  font-size: var(--t-12);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 18ch;
}

.stub__attach {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  color: var(--brand);
  font-size: var(--t-14);
  font-weight: 600;
  cursor: pointer;
}

.stub__attach:hover span {
  text-decoration: underline;
}

.stub__attach:has(:focus-visible) {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: var(--r-1);
}

.stub__noreceipt {
  font-size: var(--t-14);
  color: var(--ink-2);
  font-style: italic;
}

.stub__ack {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: none;
  margin-left: auto;
}

.stub__wait {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.stub__remove {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--ink-2);
  border-radius: var(--r-1);
}

.stub__remove:hover:not(:disabled) {
  color: var(--coral-ink);
  background: var(--coral-wash);
}

@media (min-width: 600px) {
  .stub {
    grid-template-columns: 1fr auto 15rem;
  }
  .stub__perf {
    width: 0;
    height: auto;
    margin: var(--s-3) 0;
    border-top: 0;
    border-left: 1.5px dashed var(--rule);
  }
  .stub__perf::before,
  .stub__perf::after {
    left: calc(var(--notch) * -1 - 1px);
    right: auto;
  }
  .stub__perf::before {
    top: calc(var(--s-3) * -1 - var(--notch) - 1px);
    clip-path: inset(50% 0 0 0);
  }
  .stub__perf::after {
    top: auto;
    bottom: calc(var(--s-3) * -1 - var(--notch) - 1px);
    clip-path: inset(0 0 50% 0);
  }
  .stub__ack {
    margin-left: 0;
  }
  .stub__side {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: var(--s-4);
  }
}
</style>
