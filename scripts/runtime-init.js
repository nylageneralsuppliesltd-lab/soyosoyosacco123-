#!/usr/bin/env node

// Runtime initialization script for database setup
const { execSync } = require('child_process');

console.log('🗃️ Initializing database schema...');

try {
  // Only run if DATABASE_URL is available
  if (process.env.DATABASE_URL) {
    console.log('📊 Pushing database schema...');
    execSync('npx drizzle-kit push', { stdio: 'inherit' });
    console.log('✅ Database schema updated!');
  } else {
    console.log('⚠️ DATABASE_URL not found, skipping schema push');
  }
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  // Don't exit with error - let the app start anyway
  console.log('🔄 Continuing with app startup...');
}