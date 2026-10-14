ALTER TYPE "public"."cash_drawer_movement_type" ADD VALUE 'PAYMENT_CORRECTION' BEFORE 'CLOSING_COUNT';--> statement-breakpoint
ALTER TABLE "sale_payments" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD COLUMN "replaced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD COLUMN "replaced_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_replaced_by_user_id_users_id_fk" FOREIGN KEY ("replaced_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;