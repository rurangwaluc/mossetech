CREATE UNIQUE INDEX "external_sales_id_supplier_unique" ON "external_sales" USING btree ("id","supplier_id");
--> statement-breakpoint
ALTER TABLE "external_supplier_settlements" ADD CONSTRAINT "external_settlement_sale_supplier_fk" FOREIGN KEY ("external_sale_id","supplier_id") REFERENCES "public"."external_sales"("id","supplier_id") ON DELETE restrict ON UPDATE no action;
