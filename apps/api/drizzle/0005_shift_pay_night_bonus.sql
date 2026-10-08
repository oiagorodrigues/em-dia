ALTER TABLE "contracts" DROP CONSTRAINT "contracts_pay_type_check";--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "night_bonus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_entries" ADD COLUMN "check_out_date" date;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_pay_type_check" CHECK ("contracts"."pay_type" IN ('hourly', 'daily', 'shift', 'biweekly', 'monthly'));