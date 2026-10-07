<script setup lang="ts">
import type { BoardCellKind } from "@/lib/board.ts";
import BoardCell from "./BoardCell.vue";

const ITEMS: { kind: BoardCellKind; text: string }[] = [
  { kind: "worked", text: "Trabalhou" },
  { kind: "absent", text: "Falta" },
  { kind: "soft", text: "Justificada, folga ou feriado" },
  { kind: "missing", text: "Previsto sem registro" },
  { kind: "planned", text: "Previsto" },
];
</script>

<template>
  <ul class="bl" aria-label="Legenda">
    <li v-for="i in ITEMS" :key="i.kind">
      <BoardCell :kind="i.kind" label="" aria-hidden="true" />
      <span>{{ i.text }}</span>
    </li>
  </ul>
</template>

<style scoped>
.bl {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.bl li {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.bl :deep(.bcell) {
  width: 14px;
  border-radius: 4px;
}
</style>
