CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(120) DEFAULT 'Other' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
