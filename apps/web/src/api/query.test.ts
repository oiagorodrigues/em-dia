import { describe, expect, it } from "vite-plus/test";
import { ApiError } from "./client.ts";
import { queryKeys, staleAfterContract, staleAfterRecords } from "./keys.ts";
import { shouldRetry } from "./query.ts";

describe("shouldRetry", () => {
  it("never retries a 4xx", () => {
    expect(shouldRetry(0, new ApiError(404, "NOT_FOUND", ""))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, "UNAUTHORIZED", ""))).toBe(false);
  });

  it("retries network failures and 5xx twice", () => {
    expect(shouldRetry(0, new ApiError(0, "NETWORK", ""))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, "INTERNAL", ""))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, "INTERNAL", ""))).toBe(false);
  });
});

describe("stale filters", () => {
  const q = (key: readonly unknown[]) => ({ key }) as never;

  it("a record write reaches the contract's data and the cross-contract reads", () => {
    const stale = staleAfterRecords("c1");
    expect(stale(q(queryKeys.payments({ id: "c1", year: 2026 })))).toBe(true);
    expect(stale(q(queryKeys.dashboard()))).toBe(true);
    expect(stale(q(queryKeys.teamPayments(2026)))).toBe(true);
    expect(stale(q(queryKeys.contract("c1")))).toBe(false);
    expect(stale(q(queryKeys.contracts()))).toBe(false);
    expect(stale(q(queryKeys.agreements("c2")))).toBe(false);
  });

  it("a contract write also reaches the contract and the contract list", () => {
    const stale = staleAfterContract("c1");
    expect(stale(q(queryKeys.contract("c1")))).toBe(true);
    expect(stale(q(queryKeys.contracts()))).toBe(true);
    expect(stale(q(queryKeys.board("2026-10")))).toBe(true);
    expect(stale(q(queryKeys.contract("c2")))).toBe(false);
  });
});
