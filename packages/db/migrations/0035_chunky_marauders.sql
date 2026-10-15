CREATE TABLE "employee_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_permissions" ADD CONSTRAINT "employee_permissions_employee_user_id_users_id_fk" FOREIGN KEY ("employee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_permissions_user_permission_unique" ON "employee_permissions" USING btree ("employee_user_id","permission");--> statement-breakpoint
CREATE INDEX "employee_permissions_user_idx" ON "employee_permissions" USING btree ("employee_user_id");