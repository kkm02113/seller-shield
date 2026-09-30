export type DatabaseEnvironment = Readonly<{
  [name: string]: string | undefined;
  DATABASE_URL?: string;
  DATABASE_MIGRATION_URL?: string;
}>;

const postgresProtocols = new Set(["postgres:", "postgresql:"]);

function requirePostgresUrl(name: string, value: string | undefined): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  try {
    const url = new URL(normalized);

    if (!postgresProtocols.has(url.protocol)) {
      throw new Error("Unsupported protocol.");
    }
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  return normalized;
}

export function requireDatabaseUrl(
  environment: DatabaseEnvironment,
): string {
  return requirePostgresUrl("DATABASE_URL", environment.DATABASE_URL);
}

export function requireMigrationDatabaseUrl(
  environment: DatabaseEnvironment,
): string {
  return requirePostgresUrl(
    "DATABASE_MIGRATION_URL",
    environment.DATABASE_MIGRATION_URL,
  );
}
