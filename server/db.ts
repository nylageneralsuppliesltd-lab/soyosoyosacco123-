import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL: DATABASE_URL environment variable is missing!");
  console.error("Please set DATABASE_URL in your environment variables.");
  process.exit(1);
}

console.log("Database config:", {
  env: process.env.NODE_ENV || 'production',
  hasUrl: !!process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'none',
  finalConnection: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@') : 'none'
});

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);

console.log("✅ Database pool initialized successfully");
