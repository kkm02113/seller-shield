import "server-only";

import { requireAuthEnvironment } from "./env.ts";
import { createAuthentication } from "./factory.ts";

let authentication: ReturnType<typeof createAuthentication> | undefined;

export async function getAuth() {
  if (authentication) return authentication;
  const environment = requireAuthEnvironment(process.env);
  // Public shell builds do not initialize authentication or connect to PostgreSQL.
  const { db } = await import("../db/client.ts");
  authentication ??= createAuthentication(db, environment, {
    async send(message) {
      // Mail secrets are required only at delivery, not for session reads/builds.
      const { requireEmailEnvironment } = await import("../email/env.ts");
      const { createResendEmailSender } = await import("../email/resend.ts");
      await createResendEmailSender(requireEmailEnvironment(process.env)).send(message);
    },
  });
  return authentication;
}
