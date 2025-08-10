#!/usr/bin/env node

/**
 * Custom start script for production deployment
 * Handles database migrations at runtime before starting the server
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function start() {
  console.log('🚀 Starting production server...');
  
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is not set');
      process.exit(1);
    }

    console.log('🗄️ Running database migrations...');
    await execAsync('npx drizzle-kit push');
    console.log('✅ Database migrations completed');

    console.log('🏃‍♂️ Starting server...');
    
    // Verify build outputs exist
    const { existsSync } = await import('fs');
    if (!existsSync('dist/index.js')) {
      console.error('❌ Built server not found. Build failed or incomplete.');
      process.exit(1);
    }
    if (!existsSync('dist/client')) {
      console.error('❌ Built client not found. Build failed or incomplete.');
      process.exit(1);
    }
    
    // Start the production server using execSync for proper signal handling
    console.log('🌐 Starting production server...');
    await execAsync('node dist/index.js', {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit'
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
}

start();