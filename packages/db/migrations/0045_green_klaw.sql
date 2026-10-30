CREATE TABLE "external_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_name" varchar(160),
	"created_by_user_id" uuid NOT NULL,
	"product_name" varchar(180) NOT NULL,
	"quantity" integer NOT NULL,
	"agreed_supplier_total" numeric(12, 2) NOT NULL,
	"customer_total" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_sales_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "external_sales_quantity_positive" CHECK ("external_sales"."quantity" > 0),
	CONSTRAINT "external_sales_supplier_total_nonnegative" CHECK ("external_sales"."agreed_supplier_total" >= 0),
	CONSTRAINT "external_sales_customer_total_nonnegative" CHECK ("external_sales"."customer_total" >= 0),
	CONSTRAINT "external_sales_status_valid" CHECK ("external_sales"."status" IN ('DRAFT', 'POSTED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "external_sales" ADD CONSTRAINT "external_sales_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sales" ADD CONSTRAINT "external_sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sales" ADD CONSTRAINT "external_sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;