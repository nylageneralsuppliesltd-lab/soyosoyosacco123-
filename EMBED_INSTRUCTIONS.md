# SOYOSOYO SACCO Chat Widget - Embedding Instructions

## 🎯 Quick Access Links

1. **Widget Preview**: http://localhost:5000/chat
2. **Google Sites Embed**: http://localhost:5000/embed-chat.html
3. **Dashboard**: http://localhost:5000

## 📋 How to Embed in Google Sites

### Method 1: Direct HTML Embed
1. Copy the file: `public/embed-chat.html`
2. Upload to Google Sites as an HTML embed
3. The widget will appear as a light green floating chat button

### Method 2: Iframe Embed
Add this code to your Google Site:
```html
<iframe 
  src="http://localhost:5000/embed-chat.html" 
  width="100%" 
  height="500px" 
  frameborder="0">
</iframe>
```

### Method 3: Custom HTML Block
In Google Sites, add an "HTML" block and paste the content from `embed-chat.html`

## 🎨 Widget Features

### Visual Design
- **Light green chat button** (#22c55e)
- **SACCO logo and branding**
- **Animated pulse effect**
- **Professional chat interface**
- **Mobile responsive**

### Functionality
- **Document-based responses** from uploaded SACCO files
- **Conversation memory** within session
- **Typing indicators**
- **Error handling** with fallback messages
- **References to soyosoyosacco.com**

## 🔧 Customization Options

### Change API URL
Edit line 152 in `embed-chat.html`:
```javascript
this.apiBaseUrl = "https://your-domain.com"; // Change this to your deployed API
```

### Customize Colors
Update CSS variables in `embed-chat.html`:
```css
/* Change the green color */
background: #22c55e; /* Your brand color */
```

### Logo Customization
Replace the SVG logo in the `SaccoLogo` sections with your own logo.

## 📱 Testing the Widget

1. **Local Testing**: Visit http://localhost:5000/chat
2. **Embed Testing**: Visit http://localhost:5000/embed-chat.html
3. **Ask Questions**: Try asking:
   - "What loan products do you offer?"
   - "How do I become a member?"
   - "What are your interest rates?"
   - "Tell me about your savings accounts"

## 🚀 Deployment for Production

1. **Deploy your backend API** (the server folder)
2. **Update the API URL** in embed-chat.html
3. **Host embed-chat.html** on your web server
4. **Embed in Google Sites** using the production URL

## 📂 File Locations

- **React Chat Widget**: `client/src/components/chat-widget.tsx`
- **Standalone Chat Page**: `client/src/pages/chat.tsx`
- **Google Sites Embed**: `public/embed-chat.html`
- **Embed Instructions**: `EMBED_INSTRUCTIONS.md` (this file)

## 🔍 Current Status

✅ Backend API running on port 5000
✅ AI reading from uploaded SACCO documents  
✅ Chat widget with light green design
✅ Google Sites embed ready
✅ SACCO logo and branding integrated
✅ Professional styling and animations

The widget is now ready for embedding in Google Sites!