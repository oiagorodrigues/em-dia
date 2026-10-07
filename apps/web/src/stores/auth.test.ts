import { useQueryCache } from "@pinia/colada";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "vue";
import { queryKeys } from "@/api/keys.ts";
import { useAuthStore } from "./auth.ts";

describe("auth store", () => {
  it("forgets cached server data when the session ends", () => {
    const pinia = createPinia();
    // An app gives the cache store the injection context it reads its options from.
    createApp({}).use(pinia);
    setActivePinia(pinia);
    const cache = useQueryCache();
    cache.setQueryData(queryKeys.contracts(), [{ id: "c1" }]);
    useAuthStore().clear();
    expect(cache.getQueryData(queryKeys.contracts())).toBeUndefined();
  });
});
