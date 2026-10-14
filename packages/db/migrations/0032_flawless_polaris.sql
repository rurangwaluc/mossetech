ALTER TYPE "public"."cash_drawer_movement_type" ADD VALUE 'CASH_DEPOSIT_REVERSAL' BEFORE 'CASH_EXPENSE';--> statement-breakpoint
ALTER TABLE "money_additions" ADD COLUMN "reversed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "money_additions" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "money_additions" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "money_transfers" ADD COLUMN "reversed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "money_transfers" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "money_transfers" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "money_additions" ADD CONSTRAINT "money_additions_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;