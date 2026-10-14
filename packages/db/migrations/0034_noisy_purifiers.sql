CREATE TABLE "otp_request_source_limits" (
	"source_hash" varchar(64) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "otp_request_source_limits_expires_idx" ON "otp_request_source_limits" USING btree ("expires_at");