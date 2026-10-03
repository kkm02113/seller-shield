import { requireDatabaseUrl, requireMigrationDatabaseUrl } from "./env.ts";

export function requireAuthGrantConfiguration(environment: Readonly<Record<string, string | undefined>>) {
  const runtimeUrl = requireDatabaseUrl(environment);
  const migrationUrl = requireMigrationDatabaseUrl(environment);
  const runtime = new URL(runtimeUrl);
  const migration = new URL(migrationUrl);
  const runtimeRole = decodeURIComponent(runtime.username);
  if (!runtimeRole || runtimeRole === decodeURIComponent(migration.username) ||
      runtime.hostname !== migration.hostname || (runtime.port || "5432") !== (migration.port || "5432") ||
      runtime.pathname !== migration.pathname) {
    throw new Error("Authentication grants require separate roles on the same database.");
  }
  return { runtimeUrl, migrationUrl, runtimeRole };
}
