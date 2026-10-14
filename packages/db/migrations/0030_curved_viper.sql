ALTER TABLE "money_additions" ALTER COLUMN "payment_method" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "money_additions" ADD COLUMN "added_by_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "money_additions" ADD CONSTRAINT "money_additions_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;