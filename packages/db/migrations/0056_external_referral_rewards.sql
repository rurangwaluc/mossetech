-- An agreement may belong to precisely one normal or external sale.
-- Existing normal-sale rewards remain valid and unchanged.
ALTER TABLE "referral_rewards" ALTER COLUMN "sale_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD COLUMN "external_sale_id" uuid;
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_external_sale_id_unique" UNIQUE("external_sale_id");
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_external_sale_id_external_sales_id_fk" FOREIGN KEY ("external_sale_id") REFERENCES "public"."external_sales"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_reward_one_sale_check" CHECK (
  ("sale_id" IS NOT NULL AND "external_sale_id" IS NULL) OR
  ("sale_id" IS NULL AND "external_sale_id" IS NOT NULL)
);
