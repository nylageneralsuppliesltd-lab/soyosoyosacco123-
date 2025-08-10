import type { Config } from "drizzle-kit";

export default {
  schema: "./shared/schema.ts", // Updated path
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
