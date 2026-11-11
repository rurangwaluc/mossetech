-- Allows owner-approved standalone business referrals without altering linked sale rewards.
ALTER TABLE "referral_rewards" ADD COLUMN "business_reason" varchar(500);
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD COLUMN "standalone_idempotency_key" uuid UNIQUE;
--> statement-breakpoint
ALTER TABLE "referral_rewards" DROP CONSTRAINT "referral_reward_one_sale_check";
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_reward_one_sale_check" CHECK (
  ("sale_id" IS NOT NULL AND "external_sale_id" IS NULL) OR
  ("sale_id" IS NULL AND "external_sale_id" IS NOT NULL) OR
  ("sale_id" IS NULL AND "external_sale_id" IS NULL
   AND length(btrim(coalesce("business_reason", ''))) >= 10)
);
