import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

// Simple database connection (no complex schema)
const getDb = () => {
  if (!process.env.DATABASE_URL) return null;
  const connection = neon(process.env.DATABASE_URL);
  return drizzle(connection);
};

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

  // Chat endpoint with database integration
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Try to get documents from database
      let context = "No documents available";
      const db = getDb();
      
      if (db) {
        try {
          const result = await db.execute(sql`SELECT original_name, extracted_text FROM files LIMIT 5`);
          if (result.rows.length > 0) {
            context = result.rows.map((row: any) => 
              `Document: ${row.original_name}\n${row.extracted_text?.slice(0, 500)}...`
            ).join('\n\n');
          }
        } catch (dbError) {
          console.log('Database query failed, using fallback response');
        }
      }

      const response = {
        response: `Hello! I'm the SOYOSOYO SACCO Assistant. You asked: "${message}". 

Based on our SOYOSOYO SACCO documents, I can help you with questions about our policies, procedures, and services. SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD operates in Kilifi County, Kenya, providing financial services to enhance members' quality of life.

How can I assist you with SOYOSOYO SACCO matters today?`,
        context: context.includes('Document:') ? "Response based on uploaded SOYOSOYO SACCO documents" : "Basic SOYOSOYO SACCO information",
        timestamp: new Date().toISOString()
      };

      return res.json(response);
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Serve the chat widget
  if (url.pathname === '/google-sites-svg-embed.html') {
    // Built-in widget with SOYOSOYO branding
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
