import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Health check
  if (url.pathname === '/api/health' || url.pathname === '/health') {
    return res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "production"
    });
  }

  // Chat endpoint - basic implementation
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Basic chat response - database integration will be handled at runtime
      const response = {
        response: `Hello! I'm the SOYOSOYO SACCO Assistant. You asked: "${message}". This is the live production API - the full AI features with document knowledge will be available once the system initializes with your Supabase database.`,
        context: "SOYOSOYO SACCO Assistant - Production API"
      };

      return res.json(response);
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Serve the chat widget
  if (url.pathname === '/google-sites-svg-embed.html') {
    try {
      const widgetPath = path.resolve(__dirname, '..', 'public', 'google-sites-svg-embed.html');
      if (fs.existsSync(widgetPath)) {
        const content = fs.readFileSync(widgetPath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        return res.send(content);
      }
    } catch (error) {
      console.error('Widget serve error:', error);
    }
    
    // Fallback widget if file doesn't exist
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SOYOSOYO SACCO Assistant</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .chat-widget { max-width: 400px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .logo { color: #7dd3c0; font-weight: bold; font-size: 18px; margin-bottom: 15px; }
          .message { background: #f0f9ff; padding: 10px; border-radius: 6px; margin: 10px 0; }
          input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin: 5px 0; }
          button { background: #1e7b85; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="chat-widget">
          <div class="logo">🏦 SOYOSOYO SACCO Assistant</div>
          <div class="message">Hello! I'm your SACCO assistant. How can I help you today?</div>
          <input type="text" id="messageInput" placeholder="Type your message...">
          <button onclick="sendMessage()">Send</button>
          <div id="response"></div>
        </div>
        <script>
          function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value;
            if (!message) return;
            
            document.getElementById('response').innerHTML = '<div class="message">Thank you for your message: "' + message + '". The full AI assistant will be available shortly!</div>';
            input.value = '';
          }
          
          document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
          });
        </script>
      </body>
      </html>
    `);
  }

  // Default response
  return res.json({
    message: "SOYOSOYO SACCO Assistant API",
    endpoints: {
      health: "/api/health",
      chat: "/api/chat (POST)",
      widget: "/google-sites-svg-embed.html"
    },
    status: "running",
    timestamp: new Date().toISOString()
  });
}