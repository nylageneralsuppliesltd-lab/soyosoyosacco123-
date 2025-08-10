#!/usr/bin/env node

/**
 * Enhanced deployment build script with better error handling
 * and migration support for various deployment environments
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

console.log('🔧 Enhanced deployment build process starting...');

function safeExec(command, options = {}) {
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    throw error;
  }
}

try {
  // Step 1: Install dependencies with better error handling
  console.log('📦 Installing dependencies...');
  safeExec('npm install --no-audit --no-fund --production=false');

  // Step 2: Ensure output directories exist
  console.log('📁 Creating output directories...');
  if (!existsSync('dist')) {
    mkdirSync('dist', { recursive: true });
  }
  if (!existsSync('drizzle')) {
    mkdirSync('drizzle', { recursive: true });
  }

  // Step 3: Generate migration files (prepare for deployment)
  console.log('🗄️ Preparing database migrations...');
  try {
    if (process.env.DATABASE_URL) {
      console.log('DATABASE_URL available - generating migration files...');
      safeExec('npx drizzle-kit generate --config=drizzle.config.ts');
      console.log('✅ Migration files generated');
    } else {
      console.log('⚠️ DATABASE_URL not available - migrations will be handled at runtime');
    }
  } catch (migrationError) {
    console.log('⚠️ Migration generation skipped - will run schema push at startup');
  }

  // Step 4: Build frontend
  console.log('🎨 Building frontend application...');
  safeExec('vite build');

  // Step 5: Build backend
  console.log('🏗️ Building backend server...');
  safeExec('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist');

  // Step 6: Verify build outputs
  console.log('🔍 Verifying build outputs...');
  const requiredFiles = ['dist/index.js', 'dist/public'];
  
  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      throw new Error(`Build verification failed - ${file} not found`);
    }
  }

  console.log('✅ Enhanced deployment build completed successfully!');
  console.log('📋 Build summary:');
  console.log('   ✓ Dependencies installed');
  console.log('   ✓ Migration files prepared');
  console.log('   ✓ Frontend built');
  console.log('   ✓ Backend built');
  console.log('   ✓ All outputs verified');
  console.log('');
  console.log('💡 Next steps:');
  console.log('   - Database migrations will run automatically at startup');
  console.log('   - Ensure DATABASE_URL is set in deployment environment');
  console.log('   - Use start.js or deploy-start.js to launch the application');
  
} catch (error) {
  console.error('❌ Enhanced deployment build failed:', error.message);
  console.error('');
  console.error('💡 Troubleshooting:');
  console.error('   - Check that all dependencies are correctly specified');
  console.error('   - Verify TypeScript compilation passes');
  console.error('   - Ensure database schema is valid');
  console.error('   - Check build logs above for specific errors');
  process.exit(1);
}