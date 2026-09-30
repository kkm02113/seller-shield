import "server-only";

import { createDatabaseConnection } from "./connection.ts";
import { requireDatabaseUrl } from "./env.ts";

type RuntimeDatabaseConnection = ReturnType<typeof createDatabaseConnection>;

const databaseGlobal = globalThis as typeof globalThis & {
  sellerShieldDatabase?: RuntimeDatabaseConnection;
};

const connection =
  databaseGlobal.sellerShieldDatabase ??
  createDatabaseConnection(requireDatabaseUrl(process.env));

if (process.env.NODE_ENV !== "production") {
  databaseGlobal.sellerShieldDatabase = connection;
}

export const db = connection.db;
