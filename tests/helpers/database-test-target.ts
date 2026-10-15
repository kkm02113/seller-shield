type Environment = Readonly<Record<string, string | undefined>>;

export function assertDatabaseTestTarget(environment: Environment): void {
  try {
    if (!environment.DATABASE_URL) throw new Error();
    const urls = ["DATABASE_URL", "DATABASE_MIGRATION_URL", "DATABASE_TEST_ADMIN_URL"]
      .filter((key) => environment[key] !== undefined)
      .map((key) => new URL(environment[key]!));
    const [runtime] = urls;
    const database = decodeURIComponent(runtime.pathname.slice(1));
    const target = `${runtime.hostname}:${runtime.port || "5432"}/${database}`;
    if (!/^[A-Za-z0-9_-]+$/.test(database) || urls.some((url) =>
      !["postgres:", "postgresql:"].includes(url.protocol) || !url.username || url.search !== "" ||
      url.hostname !== runtime.hostname || (url.port || "5432") !== (runtime.port || "5432") ||
      decodeURIComponent(url.pathname.slice(1)) !== database)) throw new Error();
    if (database.endsWith("_test")) return;
    if (environment.ALLOW_DESTRUCTIVE_DB_TESTS === "1" && environment.DATABASE_TEST_TARGET === target &&
      ["localhost", "127.0.0.1", "[::1]"].includes(runtime.hostname)) return;
  } catch { /* URLs/passwords must not reach test startup errors. */ }
  throw new Error("Unsafe database test target; use a dedicated *_test database or an explicitly confirmed local target.");
}
