import { VueQueryPlugin, type QueryClient, type QueryKey } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, nextTick, ref } from "vue";
import { ApiError } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import { createQueryClient } from "@/api/query.ts";
import { useInvalidate, useResource } from "./resource.ts";

function testClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return client;
}

function host<R>(client: QueryClient, use: () => R): R {
  let out!: R;
  mount(
    defineComponent(() => {
      out = use();
      return () => null;
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return out;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const entriesKey = (month: string) => queryKeys.entries({ id: "c1", month });

describe("useResource", () => {
  it("loads, then serves a second reader of the same key from the cache", async () => {
    const client = testClient();
    const fetcher = vi.fn(async (m: string) => [`dia de ${m}`]);
    const first = host(client, () => useResource(() => "2026-10", entriesKey, fetcher));
    expect(first.loading.value).toBe(true);
    expect(first.data.value).toBeUndefined();
    await flushPromises();
    expect(first.loading.value).toBe(false);
    expect(first.data.value).toEqual(["dia de 2026-10"]);

    const second = host(client, () => useResource(() => "2026-10", entriesKey, fetcher));
    expect(second.loading.value).toBe(false);
    expect(second.data.value).toEqual(["dia de 2026-10"]);
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops a late answer for a month the screen already left", async () => {
    const client = testClient();
    const calls: Record<string, ReturnType<typeof deferred<string>>> = {};
    const month = ref("2026-09");
    const res = host(client, () =>
      useResource(month, entriesKey, (m) => {
        calls[m] = deferred<string>();
        return calls[m].promise;
      }),
    );
    await nextTick();
    month.value = "2026-10";
    await nextTick();
    calls["2026-10"]!.resolve("outubro");
    await flushPromises();
    calls["2026-09"]!.resolve("setembro");
    await flushPromises();
    expect(res.data.value).toBe("outubro");
    expect(client.getQueryData(entriesKey("2026-09"))).toBe("setembro");
  });

  it("does not fetch while the key is null", async () => {
    const client = testClient();
    const id = ref("");
    const fetcher = vi.fn(async (v: string) => v);
    const res = host(client, () =>
      useResource(id, (v) => (v ? queryKeys.agreements(v) : null), fetcher),
    );
    await flushPromises();
    expect(fetcher).not.toHaveBeenCalled();
    expect(res.loading.value).toBe(false);
    expect(res.data.value).toBeUndefined();
    id.value = "c1";
    await flushPromises();
    expect(fetcher).toHaveBeenCalledWith("c1");
    expect(res.data.value).toBe("c1");
  });

  it("mutate writes the shared cache entry", async () => {
    const client = testClient();
    const a = host(client, () =>
      useResource(
        () => "c1",
        queryKeys.agreements,
        async () => [1],
      ),
    );
    const b = host(client, () =>
      useResource(
        () => "c1",
        queryKeys.agreements,
        async () => [1],
      ),
    );
    await flushPromises();
    a.mutate((list = []) => [...list, 2]);
    await nextTick();
    expect(b.data.value).toEqual([1, 2]);
  });

  it("exposes failures as ApiError and keeps cached data on a failed refresh", async () => {
    const client = testClient();
    let fail: Error | null = null;
    const res = host(client, () =>
      useResource(
        () => "c1",
        queryKeys.contract,
        async () => {
          if (fail) throw fail;
          return "vínculo";
        },
      ),
    );
    await flushPromises();
    fail = new ApiError(500, "INTERNAL", "falhou");
    await res.reload();
    expect(res.data.value).toBe("vínculo");
    expect(res.error.value?.status).toBe(500);
    expect(res.loading.value).toBe(false);

    fail = new TypeError("boom");
    await res.reload();
    expect(res.error.value).toBeInstanceOf(ApiError);
    expect(res.error.value?.code).toBe("INTERNAL");
  });
});

describe("useInvalidate", () => {
  function counted(client: QueryClient, key: QueryKey) {
    const fetcher = vi.fn(async () => "ok");
    const res = host(client, () =>
      useResource(
        () => null,
        () => key,
        fetcher,
      ),
    );
    return { res, fetcher };
  }

  it("refetches what a record write changes, except the reads passed as fresh", async () => {
    const client = testClient();
    const entries = counted(client, entriesKey("2026-10"));
    const summary = counted(client, queryKeys.summary({ id: "c1", month: "2026-10" }));
    const detail = counted(client, queryKeys.contract("c1"));
    const other = counted(client, queryKeys.summary({ id: "c2", month: "2026-10" }));
    const team = counted(client, queryKeys.team("2026-10"));
    const invalidate = host(client, useInvalidate);
    await flushPromises();

    await invalidate.records("c1", entries.res);
    await flushPromises();
    expect(entries.fetcher).toHaveBeenCalledTimes(1);
    expect(summary.fetcher).toHaveBeenCalledTimes(2);
    expect(detail.fetcher).toHaveBeenCalledTimes(1);
    expect(other.fetcher).toHaveBeenCalledTimes(1);
    expect(team.fetcher).toHaveBeenCalledTimes(2);

    await invalidate.contract("c1");
    await flushPromises();
    expect(detail.fetcher).toHaveBeenCalledTimes(2);
    expect(entries.fetcher).toHaveBeenCalledTimes(2);
    expect(other.fetcher).toHaveBeenCalledTimes(1);
  });
});
