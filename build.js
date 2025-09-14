#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Starting SOYOSOYO SACCO Assistant build process...');

// Ensure we have the necessary environment
process.env.NODE_ENV = 'production';

try {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('🔧 Running audit fix...');
  execSync('npm audit fix', { stdio: 'inherit' });
  
  console.log('🗄️  Pushing database schema...');
  execSync('npx drizzle-kit push', { stdio: 'inherit' });
  
  console.log('🏗️  Building frontend with Vite...');
  execSync('vite build', { stdio: 'inherit' });
  
  console.log('📦 Building backend with ESBuild...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  // Verify build output
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    console.log('✅ Build completed successfully!');
    console.log('📁 Output directory:', distPath);
  } else {
    throw new Error('Build output not found in dist directory');
  }
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}