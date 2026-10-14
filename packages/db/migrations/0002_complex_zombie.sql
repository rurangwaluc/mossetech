CREATE TYPE "public"."item_type" AS ENUM('PRODUCT', 'SERVICE');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "item_type" "item_type" DEFAULT 'PRODUCT' NOT NULL;