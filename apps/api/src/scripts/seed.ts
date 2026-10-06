import type {
  AdjustmentKind,
  EntryStatus,
  IsoDate,
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
import { hashPassword } from "../lib/crypto.ts";
import { newId } from "../lib/ids.ts";
import { createLogger } from "../lib/logger.ts";
import { solidPng } from "../lib/png.ts";
import { createFileStore } from "../lib/storage.ts";
import { createRepos, type ContractFields, type LocatedContract } from "../repos/index.ts";

const PASSWORD = "emdia12345";
const ANA = { email: "ana@emdia.dev", name: "Ana Souza" };
const MARIA = { email: "maria@emdia.dev", name: "Maria Aparecida" };
const MONTHS: YearMonth[] = ["2026-08", "2026-09", "2026-10"];

const config = loadConfig();
const logger = createLogger(config.logLevel === "silent" ? "silent" : "info", { script: "seed" });
const db = openDatabase(config.databasePath);
const repos = createRepos(db);
const files = createFileStore(config.uploadDir);

async function reset(): Promise<void> {
  const ana = repos.users.findByEmail(ANA.email);
  if (ana) {
    const contractIds = repos.contracts.listForEmployer(ana.id).map((l) => l.contract.id);
    const receipts = repos.payments.listReceiptFiles(contractIds);
    repos.tx(() => repos.households.deleteByOwner(ana.id));
    await Promise.all(receipts.map((name) => files.remove(name)));
  }
  repos.tx(() => {
    repos.users.deleteByEmail(ANA.email);
    repos.users.deleteByEmail(MARIA.email);
  });
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
  adjustments?: {
    month: YearMonth;
    kind: AdjustmentKind;
    amountCents: number;
    description: string;
  }[];
  payments: {
    month: YearMonth;
    paidOn: IsoDate;
    method: PaymentMethod;
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
  adjustments: [
    {
      month: "2026-08",
      kind: "transport",
      amountCents: 4000,
      description: "Vale-transporte de agosto",
    },
    {
      month: "2026-09",
      kind: "bonus",
      amountCents: 5000,
      description: "Faxina pesada depois da festa",
    },
    { month: "2026-09", kind: "advance", amountCents: 10000, description: "Vale pedido no dia 15" },
  ],
  payments: [
    {
      month: "2026-08",
      paidOn: "2026-09-04",
      method: "pix",
      receipt: true,
      acknowledgedAt: "2026-09-04T19:30:00.000Z",
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
    adjustments: [
      {
        month: "2026-09",
        kind: "transport",
        amountCents: 22000,
        description: "Vale-transporte de setembro",
      },
    ],
    payments: [
      { month: "2026-08", paidOn: "2026-09-04", method: "transfer" },
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
    adjustments: [
      {
        month: "2026-08",
        kind: "bonus",
        amountCents: 15000,
        description: "Noite extra no hospital",
      },
    ],
    payments: [
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

function dueFor(located: LocatedContract, month: YearMonth, today: IsoDate): number {
  const { contract } = located;
  return computeMonthSummary({
    contract,
    month,
    entries: repos.entries.listByMonth(contract.id, month),
    adjustments: repos.adjustments.listByMonth(contract.id, month),
    payments: [],
    today,
  }).dueCents;
}

async function seed(): Promise<void> {
  const [anaHash, mariaHash] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
  const receiptPng = solidPng(240, 320, [35, 64, 232]);
  const receiptFile = await files.save(receiptPng, "png");
  const today = nowInZone(DEFAULT_TIMEZONE).date;
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

  const anaId = newId();
  const mariaId = newId();
  const householdId = newId();

  const audit = (
    at: string,
    actorId: string,
    contractId: string,
    action: string,
    entity: string,
    entityId: string,
  ) =>
    repos.audit.insert({
      id: newId(),
      actorId,
      contractId,
      action,
      entity,
      entityId,
      meta: null,
      at,
    });

  function insertContract(seed: SeedContract, worker: { id: string } | null): LocatedContract {
    const id = newId();
    repos.contracts.insert({
      id,
      householdId,
      createdAt: seed.createdAt,
      contactEmail: null,
      contactPhone: null,
      ...seed.fields,
    });
    audit(seed.createdAt, anaId, id, "contract.create", "contract", id);
    if (worker) {
      repos.contracts.linkWorker(id, worker.id);
      audit(seed.createdAt.replace("T12", "T18"), worker.id, id, "contract.join", "contract", id);
    }
    const located = repos.contracts.findById(id);
    if (!located) throw new Error(`contract ${id} missing`);
    return located;
  }

  function fillContract(
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
      repos.entries.save(entry);
    }
    if (!seed.archived && scheduledDates(located).includes(FUTURE_HOLIDAY.date)) {
      repos.entries.save({
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
    for (const a of seed.adjustments ?? []) {
      repos.adjustments.insert({
        id: newId(),
        contractId,
        ...a,
        createdBy: anaId,
        createdAt: `${a.month}-15T12:00:00.000Z`,
      });
    }
    for (const p of seed.payments) {
      const id = newId();
      const createdAt = `${p.paidOn}T15:00:00.000Z`;
      repos.payments.insert({
        id,
        contractId,
        referenceMonth: p.month,
        paidOn: p.paidOn,
        amountCents: dueFor(located, p.month, today),
        method: p.method,
        note: null,
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
        createdBy: anaId,
        createdAt,
      });
      audit(createdAt, anaId, contractId, "payment.create", "payment", id);
      if (p.acknowledgedAt && linkedWorkerId) {
        audit(p.acknowledgedAt, linkedWorkerId, contractId, "payment.acknowledge", "payment", id);
      }
    }
    if (seed.archived) {
      repos.contracts.setArchivedAt(contractId, seed.archived.at);
      audit(seed.archived.at, anaId, contractId, "contract.archive", "contract", contractId);
    }
  }

  repos.tx(() => {
    repos.users.insert({
      id: anaId,
      ...ANA,
      role: "employer",
      passwordHash: anaHash,
      createdAt: "2026-07-20T12:00:00.000Z",
    });
    repos.users.insert({
      id: mariaId,
      ...MARIA,
      role: "worker",
      passwordHash: mariaHash,
      createdAt: "2026-07-28T12:00:00.000Z",
    });
    repos.users.updateProfile(mariaId, {
      name: MARIA.name,
      phone: "(11) 98765-4321",
      pixKey: "maria@emdia.dev",
    });
    repos.households.insert({
      id: householdId,
      ownerId: anaId,
      name: "Casa da Ana",
      timezone: DEFAULT_TIMEZONE,
      createdAt: "2026-07-20T12:00:00.000Z",
    });

    fillContract(MARIA_CONTRACT, insertContract(MARIA_CONTRACT, { id: mariaId }), mariaId);
    for (const seed of OTHER_CONTRACTS) fillContract(seed, insertContract(seed, null), null);
  });
}

async function main(): Promise<void> {
  const wipe = process.argv.includes("--reset");
  if (wipe) await reset();
  else if (repos.users.findByEmail(ANA.email)) {
    logger.info("already seeded; run with --reset to recreate", { database: config.databasePath });
    return;
  }
  await seed();
  logger.info("seeded", {
    database: config.databasePath,
    employer: ANA.email,
    worker: MARIA.email,
    loginWith: `password ${PASSWORD}`,
  });
}

try {
  await main();
} finally {
  db.close();
}
