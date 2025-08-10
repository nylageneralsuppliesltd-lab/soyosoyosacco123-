#!/usr/bin/env node

// Separate audit fix script for development use
// This handles npm audit vulnerabilities without affecting production builds

import { execSync } from 'child_process';

console.log('🔧 Running npm audit fix for development...');

try {
  // Run audit fix with force flag to resolve esbuild security issues
  console.log('🛡️ Fixing npm audit vulnerabilities...');
  execSync('npm audit fix --force --legacy-peer-deps', { 
    stdio: 'inherit',
    env: { ...process.env }
  });

  console.log('✅ Audit fix completed successfully!');
  console.log('ℹ️ Note: This may have updated some dependencies with breaking changes.');
  console.log('ℹ️ Test your application thoroughly after running this fix.');
  
} catch (error) {
  console.error('❌ Audit fix failed:', error.message);
  console.log('ℹ️ Some vulnerabilities may require manual intervention or may be false positives.');
  process.exit(1);
}