import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type ContractOverrides, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = await setup();
  employer = await t.register("employer");
});
afterEach(() => t.cleanup());

async function contractWith(overrides: ContractOverrides) {
  const { id } = await t.createContract(employer, overrides);
  return id;
}

async function summary(contractId: string, month: string) {
  const res = await t
    .http()
    .get(`/api/v1/contracts/${contractId}/summary?month=${month}`)
    .auth(employer.token, as);
  expect(res.status).toBe(200);
  return res.body.summary;
}

async function put(contractId: string, date: string, status: string) {
  const body =
    status === "worked"
      ? { status, checkIn: "08:00", checkOut: "16:00", breakMinutes: 60 }
      : { status, checkIn: null, checkOut: null };
  const res = await t
    .http()
    .put(`/api/v1/contracts/${contractId}/entries/${date}`)
    .auth(employer.token, as)
    .send(body);
  expect(res.status).toBeLessThan(300);
}

describe("schedule kinds", () => {
  test("weekly 2x/week (ter e sex)", async () => {
    const id = await contractWith({ schedule: { kind: "weekly", weekdays: [5, 2] } });
    const sep = await summary(id, "2026-09");
    expect(sep.expectedDates).toEqual([
      "2026-09-01",
      "2026-09-04",
      "2026-09-08",
      "2026-09-11",
      "2026-09-15",
      "2026-09-18",
      "2026-09-22",
      "2026-09-25",
      "2026-09-29",
    ]);
    expect(sep.expectedDays).toBe(9);

    await put(id, "2026-10-02", "worked");
    const oct = await summary(id, "2026-10");
    expect(oct.expectedDays).toBe(9);
    // Today (Tue 06) is expected and still empty; later dates never count as unrecorded.
    expect(oct.unrecordedDates).toEqual(["2026-10-06"]);
  });

  test("weekly every day (cuidadora)", async () => {
    const id = await contractWith({
      schedule: { kind: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    });
    expect((await summary(id, "2026-09")).expectedDays).toBe(30);
    expect((await summary(id, "2026-08")).expectedDays).toBe(31);
  });

  test("quinzenal counts weeks from the week of startedOn", async () => {
    const id = await contractWith({
      startedOn: "2026-08-07",
      schedule: { kind: "weekly", weekdays: [5], everyWeeks: 2 },
    });
    expect((await summary(id, "2026-08")).expectedDates).toEqual(["2026-08-07", "2026-08-21"]);
    expect((await summary(id, "2026-09")).expectedDates).toEqual(["2026-09-04", "2026-09-18"]);
    expect((await summary(id, "2026-10")).expectedDates).toEqual([
      "2026-10-02",
      "2026-10-16",
      "2026-10-30",
    ]);
  });

  test("month_days, with the 31st falling on the last day of short months", async () => {
    const id = await contractWith({ schedule: { kind: "month_days", monthDays: [31, 5] } });
    const sep = await summary(id, "2026-09");
    expect(sep.expectedDates).toEqual(["2026-09-05", "2026-09-30"]);
    const oct = await summary(id, "2026-10");
    expect(oct.expectedDates).toEqual(["2026-10-05", "2026-10-31"]);
    expect(oct.unrecordedDates).toEqual(["2026-10-05"]);
  });

  test("per_month expects a count with no dates", async () => {
    const id = await contractWith({ schedule: { kind: "per_month", visitsPerMonth: 2 } });
    const oct = await summary(id, "2026-10");
    expect(oct).toMatchObject({ expectedDays: 2, expectedDates: [], unrecordedDates: [] });
    // Months before the contract started expect nothing.
    expect((await summary(id, "2026-07")).expectedDays).toBe(0);
  });

  test("on_demand expects nothing", async () => {
    const id = await contractWith({ schedule: { kind: "on_demand" } });
    await put(id, "2026-10-01", "worked");
    expect(await summary(id, "2026-10")).toMatchObject({
      expectedDays: 0,
      expectedDates: [],
      unrecordedDates: [],
      daysWorked: 1,
      grossCents: 18000,
    });
  });

  test("the schema drops fields that do not belong to the kind and validates the rest", async () => {
    const res = await t
      .http()
      .get(
        `/api/v1/contracts/${await contractWith({ schedule: { kind: "month_days", monthDays: [5, 5], weekdays: [1] } })}`,
      )
      .auth(employer.token, as);
    expect(res.body.contract.schedule).toEqual({
      kind: "month_days",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [5],
      visitsPerMonth: null,
    });

    await expect(contractWith({ schedule: { kind: "weekly", weekdays: [] } })).rejects.toThrow(
      /400/,
    );
    await expect(contractWith({ schedule: { kind: "per_month" } })).rejects.toThrow(/400/);
  });
});

describe("partial updates", () => {
  test("PATCH replaces the schedule wholesale and leaves deductAbsences alone unless sent", async () => {
    const id = await contractWith({
      payType: "monthly",
      rateCents: 240000,
      deductAbsences: true,
      schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
    });
    const patch = (body: object) =>
      t.http().patch(`/api/v1/contracts/${id}`).auth(employer.token, as).send(body);

    const rate = await patch({ rateCents: 250000 });
    expect(rate.body.contract).toMatchObject({
      rateCents: 250000,
      deductAbsences: true,
      schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
    });

    const schedule = await patch({ schedule: { kind: "per_month", visitsPerMonth: 4 } });
    expect(schedule.body.contract.schedule).toEqual({
      kind: "per_month",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: 4,
    });
    expect(schedule.body.contract.deductAbsences).toBe(true);

    expect((await patch({ deductAbsences: false })).body.contract.deductAbsences).toBe(false);
  });

  test("deductAbsences defaults to false on create", async () => {
    const id = await contractWith({});
    const res = await t.http().get(`/api/v1/contracts/${id}`).auth(employer.token, as);
    expect(res.body.contract.deductAbsences).toBe(false);
  });
});

describe("absence deduction", () => {
  const monthly = (deductAbsences: boolean) =>
    contractWith({
      payType: "monthly",
      rateCents: 240000,
      deductAbsences,
      schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
    });

  test("monthly pay loses rate/30 per unjustified absence; excused absences cost nothing", async () => {
    const id = await monthly(true);
    await put(id, "2026-09-16", "absent");
    await put(id, "2026-09-17", "excused");
    await t
      .http()
      .post(`/api/v1/contracts/${id}/adjustments`)
      .auth(employer.token, as)
      .send({ month: "2026-09", kind: "transport", amountCents: 22000 });

    expect(await summary(id, "2026-09")).toMatchObject({
      grossCents: 240000,
      absences: 1,
      excused: 1,
      absenceDeductionCents: 8000,
      adjustmentsCents: 22000,
      dueCents: 254000,
    });

    const csv = await t
      .http()
      .get(`/api/v1/contracts/${id}/statement.csv?month=2026-09`)
      .auth(employer.token, as);
    expect(csv.text).toContain("\r\nDesconto por faltas (R$);80,00\r\n");
    expect(csv.text).toContain("\r\nTotal devido (R$);2540,00\r\n");
  });

  test("no deduction when the flag is off or pay is not monthly", async () => {
    const off = await monthly(false);
    await put(off, "2026-09-16", "absent");
    expect((await summary(off, "2026-09")).absenceDeductionCents).toBe(0);

    const daily = await contractWith({ payType: "daily", deductAbsences: true });
    await put(daily, "2026-09-16", "absent");
    expect((await summary(daily, "2026-09")).absenceDeductionCents).toBe(0);
  });
});
