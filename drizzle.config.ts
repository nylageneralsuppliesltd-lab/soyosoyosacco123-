import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql", // Use 'postgresql' instead of 'pg'
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Matches DATABASE_URL environment variable
  },
} satisfies Config;
