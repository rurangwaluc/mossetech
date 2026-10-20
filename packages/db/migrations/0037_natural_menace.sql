ALTER TABLE "products" ADD COLUMN "brand" varchar(120);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model" varchar(160);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "specifications" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "compatibility" text;