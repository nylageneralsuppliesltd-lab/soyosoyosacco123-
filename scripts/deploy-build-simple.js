#!/usr/bin/env node

/**
 * Simplified deployment build script - NO database operations during build
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

console.log('🔧 Simple deployment build starting...');

function safeExec(command, options = {}) {
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    throw error;
  }
}

try {
  // Step 1: Install dependencies
  console.log('📦 Installing dependencies...');
  safeExec('npm install --no-audit --no-fund');

  // Step 2: Create output directories
  console.log('📁 Creating output directories...');
  if (!existsSync('dist')) {
    mkdirSync('dist', { recursive: true });
  }

  // Step 3: Build frontend only
  console.log('🎨 Building frontend application...');
  safeExec('npx vite build');

  // Step 4: Build backend only
  console.log('🏗️ Building backend server...');
  safeExec('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --target=node18');

  // Step 5: Verify build outputs
  console.log('🔍 Verifying build outputs...');
  const requiredFiles = ['dist/index.js', 'dist/public'];
  
  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      throw new Error(`Build verification failed - ${file} not found`);
    }
  }

  console.log('✅ Simple deployment build completed successfully!');
  console.log('📋 Build outputs ready:');
  console.log('   ✓ Frontend: dist/public/');
  console.log('   ✓ Backend: dist/index.js');
  console.log('   ✓ Database migrations will run at startup');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}