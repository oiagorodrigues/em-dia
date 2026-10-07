import type {
  ActivityItem,
  Agreement,
  Contract,
  Household,
  Payment,
  PublicUser,
  WorkEntry,
} from "@emdia/shared";
import { expect, test } from "vite-plus/test";
import { toPayment, toPublicUser, type Repos } from "../src/repos/index.ts";

/** Exact type equality (both directions, no `any` leaking through). */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const same = <A, B>(proof: Equals<A, B>) => proof;
type Result<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

// Compile-time: `vp check` / tsc fail here if a repo mapping drifts from @emdia/shared.
const proofs = [
  same<Result<Repos["households"]["findById"]>, Household | undefined>(true),
  same<Result<Repos["entries"]["listByMonth"]>, WorkEntry[]>(true),
  same<Result<Repos["agreements"]["list"]>, Agreement[]>(true),
  same<Result<Repos["audit"]["listByContract"]>, ActivityItem[]>(true),
  same<NonNullable<Result<Repos["contracts"]["findById"]>>["contract"], Contract>(true),
  same<ReturnType<typeof toPublicUser>, PublicUser>(true),
  same<ReturnType<typeof toPayment>, Payment>(true),
];

test("repo results are exactly the shared domain types", () => {
  expect(proofs.every(Boolean)).toBe(true);
});
