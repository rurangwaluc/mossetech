CREATE UNIQUE INDEX "sale_return_items_unique_line_idx" ON "sale_return_items" USING btree ("sale_return_id","original_sale_item_id");--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_quantity_valid_chk" CHECK ("sale_return_items"."quantity_returned" > 0);--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_condition_valid_chk" CHECK ("sale_return_items"."condition" IN ('RESTOCK', 'DAMAGED'));--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_amounts_valid_chk" CHECK (
      "sale_return_items"."unit_price_snapshot" >= 0
      AND "sale_return_items"."unit_cost_snapshot" >= 0
      AND "sale_return_items"."credit_amount" >= 0
    );--> statement-breakpoint
ALTER TABLE "sale_return_refunds" ADD CONSTRAINT "sale_return_refunds_positive_amount_chk" CHECK ("sale_return_refunds"."amount" > 0);--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_amounts_valid_chk" CHECK (
      "sale_returns"."previous_sale_total" >= 0
      AND "sale_returns"."credit_amount" >= 0
      AND "sale_returns"."credit_amount" <= "sale_returns"."previous_sale_total"
    );--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_reason_required_chk" CHECK (length(btrim("sale_returns"."reason")) > 0);