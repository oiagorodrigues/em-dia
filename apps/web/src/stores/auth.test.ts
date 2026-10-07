import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vite-plus/test";
import { queryKeys } from "@/api/keys.ts";
import { queryClient } from "@/api/query.ts";
import { useAuthStore } from "./auth.ts";

describe("auth store", () => {
  it("forgets cached server data when the session ends", () => {
    setActivePinia(createPinia());
    queryClient.setQueryData(queryKeys.contracts(), [{ id: "c1" }]);
    useAuthStore().clear();
    expect(queryClient.getQueryData(queryKeys.contracts())).toBeUndefined();
  });
});
