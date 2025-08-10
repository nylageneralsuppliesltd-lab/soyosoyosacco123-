# Deployment Manual Configuration Required

## 🚨 Action Required: Update Deployment Configuration

Your deployment is currently failing because it's using npm scripts that include database operations during build time. The fix is ready, but requires manual configuration.

## 🔧 What You Need to Do

### 1. Update Your Replit Deployment Configuration

**In your Replit project:**
1. Go to the **Deployments** tab
2. Click **Configure** or **Settings**
3. Update the commands:

**Change FROM:**
- Build Command: `npm run build`
- Run Command: `npm run start`

**Change TO:**
- Build Command: `node build.js`
- Run Command: `node start.js`

### 2. Why This Fixes the Issues

**Current Problem:** The npm build script runs:
```bash
npm install && npm audit fix && npx drizzle-kit push && vite build && esbuild server/index.ts...
```

This fails because:
- `npm audit fix` causes dependency conflicts during deployment
- `npx drizzle-kit push` requires DATABASE_URL which isn't available during build
- Mixing build-time and runtime operations

**The Fix:** Custom scripts separate concerns:

**build.js (Build-time only):**
- ✅ npm install
- ✅ vite build (frontend)
- ✅ esbuild (backend)
- ❌ NO database operations
- ❌ NO audit fix

**start.js (Runtime only):**
- ✅ Database migrations (when DATABASE_URL is available)
- ✅ Start production server

## 🎯 Quick Reference

Copy these exact commands into your deployment configuration:

```
Build Command: node build.js
Run Command: node start.js
```

## 🔍 Verification

After updating, your deployment logs should show:

**Build Phase:**
```
🔧 Starting build process...
📦 Installing dependencies...
🎨 Building frontend...
🏗️ Building backend...
✅ Build completed successfully!
```

**Start Phase:**
```
🚀 Starting production server...
🗄️ Running database migrations...
🌐 Starting server...
```

## 💡 Alternative: If You Can't Access Deployment Settings

If you can't modify the deployment configuration directly, contact Replit support and reference this document. The custom scripts are ready and working - only the deployment commands need to be updated.

---

**Status:** Fix implemented, manual configuration required ⚠️
**Next Step:** Update deployment commands to use `node build.js` and `node start.js`