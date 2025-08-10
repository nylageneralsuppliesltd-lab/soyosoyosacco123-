#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🚀 Starting production server...');

try {
  // Check if built files exist
  if (!existsSync('dist/index.js')) {
    console.error('❌ Built server not found. Run build first.');
    process.exit(1);
  }

  // Step 1: Run database migrations
  console.log('🗄️ Running database migrations...');
  execSync('npx drizzle-kit push', { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  // Step 2: Start the production server
  console.log('🌐 Starting server...');
  execSync('node dist/index.js', { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
} catch (error) {
  console.error('❌ Server start failed:', error.message);
  process.exit(1);
}