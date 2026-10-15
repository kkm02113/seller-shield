import { requireAuthGrantConfiguration } from "./auth-grants.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export const BOOTSTRAP_ROLE = "seller_shield_bootstrap";

export function requireTenancyGrantConfiguration(environment: Environment) {
  const configuration = requireAuthGrantConfiguration(environment);
  if ([configuration.runtimeRole, decodeURIComponent(new URL(configuration.migrationUrl).username)].includes(BOOTSTRAP_ROLE)) {
    throw new Error("Tenancy helper must be separate from runtime and migration roles.");
  }
  return configuration;
}

export function requireTenancyProvisionConfiguration(environment: Environment) {
  const configuration = requireTenancyGrantConfiguration(environment);
  try {
    const provisionUrl = environment.DATABASE_PROVISION_URL;
    if (!provisionUrl) throw new Error();
    const provision = new URL(provisionUrl);
    const migration = new URL(configuration.migrationUrl);
    const migrationRole = decodeURIComponent(migration.username);
    const provisionRole = decodeURIComponent(provision.username);
    if (!["postgres:", "postgresql:"].includes(provision.protocol) || !provisionRole ||
      [configuration.runtimeRole, migrationRole, BOOTSTRAP_ROLE].includes(provisionRole) ||
      provision.hostname !== migration.hostname || (provision.port || "5432") !== (migration.port || "5432") ||
      provision.pathname !== migration.pathname) throw new Error();
    return { ...configuration, provisionUrl, migrationRole };
  } catch {
    throw new Error("Tenancy provisioning requires an explicit separate administrator on the same database; details redacted.");
  }
}
