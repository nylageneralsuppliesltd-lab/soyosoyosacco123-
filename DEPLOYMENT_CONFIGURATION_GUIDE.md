# Deployment Configuration Guide

## Overview
The deployment failures you encountered have been resolved with custom build and start scripts. The issue was that the original build process mixed build-time and runtime operations, causing failures during deployment.

## What Was Fixed

### 1. Build Script Issues (Resolved)
- **Problem**: `npm run build` required DATABASE_URL during build time
- **Problem**: `npm audit fix` tried to install packages with breaking changes during build
- **Solution**: Created `build.js` that separates build and runtime operations

### 2. Runtime Script Issues (Resolved)
- **Problem**: Database migrations needed to run at startup, not build time
- **Solution**: Created `start.js` that runs migrations before starting the server

## Required Configuration for Deployment

### Step 1: Configure Deployment Commands
When you deploy on Replit, you need to manually set these commands in the deployment configuration:

**Build Command**: `node build.js`
**Run Command**: `node start.js`

### Step 2: Set Environment Variables
Configure these environment variables in your deployment:

- `DATABASE_URL`: Your PostgreSQL connection string
- `OPENAI_API_KEY`: Your OpenAI API key  
- `NODE_ENV`: Set to "production"

### Step 3: Deployment Process
1. Click the "Deploy" button in Replit
2. In the deployment settings:
   - **Build Command**: Change from `npm run build` to `node build.js`
   - **Run Command**: Change from `npm start` to `node start.js`
   - **Machine Power**: Shared vCPU 1X or higher
3. Add the required environment variables
4. Click "Deploy"

## How the Fix Works

### Build Script (`build.js`)
- Installs dependencies with `--legacy-peer-deps` flag
- Builds frontend with Vite
- Bundles backend with esbuild
- **Does NOT require DATABASE_URL during build**
- **Does NOT run npm audit fix during build**

### Start Script (`start.js`)
- Checks that build files exist
- Runs database migrations with proper environment variables
- Starts the production server
- **Runs at runtime with DATABASE_URL available**

## Files Created/Modified

✅ **build.js**: Custom build script for deployment
✅ **start.js**: Custom start script for production
✅ **audit-fix.js**: Separate script for handling npm vulnerabilities in development
✅ **DEPLOYMENT_FIX.md**: Detailed technical documentation
✅ **replit.md**: Updated with deployment configuration

## Verification Steps

After deployment:
1. Build phase should complete without requiring DATABASE_URL
2. Start phase should run database migrations successfully
3. Application should start and respond to requests
4. All database tables should be created/updated via Drizzle migrations

## Common Issues and Solutions

### If Build Still Fails
- Ensure you're using `node build.js` not `npm run build`
- Check that the build command is correctly set in deployment settings

### If Start Fails
- Verify DATABASE_URL is properly set in environment variables
- Ensure you're using `node start.js` not `npm start`
- Check deployment logs for specific error messages

### If Dependencies Fail
- The build script uses `--legacy-peer-deps` flag to resolve conflicts
- Specific esbuild version conflicts have been resolved in the build script

## Next Steps

1. **Redeploy** your application using the new configuration
2. **Monitor** the build logs to ensure successful compilation
3. **Test** the deployed application to verify functionality
4. **Check** database tables are properly created

The deployment configuration fixes have been applied and documented. You now need to update your Replit deployment settings to use the custom build and start scripts instead of the default npm scripts.