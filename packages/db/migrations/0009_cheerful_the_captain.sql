CREATE TABLE "money_additions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
