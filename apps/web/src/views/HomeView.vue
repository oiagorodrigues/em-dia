<script setup lang="ts">
import { useAuthStore } from "@/stores/auth.ts";
import EmployerHome from "./home/EmployerHome.vue";
import WorkerHome from "./home/WorkerHome.vue";

const auth = useAuthStore();
</script>

<template>
  <EmployerHome v-if="auth.isEmployer" />
  <WorkerHome v-else />
</template>
