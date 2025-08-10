# Google Sites Upload Guide for SOYOSOYO SACCO Chat Widget

## 📁 Files You Need to Upload

### Required Files:
1. **embed-chat.html** - The complete chat widget
2. **Screenshot 2025-06-02 085323_1754841331497.png** - Your avatar image

### Optional Files:
3. **SOYOSOYO BY LAWS -2025_1754774335855.pdf** - Your SACCO documents
4. **loan policy_1754774281152.pdf** - Your loan policies

## 🌐 Step-by-Step Google Sites Upload Process

### Step 1: Access Google Sites
1. Go to [sites.google.com](https://sites.google.com)
2. Sign in with your Google account
3. Open your existing site or create a new one

### Step 2: Upload the Avatar Image
1. In Google Sites editor, click **"Insert"** in the toolbar
2. Select **"Image"** from the menu
3. Click **"Upload"** tab
4. Upload your avatar file: `Screenshot 2025-06-02 085323_1754841331497.png`
5. After upload, **right-click the image** and select **"Copy image address"**
6. **Save this URL** - you'll need it for the next step

### Step 3: Update the HTML File
1. Open `embed-chat.html` in a text editor
2. Find line 301 that contains:
   ```html
   <img src="attached_assets/Screenshot 2025-06-02 085323_1754841331497.png" alt="SOYOSOYO SACCO Assistant">
   ```
3. Replace it with your Google Sites image URL:
   ```html
   <img src="https://lh3.googleusercontent.com/your-image-id" alt="SOYOSOYO SACCO Assistant">
   ```

### Step 4: Upload the HTML Widget
1. In Google Sites, go to the page where you want the chat widget
2. Click **"Insert"** in the toolbar
3. Select **"Embed"** from the menu
4. Choose **"Embed code"** tab
5. Copy and paste the entire content of your updated `embed-chat.html` file
6. Click **"Insert"**

### Step 5: Position the Widget
1. The chat widget will appear as a fixed element on the right side
2. It will automatically position itself and follow scroll
3. Test by scrolling the page - the widget should stay in place

## 🔧 Alternative Method: File Manager Upload

### If Google Sites has a file manager:
1. Look for **"File Cabinet"** or **"Files"** in your Google Sites
2. Upload both `embed-chat.html` and the avatar image
3. Get the public URLs for both files
4. Update the image src in the HTML to point to the Google Sites file URL
5. Embed the HTML file using an iframe:
   ```html
   <iframe src="https://sites.google.com/your-site/files/embed-chat.html" 
           width="100%" height="100vh" frameborder="0"
           style="position: fixed; top: 0; left: 0; z-index: 1000; pointer-events: none;">
   </iframe>
   ```

## 📱 Testing Your Widget

### After Upload:
1. **View your published site** (not the editor)
2. **Check the right side** for the floating chat button
3. **Scroll the page** to confirm the button follows
4. **Click the avatar** to open the chat window
5. **Test a conversation** by asking about SACCO services

### Troubleshooting:
- **Image not showing?** Check the image URL is correct and publicly accessible
- **Widget not appearing?** Verify the HTML was pasted correctly in the embed code
- **Not responsive?** Make sure you're viewing the published site, not the editor

## 🎯 Production Setup

### For Live SACCO Website:
1. **Deploy your backend API** to a web hosting service
2. **Update the API URL** in the HTML file (line 152):
   ```javascript
   this.apiBaseUrl = "https://your-sacco-api.com"; // Replace with your API URL
   ```
3. **Upload the updated files** to Google Sites
4. **Test with real SACCO questions** to ensure document integration works

## 🔐 Security Considerations

### For Production Use:
- Ensure your avatar image is appropriate for professional use
- Test the chat responses to ensure they align with SACCO policies
- Consider adding contact information for complex queries
- Monitor chat usage and responses for quality assurance

## ✅ Final Checklist

- [ ] Avatar image uploaded to Google Sites
- [ ] Image URL copied and saved
- [ ] HTML file updated with correct image URL
- [ ] HTML embedded in Google Sites page
- [ ] Widget appears and functions on published site
- [ ] Chat responses work correctly
- [ ] Widget follows scroll as expected
- [ ] Mobile responsiveness tested

Your SOYOSOYO SACCO chat widget will now be live on Google Sites and accessible to all visitors!