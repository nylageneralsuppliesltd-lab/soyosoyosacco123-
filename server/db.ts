import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

console.log("🔧 Initializing database connection...");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

// Prevent crashes with graceful error handling
pool.on('error', (err, client) => {
  console.error(`❌ Database pool error: ${err.message}`);
  console.error('❌ Error code:', err.code);
  // Don't crash - just log and continue
});

pool.on('connect', (client) => {
  console.log('✅ Database client connected');
  
  client.on('error', (err) => {
    console.error('❌ Database client error:', err.message);
    // Don't crash - handle gracefully
  });
});

// Test connection without crashing on failure
pool.connect()
  .then((client) => {
    console.log("✅ Database connected successfully");
    console.log(`🔗 Connected to: ${new URL(process.env.DATABASE_URL || '').hostname}`);
    client.release();
  })
  .catch((err) => {
    console.error(`❌ Failed to connect to database: ${err.message}`);
    // Don't exit - let app continue
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, closing database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, closing database pool...');
  await pool.end();  
  process.exit(0);
});

export const db = drizzle(pool);

// Test connectivity function
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connectivity test passed');
    return true;
  } catch (error) {
    console.error('❌ Database connectivity test failed:', error);
    return false;
  }
}
