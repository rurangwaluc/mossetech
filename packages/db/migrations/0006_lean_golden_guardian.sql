CREATE TABLE "stock_arrivals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(180) NOT NULL,
	"quantity_received" integer NOT NULL,
	"buying_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"supplier_name" varchar(160),
	"batch_number" varchar(80),
	"expiry_date" date,
	"reference" varchar(120),
	"notes" text,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_arrivals" ADD CONSTRAINT "stock_arrivals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;