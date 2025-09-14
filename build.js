#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Starting SOYOSOYO SACCO Assistant build process...');

// Ensure we have the necessary environment
process.env.NODE_ENV = 'production';

try {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('🔧 Running audit fix...');
  try {
    execSync('npm audit fix', { stdio: 'inherit' });
  } catch (auditError) {
    console.log('⚠️  Audit fix completed with warnings, continuing...');
  }
  
  console.log('🗄️  Pushing database schema...');
  try {
    execSync('npx drizzle-kit push', { stdio: 'inherit' });
  } catch (dbError) {
    console.log('⚠️  Database push failed, continuing with build...');
  }
  
  console.log('🏗️  Building frontend with Vite...');
  execSync('vite build', { stdio: 'inherit' });
  
  console.log('📦 Building backend with ESBuild...');
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
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