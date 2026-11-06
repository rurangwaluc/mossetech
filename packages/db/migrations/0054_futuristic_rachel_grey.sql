CREATE TABLE "sale_return_customer_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_return_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"remaining_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_return_customer_credits_sale_return_id_unique" UNIQUE("sale_return_id"),
	CONSTRAINT "sale_return_customer_credits_amount_valid_chk" CHECK (
    "sale_return_customer_credits"."amount" > 0 AND "sale_return_customer_credits"."remaining_amount" >= 0
    AND "sale_return_customer_credits"."remaining_amount" <= "sale_return_customer_credits"."amount"
  )
);
--> statement-breakpoint
ALTER TABLE "sale_return_customer_credits" ADD CONSTRAINT "sale_return_customer_credits_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_customer_credits" ADD CONSTRAINT "sale_return_customer_credits_sale_return_id_sale_returns_id_fk" FOREIGN KEY ("sale_return_id") REFERENCES "public"."sale_returns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_customer_credits" ADD CONSTRAINT "sale_return_customer_credits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_customer_credits" ADD CONSTRAINT "sale_return_customer_credits_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;