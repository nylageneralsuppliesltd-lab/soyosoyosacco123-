# API Deployment Instructions for Google Sites Integration

## 🚨 **Important: Google Sites Cannot Host APIs**

Google Sites only hosts **static content** (HTML, CSS, JavaScript, images). It **cannot run** your Node.js backend API.

## 🎯 **Solution: Deploy API Separately**

### **Step 1: Deploy Your API to Replit**
1. **Click the "Deploy" button** in your Replit workspace (top toolbar)
2. Choose **"Autoscale Deployment"** 
3. Configure settings:
   - **Machine Power**: Shared vCPU 1X (sufficient for SACCO chat)
   - **Max Instances**: 3-5 (handles multiple users)
   - **Run Command**: `npm run start` (or `npm run dev`)
4. Click **"Deploy"**
5. **Copy your deployment URL** (looks like: `https://your-project-name.replit.app`)

### **Step 2: Update Your Widget**
1. Open `public/embed-chat.html`
2. Find line 383 and update it:
   ```javascript
   // Replace this:
   this.apiBaseUrl = window.location.origin;
   
   // With your deployed URL:
   this.apiBaseUrl = "https://your-project-name.replit.app";
   ```

### **Step 3: Upload to Google Sites**
1. **Upload your avatar image** to Google Sites
2. **Copy the image URL** from Google Sites
3. **Update the image src** in the HTML file (line 301)
4. **Embed the complete HTML** in Google Sites using "Custom HTML"

## 🌐 **Alternative Deployment Options**

### **Option A: Replit Deployments (Recommended)**
- **Pros**: Easy setup, automatic scaling, integrated with your project
- **Cost**: Free tier available, then ~$7-20/month
- **Setup**: One-click deployment

### **Option B: Vercel**
- **Pros**: Free tier, great performance
- **Cost**: Free for small usage
- **Setup**: Connect GitHub, deploy automatically

### **Option C: Netlify Functions**
- **Pros**: Serverless functions, free tier
- **Cost**: Free for basic usage
- **Setup**: Deploy functions separately

### **Option D: Heroku**
- **Pros**: Simple deployment, many tutorials available
- **Cost**: ~$7+/month (no free tier anymore)
- **Setup**: Git-based deployment

## 📋 **Complete Integration Process**

### **Phase 1: Deploy API**
```
✅ Deploy backend to web hosting
✅ Get public API URL
✅ Test API endpoints work
```

### **Phase 2: Update Widget**
```
✅ Update apiBaseUrl in embed-chat.html
✅ Update avatar image path
✅ Test widget connects to API
```

### **Phase 3: Google Sites Integration**
```
✅ Upload avatar to Google Sites
✅ Get Google Sites image URL
✅ Update HTML with image URL
✅ Embed HTML in Google Sites
```

## 🔧 **Configuration Example**

After deployment, your `embed-chat.html` should look like:

```javascript
// Line 383 - API URL
this.apiBaseUrl = "https://soyosoyo-sacco-api.replit.app";
```

```html
<!-- Line 301 - Avatar Image -->
<img src="https://lh3.googleusercontent.com/your-google-sites-image" alt="SOYOSOYO SACCO Assistant">
```

## 🎯 **Why This Approach Works**

1. **API runs on cloud hosting** - Handles SACCO document processing, AI responses
2. **Widget runs on Google Sites** - Professional appearance on your website
3. **They communicate via HTTPS** - Secure connection between widget and API
4. **Full functionality** - Members get accurate SACCO information

## 💡 **Quick Test**

After deployment:
1. Visit your API URL directly - should show "SOYOSOYO SACCO Assistant API"
2. Test chat on Google Sites - should connect to your deployed API
3. Ask about SACCO services - should provide document-based responses

Your SACCO members will have a professional chat experience with accurate information!