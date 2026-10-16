CREATE TYPE "public"."case_disposition" AS ENUM('LEGITIMATE_RETURN', 'NOT_DISPUTABLE', 'INSUFFICIENT_EVIDENCE', 'DUPLICATE', 'WITHDRAWN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."case_state" AS ENUM('DRAFT', 'GATHERING_EVIDENCE', 'READY_FOR_REVIEW', 'PACKAGE_READY', 'SUBMITTED', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"source_job_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"correlation_id" uuid,
	"display_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "case_events_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "case_events_kind_check" CHECK ("case_events"."event_kind" in ('CASE_CREATED', 'CLAIM_SNAPSHOT_ADDED', 'STATE_CHANGED', 'CASE_CLOSED')),
	CONSTRAINT "case_events_actor_check" CHECK ("case_events"."actor_kind" = 'HUMAN' and "case_events"."actor_user_id" is not null and "case_events"."source_job_id" is null),
	CONSTRAINT "case_events_metadata_check" CHECK ("case_events"."display_metadata" = '{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "case_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"marketplace" text,
	"external_case_reference" text,
	"external_order_reference" text,
	"state" "case_state" DEFAULT 'DRAFT' NOT NULL,
	"closure_disposition" "case_disposition",
	"due_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logically_deleted_at" timestamp with time zone,
	CONSTRAINT "cases_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "cases_closure_check" CHECK (("cases"."state" = 'CLOSED') = ("cases"."closure_disposition" is not null))
);
--> statement-breakpoint
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_label" text,
	"source_url" text,
	"external_claim_reference" text,
	"raw_text" text,
	"raw_payload" jsonb,
	"content_sha256" "bytea" NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"captured_by_user_id" uuid,
	"capture_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_snapshots_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "claim_snapshots_case_id_unique" UNIQUE("tenant_id","case_id","id"),
	CONSTRAINT "claim_snapshots_case_revision_unique" UNIQUE("tenant_id","case_id","revision"),
	CONSTRAINT "claim_snapshots_revision_check" CHECK ("claim_snapshots"."revision" > 0),
	CONSTRAINT "claim_snapshots_source_check" CHECK ("claim_snapshots"."raw_text" is not null or "claim_snapshots"."raw_payload" is not null or "claim_snapshots"."source_url" is not null),
	CONSTRAINT "claim_snapshots_digest_check" CHECK (octet_length("claim_snapshots"."content_sha256") = 32),
	CONSTRAINT "claim_snapshots_source_type_check" CHECK (length(btrim("claim_snapshots"."source_type")) > 0),
	CONSTRAINT "claim_snapshots_capture_method_check" CHECK (length(btrim("claim_snapshots"."capture_method")) > 0)
);
--> statement-breakpoint
ALTER TABLE "claim_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_tenant_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."cases"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_snapshots" ADD CONSTRAINT "claim_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_snapshots" ADD CONSTRAINT "claim_snapshots_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_snapshots" ADD CONSTRAINT "claim_snapshots_tenant_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."cases"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_timeline_idx" ON "case_events" USING btree ("tenant_id","case_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "cases_inbox_idx" ON "cases" USING btree ("tenant_id","state","last_activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cases_order_reference_idx" ON "cases" USING btree ("tenant_id","marketplace","external_order_reference") WHERE "cases"."external_order_reference" is not null;--> statement-breakpoint
CREATE INDEX "cases_case_reference_idx" ON "cases" USING btree ("tenant_id","marketplace","external_case_reference") WHERE "cases"."external_case_reference" is not null;--> statement-breakpoint
CREATE POLICY "case_events_member_select" ON "case_events" AS PERMISSIVE FOR SELECT TO public USING ("case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "case_events"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    ));--> statement-breakpoint
CREATE POLICY "case_events_domain_insert" ON "case_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "case_events"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'OPERATOR')) and "case_events"."actor_user_id" = nullif(current_setting('app.actor_id', true), '')::uuid
      and "case_events"."actor_kind" = 'HUMAN' and "case_events"."event_kind" in ('CASE_CREATED', 'CLAIM_SNAPSHOT_ADDED'));--> statement-breakpoint
CREATE POLICY "cases_member_select" ON "cases" AS PERMISSIVE FOR SELECT TO public USING ("cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "cases"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    ));--> statement-breakpoint
CREATE POLICY "cases_operator_insert" ON "cases" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "cases"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'OPERATOR'))
    and "cases"."created_by_user_id" = nullif(current_setting('app.actor_id', true), '')::uuid and "cases"."state" = 'DRAFT'
    and "cases"."closure_disposition" is null and "cases"."logically_deleted_at" is null);--> statement-breakpoint
CREATE POLICY "cases_operator_update" ON "cases" AS PERMISSIVE FOR UPDATE TO public USING ("cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "cases"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'OPERATOR')) and "cases"."state" in ('DRAFT', 'GATHERING_EVIDENCE')) WITH CHECK ("cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "cases"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'OPERATOR')) and "cases"."state" in ('DRAFT', 'GATHERING_EVIDENCE'));--> statement-breakpoint
CREATE POLICY "claim_snapshots_member_select" ON "claim_snapshots" AS PERMISSIVE FOR SELECT TO public USING ("claim_snapshots"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "claim_snapshots"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    ));--> statement-breakpoint
CREATE POLICY "claim_snapshots_operator_insert" ON "claim_snapshots" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("claim_snapshots"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
    where m.tenant_id = "claim_snapshots"."tenant_id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'
    and m.role in ('OWNER', 'OPERATOR')) and "claim_snapshots"."captured_by_user_id" = nullif(current_setting('app.actor_id', true), '')::uuid);--> statement-breakpoint
-- Drizzle models ENABLE RLS; FORCE is a reviewed SQL-only security invariant.
ALTER TABLE "public"."cases" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."claim_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."case_events" FORCE ROW LEVEL SECURITY;
