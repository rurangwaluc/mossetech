ALTER TABLE "products" ALTER COLUMN "customer_type" SET DEFAULT 'Unisex';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "age_stage" varchar(60);