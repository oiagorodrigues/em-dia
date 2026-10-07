ALTER TABLE "payments" ADD COLUMN "acknowledged_by" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "acknowledged_by_role" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "is_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_acknowledged_by_role_check" CHECK ("payments"."acknowledged_by_role" IN ('employer', 'worker'));--> statement-breakpoint
UPDATE "payments" SET "acknowledged_by_role" = 'worker', "acknowledged_by" = "contracts"."worker_id" FROM "contracts" WHERE "payments"."contract_id" = "contracts"."id" AND "payments"."acknowledged_at" IS NOT NULL;