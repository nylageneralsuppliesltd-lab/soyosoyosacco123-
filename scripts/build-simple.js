#!/usr/bin/env node

// Simple build script for Vercel that avoids complex Vite config issues
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Starting simple build process...');

try {
  // Create basic frontend build
  console.log('📦 Building frontend (simplified configuration)...');
  
  // Use simplified Vite config 
  execSync('npx vite build --config vite.config.simple.js', { stdio: 'inherit' });
  
  // Build backend
  console.log('🔧 Building backend with esbuild...');
  execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}