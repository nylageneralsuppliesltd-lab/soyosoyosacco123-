#!/usr/bin/env node
// @ts-check

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Starting SOYOSOYO SACCO Assistant build process...');

// Ensure we have the necessary environment
process.env.NODE_ENV = 'production';

try {
  console.log('📦 Running npm build script...');
  
  // Use the exact npm build command that works
  execSync('npm run build', { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
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