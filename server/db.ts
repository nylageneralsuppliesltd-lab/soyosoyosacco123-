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

// Handle pool errors gracefully without crashing
pool.on('error', (err, client) => {
  console.error(`❌ Database pool error: ${err.message}`);
  console.error('❌ Error details:', {
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    hostname: err.hostname
  });
  // Don't crash the app - just log the error
});

// Handle client connection errors
pool.on('connect', (client) => {
  console.log('✅ New database client connected');
  
  // Handle individual client errors
  client.on('error', (err) => {
    console.error('❌ Database client error:', err.message);
    // Don't throw - just log
  });
});

// Test connection on startup with better error handling
pool.connect()
  .then((client) => {
    console.log("✅ Database connected successfully");
    console.log(`🔗 Connected to: ${new URL(process.env.DATABASE_URL || '').hostname}`);
    client.release();
  })
  .catch((err) => {
    console.error(`❌ Failed to connect to database: ${err.message}`);
    console.error('❌ Connection details:', {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall
    });
    // Don't exit - let the app continue and retry connections as needed
  });

// Handle process termination
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

// Export a function to test database connectivity
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
