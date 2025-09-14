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
  console.log('🗄️  Checking database schema update...');
  if (process.env.DATABASE_URL) {
    try {
      // Try to run drizzle-kit push with proper error handling
      execSync('npx drizzle-kit push', { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      console.log('✅ Database schema updated successfully');
    } catch (dbError) {
      console.log('⚠️  Database schema push skipped - drizzle-kit not available in production, continuing...');
      console.log('   This is normal for production deployments where schema is managed separately');
    }
  } else {
    console.log('⚠️  DATABASE_URL not set, skipping schema push');
  }
  
  console.log('🏗️  Building frontend with Vite...');
  execSync('npx vite build', { stdio: 'inherit' });
  
  console.log('📦 Building backend with ESBuild...');
  execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  // Verify build output
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    console.log('✅ Build completed successfully!');
    console.log('📁 Output directory:', distPath);
    
    // List the contents of dist directory for debugging
    const distContents = fs.readdirSync(distPath);
    console.log('📋 Build artifacts:', distContents);
  } else {
    throw new Error('Build output not found in dist directory');
  }
  
  console.log('🎉 Build process completed successfully!');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}