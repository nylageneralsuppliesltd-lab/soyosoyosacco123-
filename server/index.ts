import express from "express";
import { registerRoutes } from "./routes.js";
import path from "path";

// ⚡ Correct CommonJS import for tiktoken
import tiktoken from "tiktoken";
const { getEncoding } = tiktoken;

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS for all origins (needed for Render deployment)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

async function startServer() {
  try {
    console.log("🚀 [STARTUP] SOYOSOYO SACCO API starting...");
    console.log("🔧 [STARTUP] Environment:", process.env.NODE_ENV || 'development');
    console.log("💾 [STARTUP] Database:", process.env.DATABASE_URL ? 'Connected' : 'Missing');
    console.log("🤖 [STARTUP] OpenAI:", process.env.OPENAI_API_KEY ? 'Ready' : 'Missing');
    console.log("🔒 [STARTUP] Fix secret:", process.env.FIX_SECRET ? 'Set' : 'Add FIX_SECRET=yourword in Render env!');  // 🪄 Nudge
    
    // Register API routes (no getEncoding needed)
    registerRoutes(app);
    console.log("✅ [STARTUP] API routes registered successfully");
    
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      const staticPath = path.join(process.cwd(), 'dist', 'public');
      app.use(express.static(staticPath));
      
      // SPA fallback for frontend routes (not API routes)
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(staticPath, 'index.html'));
        }
      });
      console.log("✅ [STARTUP] Static file serving configured");
    }
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        service: 'SOYOSOYO SACCO API',
        timestamp: new Date().toISOString(),
        database: !!process.env.DATABASE_URL,
        openai: !!process.env.OPENAI_API_KEY
      });
    });
    
    // Start server
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 [STARTUP] Server running on port ${port}`);
      console.log(`🌐 [STARTUP] Health check: http://localhost:${port}/health`);
      console.log(`📱 [STARTUP] Chat API: http://localhost:${port}/api/chat`);
      console.log(`🔒 [STARTUP] Fix embeddings: POST /api/admin/fix-embeddings with {"secret":"yourword"}`);
      console.log("✅ [STARTUP] SOYOSOYO SACCO API ready for requests");
    });
    
  } catch (error) {
    console.error("❌ [STARTUP] Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
