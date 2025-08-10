#!/usr/bin/env node

// Custom build script for deployment
// This script handles the build process without requiring DATABASE_URL during build time

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔨 Starting custom build process...');

try {
  // Step 1: Install dependencies with legacy peer deps resolution
  console.log('📦 Installing dependencies...');
  execSync('npm install --legacy-peer-deps', { stdio: 'inherit' });

  // Step 2: Build frontend with Vite
  console.log('🎨 Building frontend...');
  execSync('vite build', { stdio: 'inherit' });

  // Step 3: Bundle backend with esbuild
  console.log('⚙️ Building backend...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });

  // Verify build outputs exist
  if (!existsSync('dist/index.js')) {
    throw new Error('Backend build failed - dist/index.js not found');
  }

  console.log('✅ Build completed successfully!');
  console.log('📁 Backend built to: dist/index.js');
  console.log('🌐 Frontend built to: dist/client/');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}