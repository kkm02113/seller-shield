export function browserServerEnvironment(secret: string, baseURL: string) {
  return {
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: baseURL,
    // Playwright inherits the parent process environment. Empty overrides also
    // prevent Next from loading setup/test-only credentials from .env.local.
    DATABASE_TEST_ADMIN_URL: "",
    DATABASE_PROVISION_URL: "",
    DATABASE_MIGRATION_URL: "",
    ALLOW_DESTRUCTIVE_DB_TESTS: "",
    DATABASE_TEST_TARGET: "",
  };
}
