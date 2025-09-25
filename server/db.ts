import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error(`❌ Database pool error: ${err.message}`);
});

pool.connect((err) => {
  if (err) {
    console.error(`❌ Failed to connect to database: ${err.message}`);
  } else {
    console.log("✅ Database connected successfully");
  }
});

export const db = drizzle(pool);
