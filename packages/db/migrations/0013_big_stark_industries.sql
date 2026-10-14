CREATE TYPE "public"."cash_drawer_difference_type" AS ENUM('NONE', 'EXTRA', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."cash_drawer_direction" AS ENUM('IN', 'OUT', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."cash_drawer_movement_type" AS ENUM('OPENING_CASH', 'CASH_SALE', 'CUSTOMER_EXTRA_KEPT', 'CASH_ADDED', 'CASH_REMOVED', 'CASH_DEPOSIT', 'CASH_EXPENSE', 'CLOSING_COUNT', 'CASH_DIFFERENCE');--> statement-breakpoint
CREATE TYPE "public"."cash_drawer_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE "cash_drawer_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawer_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"movement_type" "cash_drawer_movement_type" NOT NULL,
	"direction" "cash_drawer_direction" NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"sale_id" uuid,
	"expense_id" uuid,
	"money_transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_drawers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"closed_by_user_id" uuid,
	"status" "cash_drawer_status" DEFAULT 'OPEN' NOT NULL,
	"opening_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expected_cash_at_close" numeric(12, 2) DEFAULT '0' NOT NULL,
	"counted_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"difference_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"difference_type" "cash_drawer_difference_type" DEFAULT 'NONE' NOT NULL,
	"difference_reason" text,
	"opening_note" text,
	"closing_note" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_drawer_id_cash_drawers_id_fk" FOREIGN KEY ("drawer_id") REFERENCES "public"."cash_drawers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_money_transfer_id_money_transfers_id_fk" FOREIGN KEY ("money_transfer_id") REFERENCES "public"."money_transfers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;