#!/usr/bin/env node

/**
 * Simplified production start script
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function start() {
  console.log('🚀 Starting production server...');
  
  try {
    // Verify build outputs exist
    const { existsSync } = await import('fs');
    if (!existsSync('dist/index.js')) {
      console.error('❌ Built server not found at dist/index.js');
      console.error('💡 Run build command first: node scripts/deploy-build-simple.js');
      process.exit(1);
    }
    if (!existsSync('dist/public')) {
      console.error('❌ Built client not found at dist/public');
      console.error('💡 Run build command first: node scripts/deploy-build-simple.js');
      process.exit(1);
    }
    
    // Check environment variables
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable required');
      process.exit(1);
    }

    // Run database migrations at startup
    console.log('🗄️ Running database migrations...');
    try {
      await execAsync('npx drizzle-kit push --config=drizzle.config.ts --force', {
        env: { ...process.env, NODE_ENV: 'production' }
      });
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      console.log('⚠️ Migration failed, but continuing startup...');
      console.log('Migration error:', migrationError.message);
    }

    // Start the server
    console.log('🎯 Starting application server...');
    const { spawn } = await import('child_process');
    
    const server = spawn('node', ['dist/index.js'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    server.on('error', (err) => {
      console.error('❌ Server failed to start:', err);
      process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 Received SIGTERM, shutting down gracefully...');
      server.kill('SIGTERM');
    });

    process.on('SIGINT', () => {
      console.log('🔄 Received SIGINT, shutting down gracefully...');
      server.kill('SIGINT');
    });

  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
  }
}

start();