import {
  checkDatabaseConnection,
  createDatabaseConnection,
} from "../src/platform/db/connection.ts";
import { requireDatabaseUrl } from "../src/platform/db/env.ts";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env.ts";

loadDatabaseEnvironment();

async function main() {
  const connection = createDatabaseConnection(requireDatabaseUrl(process.env), {
    maxConnections: 1,
  });

  try {
    await checkDatabaseConnection(connection.db);
    console.log("Database connectivity check passed.");
  } finally {
    await connection.client.end({ timeout: 5 });
  }
}

main().catch(() => {
  console.error(
    "Database connectivity check failed. Verify DATABASE_URL and PostgreSQL availability.",
  );
  process.exitCode = 1;
});
