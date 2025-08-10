#!/usr/bin/env node

// Production startup script with database migrations
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🚀 Starting production deployment...');

try {
  // Check if built files exist
  if (!existsSync('dist/index.js')) {
    console.error('❌ Built server not found. Build failed or incomplete.');
    process.exit(1);
  }

  if (!existsSync('dist/public')) {
    console.error('❌ Built client not found. Build failed or incomplete.');
    process.exit(1);
  }

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required for production');
    process.exit(1);
  }

  // Step 1: Run database migrations
  console.log('🗄️ Running database migrations...');
  console.log('Database URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');
  
  execSync('npx drizzle-kit push', { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  console.log('✅ Database migrations completed');

  // Step 2: Start the production server
  console.log('🌐 Starting production server...');
  execSync('node dist/index.js', { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
} catch (error) {
  console.error('❌ Production startup failed:', error.message);
  console.error('Check that DATABASE_URL and OPENAI_API_KEY are set correctly');
  process.exit(1);
}