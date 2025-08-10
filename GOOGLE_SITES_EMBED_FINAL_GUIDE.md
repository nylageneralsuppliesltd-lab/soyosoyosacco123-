# Google Sites Embedding - Complete Guide

## ✅ Connection Issue Fixed

**Problem Identified**: Widget couldn't connect because:
1. API URL was set to `window.location.origin` (Google Sites URL)
2. CORS was not enabled on the server
3. No connection diagnostics

**Solutions Applied**:
1. ✅ Fixed API URL to use deployed Replit URL
2. ✅ Added CORS middleware to server for cross-origin requests
3. ✅ Created improved widget with connection testing

## 📁 Updated Files

### 1. Server CORS Fix (`server/index.ts`)
Added CORS middleware:
```javascript
// Enable CORS for all routes to support embedding in Google Sites
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});
```

### 2. Updated Widget Files
- `public/embed-chat.html` - Original fixed with correct API URL
- `public/embed-chat-updated.html` - Enhanced version with connection testing

## 🚀 Deployment Required

**IMPORTANT**: The server changes require redeployment:
1. Redeploy your application on Replit
2. The new CORS settings will be applied
3. Widget will be able to connect from Google Sites

## 📋 Embedding Instructions

### Step 1: Deploy Your Application
1. Click "Deploy" in Replit
2. Use these commands:
   - Build: `node scripts/deploy-build-v2.js`
   - Start: `node start.js`
3. Set environment variables: `DATABASE_URL`, `OPENAI_API_KEY`

### Step 2: Get Your Deployed URL
After deployment, your API will be available at:
- `https://workspace.nylageneralsupp.repl.co` (or similar)

### Step 3: Update Widget (if needed)
The widget is already configured with your API URL:
```javascript
this.apiBaseUrl = 'https://workspace.nylageneralsupp.repl.co';
```

### Step 4: Upload Image to Google Sites
1. Go to Google Sites → Insert → Image
2. Upload: `attached_assets/Screenshot 2025-06-02 085323_1754841331497.png`
3. Copy the Google Sites image URL
4. Update the widget's image src (optional - widget works without this)

### Step 5: Embed in Google Sites
1. In Google Sites page editor
2. Click **Insert** → **Embed** → **Embed code**
3. Copy entire content from `public/embed-chat-updated.html`
4. Paste and click **Insert**

## 🧪 Testing the Connection

The updated widget (`embed-chat-updated.html`) includes:
- ✅ Automatic connection testing on load
- ✅ Connection status indicator
- ✅ Better error messages
- ✅ CORS-compatible configuration

## 🔧 Troubleshooting

### If Widget Still Won't Connect:

1. **Check Deployment Status**
   - Ensure your Replit app is deployed and running
   - Test API directly: `https://your-deployed-url.repl.co`

2. **Verify CORS Headers**
   - Open browser developer tools (F12)
   - Check Network tab for CORS errors
   - Look for "Access-Control-Allow-Origin" header

3. **Test API Endpoint**
   ```bash
   curl -X POST https://your-deployed-url.repl.co/api/chat \
   -H "Content-Type: application/json" \
   -d '{"message":"test","conversationId":null}'
   ```

4. **Update API URL**
   - If deployment URL changed, update the `apiBaseUrl` in the widget

## 📞 Support

If the widget still won't connect after redeployment:
1. Check console logs in browser (F12 → Console)
2. Verify deployment URL is accessible
3. Test with `embed-chat-updated.html` which has better diagnostics

## 🎯 Final Steps

**To complete the fix:**
1. **Redeploy your application** (crucial for CORS fix)
2. **Use `embed-chat-updated.html`** for Google Sites
3. **Test connection** using the widget's built-in diagnostics

The widget will show connection status and should now work properly in Google Sites.