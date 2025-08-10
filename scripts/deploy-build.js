#!/usr/bin/env node

// Deployment-safe build script that avoids database operations during build
import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔧 Starting deployment build process...');

try {
  // Step 1: Install dependencies (without audit fix to avoid conflicts)
  console.log('📦 Installing dependencies...');
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });

  // Step 2: Build frontend with Vite
  console.log('🎨 Building frontend...');
  execSync('vite build', { stdio: 'inherit' });

  // Step 3: Build backend with esbuild
  console.log('🏗️ Building backend...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

  // Verify build outputs
  if (!existsSync('dist/index.js')) {
    throw new Error('Backend build failed - dist/index.js not found');
  }

  if (!existsSync('dist/client')) {
    throw new Error('Frontend build failed - dist/client not found');
  }

  console.log('✅ Deployment build completed successfully!');
  console.log('💡 Database migrations will run at startup when DATABASE_URL is available');
  
} catch (error) {
  console.error('❌ Deployment build failed:', error.message);
  process.exit(1);
}