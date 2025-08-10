#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('🔧 Starting build process...');

try {
  // Step 1: Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });

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

  console.log('✅ Build completed successfully!');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}