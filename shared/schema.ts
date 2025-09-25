// shared/schema.ts
import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const summaries = pgTable("summaries", {
  id: varchar("id")
    .primaryKey()
    .defaultRandom(), // unique random ID for each summary

  hash: varchar("hash", { length: 64 })
    .notNull()
    .unique(), // SHA-256 (or other) hash of file contents, ensures deduplication

  summary: text("summary")
    .notNull(), // final AI-generated summary text

  fileName: varchar("file_name", { length: 255 })
    .notNull(), // original file name for traceability

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(), // auto timestamp
});
