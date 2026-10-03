import "server-only";

import { requireAuthEnvironment } from "./env.ts";
import { createAuthentication } from "./factory.ts";

let authentication: ReturnType<typeof createAuthentication> | undefined;

export async function getAuth() {
  if (authentication) return authentication;
  const environment = requireAuthEnvironment(process.env);
  // Public shell builds do not initialize authentication or connect to PostgreSQL.
  const { db } = await import("../db/client.ts");
  authentication ??= createAuthentication(db, environment);
  return authentication;
}
