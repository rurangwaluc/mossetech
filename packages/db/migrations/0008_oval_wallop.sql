CREATE TABLE "money_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_payment_method" "payment_method" NOT NULL,
	"to_payment_method" "payment_method" NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
