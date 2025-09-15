#!/usr/bin/env node

/**
 * Deployment start wrapper script
 * This script calls the actual deployment start script in the scripts directory
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting deployment via wrapper script...');

try {
  // Execute the actual deploy-start script
  const scriptPath = join(__dirname, 'scripts', 'deploy-start.js');
  execSync(`node ${scriptPath}`, { 
    stdio: 'inherit',
    env: process.env
  });
} catch (error) {
  console.error('❌ Deployment start failed:', error.message);
  process.exit(1);
}