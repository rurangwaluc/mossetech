ALTER TABLE "quotations" ADD COLUMN "reference" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_reference_unique" UNIQUE("reference");