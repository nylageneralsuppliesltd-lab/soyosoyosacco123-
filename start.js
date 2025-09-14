#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting SOYOSOYO SACCO Assistant production server...');

// Ensure we have the necessary environment
process.env.NODE_ENV = 'production';

try {
  const distPath = path.join(__dirname, 'dist', 'index.js');
  
  if (!fs.existsSync(distPath)) {
    console.log('📦 Build not found, running build process...');
    execSync('node build.js', { stdio: 'inherit' });
  }
  
  if (fs.existsSync(distPath)) {
    console.log('✅ Starting production server...');
    execSync('npm start', { 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
  } else {
    throw new Error('Production build not found after build process');
  }
  
} catch (error) {
  console.error('❌ Server start failed:', error.message);
  process.exit(1);
}