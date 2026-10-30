CREATE TABLE "external_customer_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"external_sale_id" uuid NOT NULL,
	"received_by_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"notes" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_customer_payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "external_customer_payment_amount_positive" CHECK ("external_customer_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "external_supplier_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"external_sale_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"paid_by_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"notes" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_supplier_settlements_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "external_supplier_settlement_amount_positive" CHECK ("external_supplier_settlements"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "external_customer_payments" ADD CONSTRAINT "external_customer_payments_external_sale_id_external_sales_id_fk" FOREIGN KEY ("external_sale_id") REFERENCES "public"."external_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_customer_payments" ADD CONSTRAINT "external_customer_payments_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_supplier_settlements" ADD CONSTRAINT "external_supplier_settlements_external_sale_id_external_sales_id_fk" FOREIGN KEY ("external_sale_id") REFERENCES "public"."external_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_supplier_settlements" ADD CONSTRAINT "external_supplier_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_supplier_settlements" ADD CONSTRAINT "external_supplier_settlements_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;