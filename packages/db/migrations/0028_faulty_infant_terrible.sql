CREATE TABLE "stock_damages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "product_id" uuid NOT NULL,
        "recorded_by_user_id" uuid NOT NULL,
        "product_name" varchar(180) NOT NULL,
        "quantity_damaged" integer NOT NULL,
        "reason" text NOT NULL,
        "notes" text,
        "damaged_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "stock_arrivals"
ADD COLUMN "selling_price_snapshot" numeric(12, 2);
--> statement-breakpoint

/*
 * Existing receipts predate selling-price snapshots.
 * Use each product's current selling price as the migration
 * baseline. All new receipts will save the actual snapshot
 * at the moment stock is received.
 */
UPDATE "stock_arrivals" AS "arrival"
SET "selling_price_snapshot" = "product"."selling_price"
FROM "products" AS "product"
WHERE "product"."id" = "arrival"."product_id";
--> statement-breakpoint

/*
 * Defensive fallback for any historical receipt whose product
 * cannot be resolved. The FK should normally make this unnecessary.
 */
UPDATE "stock_arrivals"
SET "selling_price_snapshot" = '0'
WHERE "selling_price_snapshot" IS NULL;
--> statement-breakpoint

ALTER TABLE "stock_arrivals"
ALTER COLUMN "selling_price_snapshot"
SET DEFAULT '0';
--> statement-breakpoint

ALTER TABLE "stock_arrivals"
ALTER COLUMN "selling_price_snapshot"
SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "stock_damages"
ADD CONSTRAINT "stock_damages_product_id_products_id_fk"
FOREIGN KEY ("product_id")
REFERENCES "public"."products"("id")
ON DELETE restrict
ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "stock_damages"
ADD CONSTRAINT "stock_damages_recorded_by_user_id_users_id_fk"
FOREIGN KEY ("recorded_by_user_id")
REFERENCES "public"."users"("id")
ON DELETE restrict
ON UPDATE no action;
