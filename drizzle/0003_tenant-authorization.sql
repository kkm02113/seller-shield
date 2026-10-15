CREATE POLICY "memberships_actor_select" ON "memberships" AS PERMISSIVE FOR SELECT TO public USING ("memberships"."user_id" = nullif(current_setting('app.actor_id', true), '')::uuid and "memberships"."status" = 'ACTIVE');--> statement-breakpoint
CREATE POLICY "memberships_actor_lock" ON "memberships" AS PERMISSIVE FOR UPDATE TO public USING ("memberships"."user_id" = nullif(current_setting('app.actor_id', true), '')::uuid and "memberships"."status" = 'ACTIVE') WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "memberships_bootstrap_insert" ON "memberships" AS PERMISSIVE FOR INSERT TO "seller_shield_bootstrap" WITH CHECK ("memberships"."user_id" = nullif(current_setting('app.actor_id', true), '')::uuid and "memberships"."created_by_user_id" = nullif(current_setting('app.actor_id', true), '')::uuid
      and "memberships"."role" = 'OWNER' and "memberships"."status" = 'ACTIVE' and "memberships"."revoked_at" is null);--> statement-breakpoint
CREATE POLICY "tenants_member_select" ON "tenants" AS PERMISSIVE FOR SELECT TO public USING (exists (
    select 1 from public.memberships m where m.tenant_id = "tenants"."id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE'));--> statement-breakpoint
CREATE POLICY "tenants_owner_update" ON "tenants" AS PERMISSIVE FOR UPDATE TO public USING ("tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
      where m.tenant_id = "tenants"."id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE' and m.role = 'OWNER')) WITH CHECK ("tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid and exists (select 1 from public.memberships m
      where m.tenant_id = "tenants"."id" and m.user_id = nullif(current_setting('app.actor_id', true), '')::uuid and m.status = 'ACTIVE' and m.role = 'OWNER'));--> statement-breakpoint
CREATE POLICY "tenants_bootstrap_insert" ON "tenants" AS PERMISSIVE FOR INSERT TO "seller_shield_bootstrap" WITH CHECK ("tenants"."created_by_user_id" = nullif(current_setting('app.actor_id', true), '')::uuid);
--> statement-breakpoint
-- Reviewed bootstrap boundary; helper provisioning is not migration ownership.
GRANT USAGE ON SCHEMA public TO seller_shield_bootstrap;
GRANT USAGE ON TYPE public.membership_role TO seller_shield_bootstrap;
GRANT SELECT (user_id, status) ON public.memberships TO seller_shield_bootstrap;
GRANT INSERT (id, name, created_by_user_id) ON public.tenants TO seller_shield_bootstrap;
GRANT INSERT (id, tenant_id, user_id, role, status, created_by_user_id)
  ON public.memberships TO seller_shield_bootstrap;
--> statement-breakpoint
CREATE FUNCTION public.create_first_workspace(workspace_name pg_catalog.text)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $bootstrap$
DECLARE
  actor pg_catalog.uuid;
  workspace pg_catalog.uuid;
  normalized_name pg_catalog.text;
BEGIN
  actor := nullif(pg_catalog.current_setting('app.actor_id', true), '')::pg_catalog.uuid;
  IF actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authenticated actor required.';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Workspace bootstrap requires READ COMMITTED.';
  END IF;
  normalized_name := pg_catalog.btrim(workspace_name);
  IF normalized_name IS NULL OR pg_catalog.char_length(normalized_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid workspace name.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::pg_catalog.text, 20261014));
  IF EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = actor AND m.status = 'ACTIVE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active workspace already exists.';
  END IF;
  workspace := pg_catalog.gen_random_uuid();
  INSERT INTO public.tenants (id, name, created_by_user_id) VALUES (workspace, normalized_name, actor);
  INSERT INTO public.memberships (id, tenant_id, user_id, role, status, created_by_user_id)
    VALUES (pg_catalog.gen_random_uuid(), workspace, actor, 'OWNER', 'ACTIVE', actor);
  RETURN workspace;
END;
$bootstrap$;
--> statement-breakpoint
-- PUBLIC EXECUTE is revoked before commit, not as a later deployment step.
REVOKE ALL ON FUNCTION public.create_first_workspace(text) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO seller_shield_bootstrap;
ALTER FUNCTION public.create_first_workspace(text) OWNER TO seller_shield_bootstrap;
REVOKE CREATE ON SCHEMA public FROM seller_shield_bootstrap;
