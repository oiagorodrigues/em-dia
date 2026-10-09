<script setup lang="ts">
import type { YearMonth } from "@emdia/shared";
import { ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import Menu from "@/components/ui/Menu.vue";
import type { MenuItem } from "@/components/ui/menu.ts";
import { useToastStore } from "@/stores/toast.ts";

const { contractId, month } = defineProps<{ contractId: string; month: YearMonth }>();

const toast = useToastStore();
const downloading = ref(false);

async function download(format: "pdf" | "csv"): Promise<void> {
  downloading.value = true;
  try {
    const { blob, filename } = await (
      format === "pdf" ? contractsApi.statementPdf : contractsApi.statementCsv
    )(contractId, month);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `extrato-${month}.${format}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    downloading.value = false;
  }
}

const items: MenuItem[] = [
  { label: "PDF", icon: "file", onSelect: () => void download("pdf") },
  { label: "Planilha (CSV)", icon: "file", onSelect: () => void download("csv") },
];
</script>

<template>
  <Menu
    :items="items"
    text="Baixar"
    label="Baixar extrato do mês"
    icon="download"
    align="start"
    :loading="downloading"
  />
</template>
