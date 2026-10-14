CREATE TABLE "email_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(180) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';--> statement-breakpoint
ALTER TABLE "email_otp_challenges" ADD CONSTRAINT "email_otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_otp_challenges_user_created_idx" ON "email_otp_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_otp_challenges_email_created_idx" ON "email_otp_challenges" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "email_otp_challenges_expires_idx" ON "email_otp_challenges" USING btree ("expires_at");