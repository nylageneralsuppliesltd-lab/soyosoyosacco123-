#!/usr/bin/env node

/**
 * Custom start script for production deployment
 * Handles database migrations at runtime before starting the server
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function start() {
  console.log('🚀 Starting production deployment...');
  
  try {
    // Verify build outputs exist first
    const { existsSync, readdirSync } = await import('fs');
    if (!existsSync('dist/index.js')) {
      console.error('❌ Built server not found. Run build command first.');
      process.exit(1);
    }
    if (!existsSync('dist/public')) {
      console.error('❌ Built client not found. Run build command first.');
      process.exit(1);
    }
    if (!existsSync('dist/public/index.html')) {
      console.error('❌ Frontend index.html not found. Build may have failed.');
      process.exit(1);
    }
    
    // Log build contents for debugging
    console.log('📂 Frontend build contents:');
    try {
      const files = readdirSync('dist/public', { recursive: true });
      files.slice(0, 10).forEach(file => console.log(`   ${file}`));
      if (files.length > 10) console.log(`   ... and ${files.length - 10} more files`);
    } catch (err) {
      console.warn('Could not list build contents:', err.message);
    }
    
    // Check for required environment variables
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is required for production');
      console.error('💡 Ensure DATABASE_URL is set in deployment secrets');
      process.exit(1);
    }

    console.log('🗄️ Running database migrations...');
    console.log('🔗 Database connection:', process.env.DATABASE_URL ? 'Available' : 'Missing');
    
    // Run database migrations with proper environment setup
    try {
      await execAsync('npx drizzle-kit push --config=drizzle.config.ts --force', {
        env: { ...process.env, NODE_ENV: 'production' }
      });
    } catch (pushError) {
      console.log('⚠️ Push failed, trying migrate command...');
      try {
        await execAsync('npx drizzle-kit migrate --config=drizzle.config.ts', {
          env: { ...process.env, NODE_ENV: 'production' }
        });
      } catch (migrateError) {
        console.error('❌ Both push and migrate failed:', migrateError.message);
        throw migrateError;
      }
    }
    console.log('✅ Database migrations completed successfully');

    console.log('🌐 Starting production server...');
    
    // Start the production server with proper process handling
    const serverProcess = exec('node dist/index.js', {
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    serverProcess.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code);
      }
    });
    
    // Handle shutdown signals
    process.on('SIGTERM', () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully');
      serverProcess.kill('SIGTERM');
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 Received SIGINT, shutting down gracefully');
      serverProcess.kill('SIGINT');
    });
    
  } catch (error) {
    console.error('❌ Production startup failed:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   - Verify DATABASE_URL is correctly set');
    console.error('   - Ensure OPENAI_API_KEY is configured if using AI features');
    console.error('   - Check that build completed successfully');
    process.exit(1);
  }
}

start();