#!/usr/bin/env node
/**
 * Render.com Deployment Build Script
 * 
 * This script separates the build process from database operations
 * to prevent the "drizzle-orm not found" error during Render deployment.
 * 
 * Build Process:
 * 1. Build frontend assets with Vite
 * 2. Build backend bundle with esbuild
 * 3. Skip database migrations during build (will run at startup)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting Render deployment build process...');

try {
  // Verify dependencies are installed
  if (!fs.existsSync('node_modules/drizzle-orm')) {
    console.log('⚠️  Installing dependencies first...');
    execSync('npm install', { stdio: 'inherit' });
  }

  console.log('📦 Building frontend assets with Vite...');
  execSync('npx vite build', { stdio: 'inherit' });

  console.log('🔧 Building backend bundle with esbuild...');
  execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

  // Create a production start script that handles database setup
  console.log('📝 Creating production startup script...');
  const startScript = `#!/usr/bin/env node
/**
 * Production startup script for Render deployment
 * Handles database migrations and server startup
 */

import { execSync } from 'child_process';

async function startProduction() {
  console.log('🚀 Starting SOYOSOYO SACCO Assistant in production...');
  
  try {
    // Run database migrations if DATABASE_URL is available
    if (process.env.DATABASE_URL) {
      console.log('🔄 Running database migrations...');
      execSync('npx drizzle-kit push', { stdio: 'inherit' });
      console.log('✅ Database migrations completed');
    } else {
      console.log('⚠️  No DATABASE_URL found, skipping migrations');
    }

    // Start the server
    console.log('🌟 Starting server...');
    process.env.NODE_ENV = 'production';
    
    // Import and start the server
    await import('./index.js');
    
  } catch (error) {
    console.error('❌ Production startup failed:', error.message);
    process.exit(1);
  }
}

startProduction();
`;

  fs.writeFileSync('dist/start.js', startScript);
  fs.chmodSync('dist/start.js', '755');

  console.log('✅ Render build completed successfully!');
  console.log('');
  console.log('📋 Build Summary:');
  console.log('   • Frontend assets: Built with Vite');
  console.log('   • Backend bundle: Built with esbuild');
  console.log('   • Database migrations: Deferred to startup');
  console.log('   • Start script: Created in dist/start.js');
  console.log('');
  console.log('🔧 Render Configuration:');
  console.log('   • Build Command: node render-build.js');
  console.log('   • Start Command: node dist/start.js');
  console.log('');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}