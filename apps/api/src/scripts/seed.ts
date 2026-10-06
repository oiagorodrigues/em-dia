import type {
  EntryStatus,
  IsoDate,
  PaymentMethod,
  Role,
  WorkEntry,
  YearMonth,
} from "@ponto/shared";
import {
  computeMonthSummary,
  datesOfMonth,
  DEFAULT_TIMEZONE,
  minutesToClock,
  nowInZone,
  shiftMinutes,
  weekdayOf,
} from "@ponto/shared";
import { loadConfig } from "../config/index.ts";
import { openDatabase } from "../db/index.ts";
import { hashPassword } from "../lib/crypto.ts";
import { newId } from "../lib/ids.ts";
import { createLogger } from "../lib/logger.ts";
import { solidPng } from "../lib/png.ts";
import { createFileStore } from "../lib/storage.ts";
import { createRepos, type ContractFields, type LocatedContract } from "../repos/index.ts";

const PASSWORD = "ponto12345";
const ANA = { email: "ana@ponto.dev", name: "Ana Souza" };
const MARIA = { email: "maria@ponto.dev", name: "Maria Aparecida" };
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

interface ShiftPlan {
  start: number;
  end: number;
  breakMinutes: number;
  /** Exceptions to "worked" on a scheduled day. */
  exceptions: Record<IsoDate, DayPlan>;
}

function plannedEntries(
  located: LocatedContract,
  shift: ShiftPlan,
  until: IsoDate,
  author: { id: string; role: Role },
  confirm: (date: IsoDate) => { by: string } | null,
): WorkEntry[] {
  const { contract } = located;
  const out: WorkEntry[] = [];
  for (const date of MONTHS.flatMap(datesOfMonth)) {
    if (
      date < contract.startedOn ||
      date > until ||
      !contract.scheduleDays.includes(weekdayOf(date))
    )
      continue;
    const plan = shift.exceptions[date] ?? { status: "worked" };
    const worked = plan.status === "worked";
    const checkIn = worked ? minutesToClock(shift.start + wobble(date, 5, 3)) : null;
    const checkOut = worked ? minutesToClock(shift.end + wobble(date, 10, 4)) : null;
    const confirmation = confirm(date);
    out.push({
      id: newId(),
      contractId: contract.id,
      date,
      status: plan.status,
      checkIn,
      checkOut,
      breakMinutes: worked ? shift.breakMinutes : 0,
      minutes: checkIn && checkOut ? shiftMinutes(checkIn, checkOut, shift.breakMinutes) : 0,
      note: plan.note ?? null,
      createdBy: author.id,
      createdByRole: author.role,
      confirmedBy: confirmation?.by ?? null,
      confirmedAt: confirmation ? `${date}T21:00:00.000Z` : null,
      updatedAt: `${date}T20:00:00.000Z`,
    });
  }
  return out;
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
  const diaristaId = newId();
  const babaId = newId();

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
      pixKey: "maria@ponto.dev",
    });
    repos.households.insert({
      id: householdId,
      ownerId: anaId,
      name: "Casa da Ana",
      timezone: DEFAULT_TIMEZONE,
      createdAt: "2026-07-20T12:00:00.000Z",
    });

    const diarista: ContractFields = {
      workerName: "Maria",
      occupation: "diarista",
      payType: "daily",
      rateCents: 18000,
      scheduleDays: [1, 3, 5],
      expectedStart: "08:00",
      expectedEnd: "16:00",
      startedOn: "2026-08-01",
    };
    const baba: ContractFields = {
      workerName: "Joana",
      occupation: "baba",
      payType: "hourly",
      rateCents: 2500,
      scheduleDays: [1, 2, 3, 4, 5],
      expectedStart: "07:30",
      expectedEnd: "17:30",
      startedOn: "2026-08-03",
    };
    repos.contracts.insert({
      id: diaristaId,
      householdId,
      createdAt: "2026-07-28T12:00:00.000Z",
      ...diarista,
    });
    repos.contracts.insert({
      id: babaId,
      householdId,
      createdAt: "2026-07-30T12:00:00.000Z",
      ...baba,
    });
    repos.contracts.linkWorker(diaristaId, mariaId);

    const auditAt = (
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
    auditAt(
      "2026-07-28T12:00:00.000Z",
      anaId,
      diaristaId,
      "contract.create",
      "contract",
      diaristaId,
    );
    auditAt(
      "2026-07-28T18:00:00.000Z",
      mariaId,
      diaristaId,
      "contract.join",
      "contract",
      diaristaId,
    );
    auditAt("2026-07-30T12:00:00.000Z", anaId, babaId, "contract.create", "contract", babaId);

    const located = (id: string) => {
      const l = repos.contracts.findById(id);
      if (!l) throw new Error(`contract ${id} missing`);
      return l;
    };
    const mariaContract = located(diaristaId);
    const joanaContract = located(babaId);

    // Maria records her days and Ana confirms, except for this month's most recent ones.
    const mariaEntries = plannedEntries(
      mariaContract,
      {
        start: 8 * 60,
        end: 16 * 60,
        breakMinutes: 60,
        exceptions: {
          "2026-08-19": { status: "absent", note: "Não avisou" },
          "2026-09-07": { status: "holiday", note: "Independência" },
          "2026-09-23": { status: "excused", note: "Consulta médica" },
        },
      },
      yesterday,
      { id: mariaId, role: "worker" },
      (date) => (date < "2026-10-01" ? { by: anaId } : null),
    );
    // Joana has no account yet, so nothing Ana records for her can be confirmed.
    const joanaEntries = plannedEntries(
      joanaContract,
      {
        start: 7 * 60 + 30,
        end: 17 * 60 + 30,
        breakMinutes: 60,
        exceptions: {
          "2026-08-28": { status: "absent" },
          "2026-09-07": { status: "holiday", note: "Independência" },
          "2026-10-02": { status: "excused", note: "Filho doente" },
        },
      },
      yesterday,
      { id: anaId, role: "employer" },
      () => null,
    );
    for (const entry of [...mariaEntries, ...joanaEntries]) repos.entries.save(entry);
    for (const contractId of [diaristaId, babaId]) {
      repos.entries.save({
        id: newId(),
        contractId,
        date: "2026-10-12",
        status: "holiday",
        checkIn: null,
        checkOut: null,
        breakMinutes: 0,
        minutes: 0,
        note: "Nossa Senhora Aparecida",
        createdBy: anaId,
        createdByRole: "employer",
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: "2026-10-01T12:00:00.000Z",
      });
    }

    const adjustment = (
      contractId: string,
      month: YearMonth,
      kind: "bonus" | "transport" | "advance",
      amountCents: number,
      description: string,
    ) =>
      repos.adjustments.insert({
        id: newId(),
        contractId,
        month,
        kind,
        amountCents,
        description,
        createdBy: anaId,
        createdAt: `${month}-15T12:00:00.000Z`,
      });
    adjustment(diaristaId, "2026-08", "transport", 6000, "Vale-transporte de agosto");
    adjustment(diaristaId, "2026-09", "bonus", 5000, "Faxina pesada depois da festa");
    adjustment(diaristaId, "2026-09", "advance", 10000, "Vale pedido no dia 15");
    adjustment(babaId, "2026-09", "transport", 22000, "Vale-transporte de setembro");

    const payment = (
      contract: LocatedContract,
      referenceMonth: YearMonth,
      paidOn: IsoDate,
      method: PaymentMethod,
      opts: { acknowledgedAt?: string; withReceipt?: boolean } = {},
    ) => {
      const id = newId();
      const createdAt = `${paidOn}T15:00:00.000Z`;
      repos.payments.insert({
        id,
        contractId: contract.contract.id,
        referenceMonth,
        paidOn,
        amountCents: dueFor(contract, referenceMonth, today),
        method,
        note: null,
        receipt: opts.withReceipt
          ? {
              mimeType: "image/png",
              sizeBytes: receiptPng.length,
              originalName: "comprovante-pix.png",
              uploadedAt: createdAt,
            }
          : null,
        receiptFile: opts.withReceipt ? receiptFile : null,
        acknowledgedAt: opts.acknowledgedAt ?? null,
        createdBy: anaId,
        createdAt,
      });
      auditAt(createdAt, anaId, contract.contract.id, "payment.create", "payment", id);
      if (opts.acknowledgedAt)
        auditAt(
          opts.acknowledgedAt,
          mariaId,
          contract.contract.id,
          "payment.acknowledge",
          "payment",
          id,
        );
    };
    payment(mariaContract, "2026-08", "2026-09-04", "pix", {
      withReceipt: true,
      acknowledgedAt: "2026-09-04T19:30:00.000Z",
    });
    payment(mariaContract, "2026-09", "2026-10-05", "pix");
    payment(joanaContract, "2026-08", "2026-09-05", "cash");
    payment(joanaContract, "2026-09", "2026-10-05", "transfer");
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
