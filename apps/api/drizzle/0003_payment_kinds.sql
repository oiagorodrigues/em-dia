ALTER TABLE "payments" ALTER COLUMN "method" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" text DEFAULT 'pay' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_advance_id_payments_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_advance_idx" ON "payments" USING btree ("advance_id");--> statement-breakpoint
-- Extra payments counted as due and as paid; a gratificação does the same.
UPDATE "payments" SET "kind" = 'bonus' WHERE "is_extra" = true;--> statement-breakpoint
-- Each adjustment becomes an entry of the payments list with no method, so it moves
-- only the amount due, exactly as before: bonus and transport add to it; deduction and
-- the old advance (which reduced the amount due at once) become descontos.
INSERT INTO "payments" ("id", "contract_id", "reference_month", "paid_on", "amount_cents", "kind", "method", "note", "created_by", "created_at")
SELECT
  "id",
  "contract_id",
  "month",
  ("created_at" AT TIME ZONE 'America/Sao_Paulo')::date,
  "amount_cents",
  CASE "kind" WHEN 'bonus' THEN 'bonus' WHEN 'transport' THEN 'transport' ELSE 'deduction' END,
  NULL,
  CASE
    WHEN "kind" <> 'advance' THEN "description"
    WHEN coalesce(trim("description"), '') = '' THEN 'Adiantamento (vale)'
    ELSE 'Adiantamento (vale): ' || "description"
  END,
  "created_by",
  "created_at"
FROM "adjustments";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_kind_check" CHECK ("payments"."kind" IN ('pay', 'bonus', 'transport', 'advance', 'deduction'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_kind_method_check" CHECK (("payments"."kind" = 'deduction' AND "payments"."method" IS NULL) OR ("payments"."kind" <> 'deduction' AND ("payments"."method" IS NOT NULL OR "payments"."kind" IN ('bonus', 'transport'))));--> statement-breakpoint
DROP TABLE "adjustments" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "is_extra";
