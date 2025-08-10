#!/usr/bin/env node

/**
 * Custom build script for deployment
 * Skips database operations during build process since DATABASE_URL is not available
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function build() {
  console.log('🔧 Starting custom build process...');
  
  try {
    console.log('📦 Installing dependencies...');
    await execAsync('npm install --no-audit --no-fund');
    console.log('✅ Dependencies installed');

    console.log('🏗️ Building frontend with Vite...');
    await execAsync('vite build');
    console.log('✅ Frontend built successfully');

    console.log('📦 Building server with esbuild...');
    await execAsync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist');
    console.log('✅ Server built successfully');

    console.log('✨ Build completed successfully!');
    console.log('📝 Note: Database migrations will run at startup');

    // Verify build outputs exist
    const { existsSync } = await import('fs');
    if (!existsSync('dist/index.js')) {
      throw new Error('Backend build failed - dist/index.js not found');
    }
    if (!existsSync('dist/client')) {
      throw new Error('Frontend build failed - dist/client not found');
    }
    console.log('🔍 Build verification passed');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();