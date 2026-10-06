import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Better Auth expects Date values, while existing D1 auth rows store epoch
 * milliseconds. Keep the on-disk BIGINT values unchanged during import and
 * translate only at the Drizzle boundary (including WHERE comparisons).
 */
const epochMilliseconds = customType<{ data: Date; driverData: string }>({
  dataType: () => "bigint",
  toDriver: (value) => String(value.getTime()),
  fromDriver: (value) => new Date(Number(value)),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: epochMilliseconds("created_at").notNull(),
  updatedAt: epochMilliseconds("updated_at").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: epochMilliseconds("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: epochMilliseconds("created_at").notNull(),
    updatedAt: epochMilliseconds("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: epochMilliseconds("access_token_expires_at"),
    refreshTokenExpiresAt: epochMilliseconds("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: epochMilliseconds("created_at").notNull(),
    updatedAt: epochMilliseconds("updated_at").notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: epochMilliseconds("expires_at").notNull(),
    createdAt: epochMilliseconds("created_at").notNull(),
    updatedAt: epochMilliseconds("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  // Unlike the Date columns, Better Auth supplies this counter as a number.
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
