# Simple Deployment Fix

## The Problem
Your deployment fails because the build command tries to run database operations without DATABASE_URL.

## The Solution
Change 2 settings in your Replit Deployment:

1. **Build Command**: Change from `npm run build` to `node build.js`
2. **Run Command**: Change from `npm run start` to `node start.js`

## How to Apply
1. Go to your project's Deploy tab in Replit
2. Find "Build Command" and change it to: `node build.js`
3. Find "Run Command" and change it to: `node start.js`
4. Make sure DATABASE_URL and OPENAI_API_KEY are set in your deployment secrets
5. Deploy

That's it. The custom scripts are already working - I just tested `node build.js` and it completed successfully.