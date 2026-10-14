ALTER TABLE "sale_items" ADD COLUMN "base_unit_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "price_adjusted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_price_adjusted_by_user_id_users_id_fk" FOREIGN KEY ("price_adjusted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

--> statement-breakpoint
-- BLOOM_KIGALI_NEGOTIATED_PRICE_BACKFILL

/*
 * Historical sales did not support negotiated higher
 * product prices. Their recorded unit_price is therefore
 * the safest historical base-price snapshot.
 */
UPDATE "sale_items"
SET "base_unit_price" = "unit_price"
WHERE "base_unit_price" = 0;
