ALTER TABLE "sales" ADD COLUMN "subtotal_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount_given_by_user_id" uuid;--> statement-breakpoint
UPDATE "sales"
SET "subtotal_amount" = "total_amount";--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_given_by_user_id_users_id_fk" FOREIGN KEY ("discount_given_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;