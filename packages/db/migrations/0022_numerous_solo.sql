CREATE TYPE "public"."sale_payment_type" AS ENUM('AT_SALE', 'LATER_PAYMENT');--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"received_by_user_id" uuid,
	"source_debt_payment_id" uuid,
	"payment_type" "sale_payment_type" DEFAULT 'AT_SALE' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"received_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"applied_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"returned_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"return_method" "payment_method",
	"extra_kept_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"extra_reason" text,
	"notes" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_payments_source_debt_payment_id_unique" UNIQUE("source_debt_payment_id")
);
--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_source_debt_payment_id_debt_payments_id_fk" FOREIGN KEY ("source_debt_payment_id") REFERENCES "public"."debt_payments"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
-- BLOOM_KIGALI_SALE_PAYMENT_BACKFILL

/*
 * The ledger must never contain negative money and every
 * payment row must account for every franc received.
 */
ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_non_negative_money_check"
CHECK (
  "received_amount" >= 0
  AND "applied_amount" >= 0
  AND "returned_amount" >= 0
  AND "extra_kept_amount" >= 0
);

--> statement-breakpoint

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_all_received_money_accounted_check"
CHECK (
  "received_amount"
  =
  "applied_amount"
  + "returned_amount"
  + "extra_kept_amount"
);

--> statement-breakpoint

/*
 * Backfill the payment that happened when each existing
 * sale was created.
 *
 * sales.paid_amount is the CURRENT lifetime amount paid,
 * so later debt payments must first be subtracted to
 * recover the amount that was applied at checkout.
 *
 * received_by_user_id stays NULL when the old data cannot
 * prove who received the original payment.
 *
 * For discounted sales, discount_given_by_user_id is a
 * reliable historical proxy because the same logged-in
 * user created that sale and recorded its discount.
 */
WITH "later_totals" AS (
  SELECT
    "sale_id",
    COALESCE(
      SUM("amount"),
      0
    ) AS "later_paid"
  FROM "debt_payments"
  GROUP BY "sale_id"
),
"initial_payments" AS (
  SELECT
    s."id" AS "sale_id",

    s."discount_given_by_user_id"
      AS "received_by_user_id",

    s."payment_method",

    s."amount_received"
      AS "received_amount",

    GREATEST(
      s."paid_amount"
      - COALESCE(
          lt."later_paid",
          0
        ),
      0
    ) AS "applied_amount",

    s."change_returned"
      AS "returned_amount",

    CASE
      WHEN s."change_returned" > 0
        THEN s."payment_method"
      ELSE NULL
    END AS "return_method",

    s."extra_kept"
      AS "extra_kept_amount",

    s."extra_reason",

    s."sale_date"
      AS "paid_at",

    s."created_at"
      AS "created_at"

  FROM "sales" s

  LEFT JOIN "later_totals" lt
    ON lt."sale_id" = s."id"
)

INSERT INTO "sale_payments" (
  "sale_id",
  "received_by_user_id",
  "payment_type",
  "payment_method",
  "received_amount",
  "applied_amount",
  "returned_amount",
  "return_method",
  "extra_kept_amount",
  "extra_reason",
  "paid_at",
  "created_at"
)

SELECT
  "sale_id",
  "received_by_user_id",
  'AT_SALE',
  "payment_method",
  "received_amount",
  "applied_amount",
  "returned_amount",
  "return_method",
  "extra_kept_amount",
  "extra_reason",
  "paid_at",
  "created_at"

FROM "initial_payments"

WHERE
  "received_amount" > 0
  OR "applied_amount" > 0
  OR "returned_amount" > 0
  OR "extra_kept_amount" > 0;

--> statement-breakpoint

/*
 * Existing later unpaid-sale collections already know
 * exactly who received the money and when it happened.
 */
INSERT INTO "sale_payments" (
  "sale_id",
  "received_by_user_id",
  "source_debt_payment_id",
  "payment_type",
  "payment_method",
  "received_amount",
  "applied_amount",
  "returned_amount",
  "return_method",
  "extra_kept_amount",
  "extra_reason",
  "notes",
  "paid_at",
  "created_at"
)

SELECT
  dp."sale_id",
  dp."received_by_user_id",
  dp."id",
  'LATER_PAYMENT',
  dp."payment_method",
  dp."amount",
  dp."amount",
  0,
  NULL,
  0,
  NULL,
  dp."notes",
  dp."paid_at",
  dp."created_at"

FROM "debt_payments" dp

ON CONFLICT ("source_debt_payment_id")
DO NOTHING;
