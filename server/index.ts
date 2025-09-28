// server/index.ts
import express from "express";
import { registerRoutes } from "./routes.js";
import { initializeDatabase } from "./db.js";
import path from "path";

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware for development
if (process.env.NODE_ENV === 'development') {
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
}

async function startServer() {
  try {
    console.log("🚀 [STARTUP] App starting - NODE_ENV:", process.env.NODE_ENV, "Has DB:", !!process.env.DATABASE_URL);
    
    // Initialize database
    console.log("🔧 [STARTUP] Initializing database...");
    await initializeDatabase();
    console.log("✅ [STARTUP] Database initialized successfully");
    
    // Register API routes
    console.log("🔧 [STARTUP] Initializing server...");
    registerRoutes(app);
    console.log("✅ [STARTUP] Routes registered successfully");
    
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      const staticPath = path.join(process.cwd(), 'dist', 'public');
      app.use(express.static(staticPath));
      
      // Serve index.html for all non-API routes (SPA support)
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(staticPath, 'index.html'));
        }
      });
      console.log("✅ [STARTUP] Static file serving configured for production");
    }
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown'
      });
    });
    
    // Start the server
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
      console.log(`Frontend available at http://localhost:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error("❌ [STARTUP] Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
