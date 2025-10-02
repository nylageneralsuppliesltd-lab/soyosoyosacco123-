import express from "express";
import { registerRoutes } from "./routes.js";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
// ✅ Fixed import for tiktoken (CommonJS in ESM)
import tiktokenPkg from "tiktoken";
const { getEncoding } = tiktokenPkg;
import { Pool } from "pg"; // For DB connection
import { drizzle } from "drizzle-orm/node-postgres"; // For ORM

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 5000;

// DB Setup (global for reuse in modules like chat)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false 
  },
  enableChannelBinding: true,  // Opt-in for Neon's channel_binding=require
});
const db = drizzle(pool);

// Export for other modules (e.g., chat.ts)
export { db, pool };

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// Add endpoint to run Python uploader
app.post('/api/admin/run-upload', async (req, res) => {
  if (req.body.secret !== process.env.FIX_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  try {
    const { stdout, stderr } = await execAsync('python3 upload_financials.py');
    res.json({ message: 'Upload script executed', output: stdout });
  } catch (error) {
    console.error(`Error running Python script: ${error}`);
    res.status(500).json({ error: 'Script failed', details: stderr });
  }
});

async function startServer() {
  try {
    console.log("🚀 [STARTUP] SOYOSOYO SACCO API starting...");
    console.log("🔧 [STARTUP] Environment:", process.env.NODE_ENV || 'development');
    console.log("💾 [STARTUP] Database:", process.env.DATABASE_URL ? 'Connected' : 'Missing');
    console.log("🤖 [STARTUP] OpenAI:", process.env.OPENAI_API_KEY ? 'Ready' : 'Missing');
    console.log("🔒 [STARTUP] Fix secret:", process.env.FIX_SECRET ? 'Set' : 'Add FIX_SECRET=yourword in Render env!');
    
    // Test DB connection on startup (optional, for logs)
    try {
      await pool.query('SELECT 1');
      console.log("💾 [STARTUP] Database: Connected");
    } catch (dbError) {
      console.error("💾 [STARTUP] Database connection failed:", dbError);
    }
    
    registerRoutes(app);
    console.log("✅ [STARTUP] API routes registered successfully");
    
    if (process.env.NODE_ENV === 'production') {
      const staticPath = path.join(process.cwd(), 'dist', 'public');
      app.use(express.static(staticPath));
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(staticPath, 'index.html'));
        }
      });
      console.log("✅ [STARTUP] Static file serving configured");
    }
    
    app.get('/health', async (req, res) => {
      let dbStatus = false;
      try {
        await pool.query('SELECT 1');
        dbStatus = true;
      } catch {}
      res.json({ 
        status: 'healthy',
        service: 'SOYOSOYO SACCO API',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        openai: !!process.env.OPENAI_API_KEY
      });
    });
    
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 [STARTUP] Server running on port ${port}`);
      console.log(`🌐 [STARTUP] Health check: http://localhost:${port}/health`);
      console.log(`📱 [STARTUP] Chat API: http://localhost:${port}/api/chat`);
      console.log(`🔒 [STARTUP] Fix embeddings: POST /api/admin/fix-embeddings with {"secret":"yourword"}`);
      console.log(`🔒 [STARTUP] Run upload: POST /api/admin/run-upload with {"secret":"yourword"}`);
      console.log("✅ [STARTUP] SOYOSOYO SACCO API ready for requests");
    });
  } catch (error) {
    console.error("❌ [STARTUP] Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
