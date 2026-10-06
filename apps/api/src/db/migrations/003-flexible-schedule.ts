import type { Migration } from "./index.ts";

/** Replaces the weekday list with a full schedule; existing weekday lists become weekly schedules. */
export const flexibleSchedule: Migration = {
  id: "003-flexible-schedule",
  sql: `
ALTER TABLE contracts ADD COLUMN schedule_kind TEXT NOT NULL DEFAULT 'on_demand'
  CHECK (schedule_kind IN ('weekly', 'month_days', 'per_month', 'on_demand'));
ALTER TABLE contracts ADD COLUMN schedule_weekdays TEXT NOT NULL DEFAULT '[]';
ALTER TABLE contracts ADD COLUMN every_weeks INTEGER NOT NULL DEFAULT 1 CHECK (every_weeks BETWEEN 1 AND 4);
ALTER TABLE contracts ADD COLUMN month_days TEXT NOT NULL DEFAULT '[]';
ALTER TABLE contracts ADD COLUMN visits_per_month INTEGER CHECK (visits_per_month BETWEEN 1 AND 31);
ALTER TABLE contracts ADD COLUMN deduct_absences INTEGER NOT NULL DEFAULT 0 CHECK (deduct_absences IN (0, 1));

UPDATE contracts SET
  schedule_weekdays = schedule_days,
  schedule_kind = CASE WHEN json_array_length(schedule_days) > 0 THEN 'weekly' ELSE 'on_demand' END;

ALTER TABLE contracts DROP COLUMN schedule_days;
`,
};
