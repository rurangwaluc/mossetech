CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"customer_name" varchar(160) NOT NULL,
	"customer_phone" varchar(40),
	"product_name" varchar(180) NOT NULL,
	"serial_number" varchar(160),
	"covered_quantity" integer DEFAULT 1 NOT NULL,
	"coverage" text NOT NULL,
	"terms" text NOT NULL,
	"start_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warranties_sale_idx" ON "warranties" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "warranties_sale_item_idx" ON "warranties" USING btree ("sale_item_id");