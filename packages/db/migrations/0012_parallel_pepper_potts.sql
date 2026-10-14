ALTER TABLE "products" ALTER COLUMN "unit" SET DEFAULT 'piece';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "customer_type" varchar(40) DEFAULT 'Women' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "size" varchar(60);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "color" varchar(80);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "wholesale_price" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "wholesale_min_quantity" integer DEFAULT 0 NOT NULL;