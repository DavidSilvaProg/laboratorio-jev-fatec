import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const apiKeys = sqliteTable("api_keys", {
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.provider] })]);
