#!/usr/bin/env node

// Deployment-safe build script that avoids database operations during build
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔧 Starting deployment build process...');

try {
  // Step 1: Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });

  // Step 2: Generate migration files (only if DATABASE_URL is available)
  if (process.env.DATABASE_URL) {
    console.log('🗄️ Generating database migration files...');
    try {
      execSync('npx drizzle-kit generate --config=drizzle.config.ts', { stdio: 'inherit' });
    } catch (migrateError) {
      console.log('⚠️ Migration generation skipped - will run at startup');
    }
  } else {
    console.log('⚠️ DATABASE_URL not available during build - migrations will run at startup');
  }

  // Step 3: Build frontend with Vite
  console.log('🎨 Building frontend...');
  execSync('vite build', { stdio: 'inherit' });

  // Step 4: Build backend with esbuild
  console.log('🏗️ Building backend...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

  // Verify build outputs
  if (!existsSync('dist/index.js')) {
    throw new Error('Backend build failed - dist/index.js not found');
  }

  if (!existsSync('dist/public')) {
    throw new Error('Frontend build failed - dist/public not found');
  }

  console.log('✅ Deployment build completed successfully!');
  console.log('💡 Database migrations will run at startup when DATABASE_URL is available');
  
} catch (error) {
  console.error('❌ Deployment build failed:', error.message);
  process.exit(1);
}