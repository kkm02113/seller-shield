import { describe, expect, it } from "vitest";

import {
  checkDatabaseConnection,
  createDatabaseConnection,
} from "../src/platform/db/connection";
import { requireDatabaseUrl } from "../src/platform/db/env";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env";

loadDatabaseEnvironment();

describe("PostgreSQL connectivity", () => {
  it("executes SELECT 1 through the real PostgreSQL driver", async () => {
    const connection = createDatabaseConnection(
      requireDatabaseUrl(process.env),
      { maxConnections: 1 },
    );

    try {
      await expect(checkDatabaseConnection(connection.db)).resolves.toBe(1);
    } finally {
      await connection.client.end({ timeout: 5 });
    }
  });
});
