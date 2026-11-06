CREATE TABLE "referral_reward_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_reward_payments_expense_id_unique" UNIQUE("expense_id"),
	CONSTRAINT "referral_reward_payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "referral_payment_amount_check" CHECK (
    "referral_reward_payments"."amount" > 0
  )
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"referrer_name" varchar(160) NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_rewards_sale_id_unique" UNIQUE("sale_id"),
	CONSTRAINT "referral_reward_amount_check" CHECK (
    "referral_rewards"."amount" > 0 AND "referral_rewards"."paid_amount" >= 0
    AND "referral_rewards"."paid_amount" <= "referral_rewards"."amount"
  ),
	CONSTRAINT "referral_reward_name_check" CHECK (
    length(btrim("referral_rewards"."referrer_name")) > 1
  )
);
--> statement-breakpoint
ALTER TABLE "referral_reward_payments" ADD CONSTRAINT "referral_reward_payments_reward_id_referral_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."referral_rewards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_reward_payments" ADD CONSTRAINT "referral_reward_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_reward_payments" ADD CONSTRAINT "referral_reward_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;