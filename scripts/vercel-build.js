#!/usr/bin/env node

// Vercel-specific build script that excludes database operations
const { execSync } = require('child_process');

console.log('🚀 Starting Vercel build process...');

try {
  // Build frontend
  console.log('📦 Building frontend with Vite...');
  execSync('vite build', { stdio: 'inherit' });
  
  // Build backend
  console.log('🔧 Building backend with esbuild...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}