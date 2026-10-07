import type {
  EntryStatus,
  IsoDate,
  PaymentKind,
  PaymentMethod,
  Role,
  Schedule,
  WorkEntry,
  YearMonth,
} from "@emdia/shared";
import {
  computeMonthSummary,
  DEFAULT_TIMEZONE,
  EMPTY_SCHEDULE,
  expectedDatesInMonth,
  minutesToClock,
  nowInZone,
  shiftMinutes,
} from "@emdia/shared";
import { loadConfig } from "../config/index.ts";
import { openDatabase } from "../db/index.ts";
import { contracts, households, users } from "../db/schema.ts";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "../lib/crypto.ts";
import { newId } from "../lib/ids.ts";
import { createLogger } from "../lib/logger.ts";
import { solidPng } from "../lib/png.ts";
import {
  createRepos,
  type ContractFields,
  type LocatedContract,
  type TxRepos,
} from "../repos/index.ts";
import { createReceiptStore } from "../services/index.ts";

const PASSWORD = "emdia12345";
const ANA = { email: "ana@emdia.dev", name: "Ana Souza" };
const MARIA = { email: "maria@emdia.dev", name: "Maria Aparecida" };
const MONTHS: YearMonth[] = ["2026-08", "2026-09", "2026-10"];

const config = loadConfig();
const logger = createLogger(config.logLevel === "silent" ? "silent" : "info", { script: "seed" });
const database = await openDatabase(config.databaseUrl);
if (database.driver === "pglite") await database.migrate();
const repos = createRepos(database);
const files = createReceiptStore(config);

/** Postgres enforces the foreign keys: households cascade to contracts and their history, users to sessions. */
async function reset(): Promise<void> {
  const seedUsers = await database.db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, [ANA.email, MARIA.email]));
  const ids = seedUsers.map((u) => u.id);
  if (ids.length === 0) return;
  const owned = await database.db
    .select({ id: contracts.id })
    .from(contracts)
    .innerJoin(households, eq(households.id, contracts.householdId))
    .where(inArray(households.ownerId, ids));
  const receipts = await repos.payments.listReceiptFiles(owned.map((c) => c.id));

  await database.transaction(async (tx) => {
    await tx.delete(households).where(inArray(households.ownerId, ids));
    await tx.delete(users).where(inArray(users.id, ids));
  });
  await Promise.all(receipts.map((name) => files.remove(name)));
}

/** Deterministic wobble so the card does not look machine-generated. */
const wobble = (date: IsoDate, step: number, spread: number) =>
  (Number(date.slice(8)) % spread) * step;

interface DayPlan {
  status: EntryStatus;
  note?: string;
}

interface SeedContract {
  fields: Omit<ContractFields, "contactEmail" | "contactPhone"> &
    Partial<Pick<ContractFields, "contactEmail" | "contactPhone">>;
  createdAt: string;
  /** Removed contracts: the last day worked and when the employer archived it. */
  archived?: { lastDay: IsoDate; at: string };
  shift: { start: number; end: number; breakMinutes: number };
  /** per_month and on_demand have no expected dates, so their visits are listed. */
  visits?: IsoDate[];
  /** Expected days that were not plain worked days. */
  exceptions?: Record<IsoDate, DayPlan>;
  agreements?: {
    key: string;
    description: string;
    totalCents: number;
    installmentCents: number | null;
    startMonth: YearMonth;
    createdAt: string;
    acceptedAt: string | null;
  }[];
  /** Listed in order; a payment without amountCents settles what is still due for its month. */
  payments: {
    month: YearMonth;
    paidOn: IsoDate;
    /** Defaults to "pay". */
    kind?: PaymentKind;
    method: PaymentMethod | null;
    amountCents?: number;
    /** Names an adiantamento so later entries can abate it. */
    key?: string;
    agreement?: string;
    advance?: string;
    note?: string;
    receipt?: boolean;
    acknowledgedAt?: string;
  }[];
}

const weekly = (weekdays: number[], everyWeeks = 1): Schedule => ({
  ...EMPTY_SCHEDULE,
  kind: "weekly",
  weekdays,
  everyWeeks,
});

const MARIA_CONTRACT: SeedContract = {
  fields: {
    workerName: "Maria",
    occupation: "diarista",
    payType: "daily",
    rateCents: 18000,
    schedule: weekly([2, 5]),
    deductAbsences: false,
    expectedStart: "08:00",
    expectedEnd: "16:00",
    startedOn: "2026-08-01",
  },
  createdAt: "2026-07-28T12:00:00.000Z",
  shift: { start: 8 * 60, end: 16 * 60, breakMinutes: 60 },
  exceptions: {
    "2026-08-18": { status: "absent", note: "Não avisou" },
    "2026-09-22": { status: "excused", note: "Consulta médica" },
  },
  agreements: [
    {
      key: "mesa",
      description: "Mesa de jantar",
      totalCents: 120000,
      installmentCents: 20000,
      startMonth: "2026-09",
      createdAt: "2026-08-28T14:00:00.000Z",
      acceptedAt: "2026-08-28T20:10:00.000Z",
    },
  ],
  payments: [
    {
      month: "2026-08",
      paidOn: "2026-08-04",
      kind: "transport",
      method: "cash",
      amountCents: 4000,
      note: "Vale-transporte de agosto",
      acknowledgedAt: "2026-08-04T19:00:00.000Z",
    },
    {
      month: "2026-08",
      paidOn: "2026-09-04",
      method: "pix",
      receipt: true,
      acknowledgedAt: "2026-09-04T19:30:00.000Z",
    },
    {
      month: "2026-09",
      paidOn: "2026-09-15",
      kind: "advance",
      method: "pix",
      amountCents: 36000,
      key: "vale",
      note: "Vale pedido no dia 15",
      acknowledgedAt: "2026-09-15T21:00:00.000Z",
    },
    {
      month: "2026-09",
      paidOn: "2026-09-19",
      kind: "bonus",
      method: "cash",
      amountCents: 5000,
      note: "Faxina pesada depois da festa",
    },
    {
      month: "2026-09",
      paidOn: "2026-09-25",
      method: "compensation",
      amountCents: 18000,
      advance: "vale",
      note: "Diária de 25/09 abatida do adiantamento",
    },
    {
      month: "2026-09",
      paidOn: "2026-10-02",
      method: "compensation",
      amountCents: 20000,
      agreement: "mesa",
      acknowledgedAt: "2026-10-02T19:00:00.000Z",
    },
    { month: "2026-09", paidOn: "2026-10-02", method: "pix" },
  ],
};

/** Not linked to an account: Ana records these days herself. */
const OTHER_CONTRACTS: SeedContract[] = [
  {
    fields: {
      workerName: "Joana",
      contactEmail: "joana@exemplo.com",
      contactPhone: "(11) 97777-1234",
      occupation: "baba",
      payType: "monthly",
      rateCents: 240000,
      schedule: weekly([1, 2, 3, 4, 5]),
      deductAbsences: true,
      expectedStart: "07:30",
      expectedEnd: "17:30",
      startedOn: "2026-08-03",
    },
    createdAt: "2026-07-30T12:00:00.000Z",
    shift: { start: 7 * 60 + 30, end: 17 * 60 + 30, breakMinutes: 60 },
    exceptions: {
      "2026-09-07": { status: "holiday", note: "Independência" },
      "2026-09-16": { status: "absent", note: "Não veio e não avisou" },
      "2026-10-02": { status: "excused", note: "Filho doente" },
    },
    payments: [
      { month: "2026-08", paidOn: "2026-09-04", method: "transfer" },
      {
        month: "2026-09",
        paidOn: "2026-09-01",
        kind: "transport",
        method: "transfer",
        amountCents: 22000,
        note: "Vale-transporte de setembro",
      },
      {
        month: "2026-09",
        paidOn: "2026-09-30",
        kind: "deduction",
        method: null,
        amountCents: 19200,
        note: "INSS (parte da profissional)",
      },
      { month: "2026-09", paidOn: "2026-10-05", method: "transfer" },
    ],
  },
  {
    fields: {
      workerName: "Seu Antônio",
      contactPhone: "(11) 96666-4321",
      occupation: "jardineiro",
      payType: "daily",
      rateCents: 25000,
      schedule: { ...EMPTY_SCHEDULE, kind: "per_month", visitsPerMonth: 1 },
      deductAbsences: false,
      expectedStart: "07:00",
      expectedEnd: "12:00",
      startedOn: "2026-08-01",
    },
    createdAt: "2026-07-31T12:00:00.000Z",
    shift: { start: 7 * 60, end: 12 * 60, breakMinutes: 0 },
    visits: ["2026-08-15", "2026-09-12"],
    payments: [
      { month: "2026-08", paidOn: "2026-08-15", method: "cash" },
      { month: "2026-09", paidOn: "2026-09-12", method: "cash" },
    ],
  },
  {
    fields: {
      workerName: "Rosa",
      occupation: "passadeira",
      payType: "daily",
      rateCents: 15000,
      schedule: weekly([5], 2),
      deductAbsences: false,
      expectedStart: "13:00",
      expectedEnd: "18:00",
      startedOn: "2026-08-07",
    },
    createdAt: "2026-08-03T12:00:00.000Z",
    shift: { start: 13 * 60, end: 18 * 60, breakMinutes: 0 },
    exceptions: { "2026-09-18": { status: "day_off", note: "Trocou para a semana seguinte" } },
    payments: [
      { month: "2026-08", paidOn: "2026-09-04", method: "pix" },
      { month: "2026-09", paidOn: "2026-10-02", method: "pix" },
    ],
  },
  {
    fields: {
      workerName: "Dona Cida",
      occupation: "cuidadora",
      payType: "monthly",
      rateCents: 320000,
      schedule: weekly([0, 1, 2, 3, 4, 5, 6]),
      deductAbsences: false,
      expectedStart: "08:00",
      expectedEnd: "20:00",
      startedOn: "2026-08-01",
    },
    createdAt: "2026-07-25T12:00:00.000Z",
    shift: { start: 8 * 60, end: 20 * 60, breakMinutes: 120 },
    exceptions: {
      "2026-08-16": { status: "day_off", note: "Folga combinada" },
      "2026-09-07": { status: "holiday", note: "Independência" },
      "2026-09-13": { status: "day_off", note: "Folga combinada" },
    },
    payments: [
      {
        month: "2026-08",
        paidOn: "2026-08-21",
        kind: "bonus",
        method: "pix",
        amountCents: 15000,
        note: "Noite extra no hospital",
      },
      { month: "2026-08", paidOn: "2026-09-05", method: "pix" },
      { month: "2026-09", paidOn: "2026-10-05", method: "pix" },
    ],
  },
  {
    fields: {
      workerName: "Carla",
      occupation: "faxineira",
      payType: "daily",
      rateCents: 17000,
      schedule: weekly([3]),
      deductAbsences: false,
      expectedStart: "08:00",
      expectedEnd: "15:00",
      startedOn: "2026-08-05",
    },
    createdAt: "2026-08-01T12:00:00.000Z",
    archived: { lastDay: "2026-09-16", at: "2026-09-20T13:00:00.000Z" },
    shift: { start: 8 * 60, end: 15 * 60, breakMinutes: 60 },
    exceptions: { "2026-09-02": { status: "absent", note: "Não avisou" } },
    payments: [{ month: "2026-08", paidOn: "2026-09-02", method: "pix" }],
  },
];

const FUTURE_HOLIDAY: { date: IsoDate; note: string } = {
  date: "2026-10-12",
  note: "Nossa Senhora Aparecida",
};

function scheduledDates(located: LocatedContract): IsoDate[] {
  const { schedule, startedOn, endedOn } = located.contract;
  return MONTHS.flatMap((m) => expectedDatesInMonth(schedule, m, { startedOn, endedOn }));
}

function plannedEntries(
  seed: SeedContract,
  located: LocatedContract,
  until: IsoDate,
  author: { id: string; role: Role },
  confirmer: string | null,
): WorkEntry[] {
  const { shift } = seed;
  const dates = [...scheduledDates(located), ...(seed.visits ?? [])].filter((d) => d <= until);
  return dates.map((date) => {
    const plan = seed.exceptions?.[date] ?? { status: "worked" };
    const worked = plan.status === "worked";
    const checkIn = worked ? minutesToClock(shift.start + wobble(date, 5, 3)) : null;
    const checkOut = worked ? minutesToClock(shift.end + wobble(date, 10, 4)) : null;
    // The linked worker's days are confirmed up to last month; this month's still wait for Ana.
    const confirmed = confirmer !== null && date < "2026-10-01";
    return {
      id: newId(),
      contractId: located.contract.id,
      date,
      status: plan.status,
      checkIn,
      checkOut,
      breakMinutes: worked ? shift.breakMinutes : 0,
      minutes: checkIn && checkOut ? shiftMinutes(checkIn, checkOut, shift.breakMinutes) : 0,
      note: plan.note ?? null,
      createdBy: author.id,
      createdByRole: author.role,
      confirmedBy: confirmed ? confirmer : null,
      confirmedAt: confirmed ? `${date}T21:00:00.000Z` : null,
      updatedAt: `${date}T20:00:00.000Z`,
    };
  });
}

/** What is still owed for `month` after the payments already recorded. */
async function balanceFor(
  r: TxRepos,
  located: LocatedContract,
  month: YearMonth,
  today: IsoDate,
): Promise<number> {
  const { contract } = located;
  return computeMonthSummary({
    contract,
    month,
    entries: await r.entries.listByMonth(contract.id, month),
    payments: await r.payments.listByMonth(contract.id, month),
    today,
  }).balanceCents;
}

async function seed(): Promise<void> {
  const [anaHash, mariaHash] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
  const receiptPng = solidPng(240, 320, [35, 64, 232]);
  const receiptFile = await files.save(receiptPng, "png", "image/png");
  const today = nowInZone(DEFAULT_TIMEZONE).date;
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

  const anaId = newId();
  const mariaId = newId();
  const householdId = newId();

  const audit = (
    r: TxRepos,
    at: string,
    actorId: string,
    contractId: string,
    action: string,
    entity: string,
    entityId: string,
  ) =>
    r.audit.insert({
      id: newId(),
      actorId,
      contractId,
      action,
      entity,
      entityId,
      meta: null,
      at,
    });

  async function insertContract(
    r: TxRepos,
    seed: SeedContract,
    worker: { id: string } | null,
  ): Promise<LocatedContract> {
    const id = newId();
    await r.contracts.insert({
      id,
      householdId,
      createdAt: seed.createdAt,
      contactEmail: null,
      contactPhone: null,
      ...seed.fields,
    });
    await audit(r, seed.createdAt, anaId, id, "contract.create", "contract", id);
    if (worker) {
      await r.contracts.linkWorker(id, worker.id);
      await audit(
        r,
        seed.createdAt.replace("T12", "T18"),
        worker.id,
        id,
        "contract.join",
        "contract",
        id,
      );
    }
    const located = await r.contracts.findById(id);
    if (!located) throw new Error(`contract ${id} missing`);
    return located;
  }

  async function fillContract(
    r: TxRepos,
    seed: SeedContract,
    located: LocatedContract,
    linkedWorkerId: string | null,
  ) {
    const contractId = located.contract.id;
    const author = linkedWorkerId
      ? { id: linkedWorkerId, role: "worker" as const }
      : { id: anaId, role: "employer" as const };
    for (const entry of plannedEntries(
      seed,
      located,
      yesterday,
      author,
      linkedWorkerId ? anaId : null,
    )) {
      await r.entries.save(entry);
    }
    if (!seed.archived && scheduledDates(located).includes(FUTURE_HOLIDAY.date)) {
      await r.entries.save({
        id: newId(),
        contractId,
        date: FUTURE_HOLIDAY.date,
        status: "holiday",
        checkIn: null,
        checkOut: null,
        breakMinutes: 0,
        minutes: 0,
        note: FUTURE_HOLIDAY.note,
        createdBy: anaId,
        createdByRole: "employer",
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: "2026-10-01T12:00:00.000Z",
      });
    }
    const agreementIds = new Map<string, string>();
    for (const a of seed.agreements ?? []) {
      const id = newId();
      agreementIds.set(a.key, id);
      await r.agreements.insert({
        id,
        contractId,
        description: a.description,
        totalCents: a.totalCents,
        installmentCents: a.installmentCents,
        startMonth: a.startMonth,
        acceptedAt: a.acceptedAt,
        cancelledAt: null,
        archivedAt: null,
        createdBy: anaId,
        createdAt: a.createdAt,
      });
      await audit(r, a.createdAt, anaId, contractId, "agreement.create", "agreement", id);
      if (a.acceptedAt && linkedWorkerId) {
        await audit(
          r,
          a.acceptedAt,
          linkedWorkerId,
          contractId,
          "agreement.accept",
          "agreement",
          id,
        );
      }
    }
    const advanceIds = new Map<string, string>();
    for (const p of seed.payments) {
      const id = newId();
      if (p.key) advanceIds.set(p.key, id);
      const createdAt = `${p.paidOn}T15:00:00.000Z`;
      const kind = p.kind ?? "pay";
      await r.payments.insert({
        id,
        contractId,
        referenceMonth: p.month,
        paidOn: p.paidOn,
        amountCents: p.amountCents ?? (await balanceFor(r, located, p.month, today)),
        kind,
        method: p.method,
        note: p.note ?? null,
        agreementId: p.agreement ? (agreementIds.get(p.agreement) ?? null) : null,
        advanceId: p.advance ? (advanceIds.get(p.advance) ?? null) : null,
        settledCents: null,
        remainingCents: null,
        receipt: p.receipt
          ? {
              mimeType: "image/png",
              sizeBytes: receiptPng.length,
              originalName: "comprovante-pix.png",
              uploadedAt: createdAt,
            }
          : null,
        receiptFile: p.receipt ? receiptFile : null,
        acknowledgedAt: p.acknowledgedAt ?? null,
        acknowledgedBy: p.acknowledgedAt ? linkedWorkerId : null,
        acknowledgedByRole: p.acknowledgedAt && linkedWorkerId ? "worker" : null,
        createdBy: anaId,
        createdAt,
      });
      await audit(r, createdAt, anaId, contractId, "payment.create", "payment", id);
      if (p.acknowledgedAt && linkedWorkerId) {
        await audit(
          r,
          p.acknowledgedAt,
          linkedWorkerId,
          contractId,
          "payment.acknowledge",
          "payment",
          id,
        );
      }
    }
    if (seed.archived) {
      await r.contracts.setArchivedAt(contractId, seed.archived.at);
      await audit(
        r,
        seed.archived.at,
        anaId,
        contractId,
        "contract.archive",
        "contract",
        contractId,
      );
    }
  }

  await repos.tx(async (r) => {
    await r.users.insert({
      id: anaId,
      ...ANA,
      role: "employer",
      passwordHash: anaHash,
      createdAt: "2026-07-20T12:00:00.000Z",
    });
    await r.users.insert({
      id: mariaId,
      ...MARIA,
      role: "worker",
      passwordHash: mariaHash,
      createdAt: "2026-07-28T12:00:00.000Z",
    });
    await r.users.updateProfile(mariaId, {
      name: MARIA.name,
      phone: "(11) 98765-4321",
      pixKey: "maria@emdia.dev",
    });
    await r.households.insert({
      id: householdId,
      ownerId: anaId,
      name: "Casa da Ana",
      timezone: DEFAULT_TIMEZONE,
      createdAt: "2026-07-20T12:00:00.000Z",
    });

    const maria = await insertContract(r, MARIA_CONTRACT, { id: mariaId });
    await fillContract(r, MARIA_CONTRACT, maria, mariaId);
    for (const seed of OTHER_CONTRACTS) {
      await fillContract(r, seed, await insertContract(r, seed, null), null);
    }
  });
}

async function main(): Promise<void> {
  const wipe = process.argv.includes("--reset");
  if (wipe) await reset();
  else if (await repos.users.findByEmail(ANA.email)) {
    logger.info("already seeded; run with --reset to recreate", { database: database.driver });
    return;
  }
  await seed();
  logger.info("seeded", {
    database: database.driver,
    employer: ANA.email,
    worker: MARIA.email,
    loginWith: `password ${PASSWORD}`,
  });
}

try {
  await main();
} finally {
  await database.close();
}
