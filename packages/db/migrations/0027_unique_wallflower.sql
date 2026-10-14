CREATE TYPE "public"."offline_operation_status" AS ENUM('PROCESSING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "offline_operations" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(80) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" "offline_operation_status" DEFAULT 'PROCESSING' NOT NULL,
	"result" jsonb,
	"client_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "offline_operations" ADD CONSTRAINT "offline_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;