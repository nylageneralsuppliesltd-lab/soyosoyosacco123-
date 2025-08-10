#!/usr/bin/env node

/**
 * Custom build script for deployment
 * Skips database operations during build process since DATABASE_URL is not available
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function build() {
  console.log('🔧 Starting deployment-safe build process...');
  
  try {
    // Step 1: Install dependencies without audit to avoid dependency conflicts
    console.log('📦 Installing dependencies...');
    await execAsync('npm install --no-audit --no-fund --production=false');
    console.log('✅ Dependencies installed');

    // Step 2: Build frontend with Vite (no database required)
    console.log('🎨 Building frontend with Vite...');
    await execAsync('vite build');
    console.log('✅ Frontend built successfully');

    // Step 3: Build backend with esbuild (avoiding vulnerabilities by using latest options)
    console.log('🏗️ Building backend with esbuild...');
    await execAsync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --target=node18 --sourcemap');
    console.log('✅ Backend built successfully');

    // Verify build outputs exist
    const { existsSync } = await import('fs');
    if (!existsSync('dist/index.js')) {
      throw new Error('Backend build failed - dist/index.js not found');
    }
    if (!existsSync('dist/public')) {
      throw new Error('Frontend build failed - dist/public not found');
    }
    
    // Verify key frontend files exist
    if (!existsSync('dist/public/index.html')) {
      throw new Error('Frontend build incomplete - index.html not found in dist/public');
    }
    
    // Check for main.tsx or compiled JS files
    const { readdirSync } = await import('fs');
    const publicFiles = readdirSync('dist/public', { recursive: true });
    const hasJsFiles = publicFiles.some(file => file.toString().endsWith('.js'));
    if (!hasJsFiles) {
      console.warn('⚠️ Warning: No JavaScript files found in build output');
      console.warn('📂 Build contents:', publicFiles);
    }
    
    console.log('✨ Build completed successfully!');
    console.log('📝 Note: Database operations will run at startup when DATABASE_URL is available');
    console.log('🔒 Build process completed without requiring DATABASE_URL or audit operations');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    console.error('💡 Troubleshooting tips:');
    console.error('   - Ensure all dependencies are compatible');
    console.error('   - Check for TypeScript errors with: npm run check');
    console.error('   - Verify esbuild version compatibility');
    process.exit(1);
  }
}

build();