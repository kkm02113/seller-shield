import { sql } from "drizzle-orm";
import {
  drizzle,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.ts";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseConnectionOptions = Readonly<{
  maxConnections?: number;
}>;

export function createDatabaseConnection(
  databaseUrl: string,
  options: DatabaseConnectionOptions = {},
) {
  const client = postgres(databaseUrl, {
    max: options.maxConnections ?? 10,
  });

  return {
    client,
    db: drizzle({ client, schema }),
  };
}

export async function checkDatabaseConnection(
  database: Database,
): Promise<1> {
  const result = await database.execute<{ ok: number }>(
    sql`select 1::integer as ok`,
  );

  if (result[0]?.ok !== 1) {
    throw new Error("Database connectivity check returned an unexpected result.");
  }

  return 1;
}
