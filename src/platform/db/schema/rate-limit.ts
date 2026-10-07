import { bigint, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

// Vendor-owned Better Auth rateLimit storage. Never put custom email keys here.
export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).$defaultFn(() => Date.now()).notNull(),
});
