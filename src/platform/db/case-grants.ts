import { requireTenancyGrantConfiguration } from "./tenancy-grants.ts";

export function requireCaseGrantConfiguration(environment: Readonly<Record<string, string | undefined>>) {
  try {
    const configuration = requireTenancyGrantConfiguration(environment);
    if ([configuration.runtimeUrl, configuration.migrationUrl].some((url) => new URL(url).search !== "")) throw new Error();
    return configuration;
  } catch {
    throw new Error("Case grants require separate non-helper roles on one database without URL query options; details redacted.");
  }
}
