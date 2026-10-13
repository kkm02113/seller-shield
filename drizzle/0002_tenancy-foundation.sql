CREATE TYPE "public"."membership_role" AS ENUM('OWNER', 'OPERATOR', 'REVIEWER');--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	CONSTRAINT "memberships_tenant_user_unique" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "memberships_status_check" CHECK ("memberships"."status" in ('ACTIVE', 'REVOKED')),
	CONSTRAINT "memberships_revocation_check" CHECK (("memberships"."status" = 'ACTIVE' and "memberships"."revoked_at" is null) or ("memberships"."status" = 'REVOKED' and "memberships"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- FORCE is explicit reviewed SQL: the pinned Drizzle snapshot tracks ENABLE only.
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_name_check" CHECK (char_length("tenants"."name") between 1 and 80 and "tenants"."name" = btrim("tenants"."name"))
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_status_tenant_idx" ON "memberships" USING btree ("user_id","status","tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_status_role_idx" ON "memberships" USING btree ("tenant_id","status","role");
