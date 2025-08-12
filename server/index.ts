import express from "express";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { processUploadedFile } from "./services/fileProcessor";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { setupVite } from "./vite";
import { createServer } from "http";
import { insertFileSchema } from "../shared/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function preloadAssets() {
  console.log("DEBUG: Skipping asset preloading to conserve OpenAI quota");
  // Disabled to prevent OpenAI quota exhaustion during server startup
  // Files can still be uploaded via the UI when needed
}

const app = express();

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

app.use(express.json());

// Serve static files from public directory (for logos, etc.)
app.use(express.static(path.resolve(__dirname, '..', 'public')));

const server = createServer(app);

registerRoutes(app).then(async () => {
  // Setup Vite development server or static file serving based on environment
  if (process.env.NODE_ENV === "production") {
    // Serve static files for production
    const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");
    const fs = await import("fs");
    
    if (!fs.existsSync(distPath)) {
      console.error(`❌ Build directory not found: ${distPath}`);
      console.error("Please run the build command first: node build.js");
      process.exit(1);
    }
    
    // Serve static files with proper headers
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css');
        }
      }
    }));
    
    // Fallback to index.html for SPA routing (but not for API routes)
    app.get("*", (req, res, next) => {
      // Don't serve index.html for API routes, assets, or Vite-specific routes
      if (req.originalUrl.startsWith('/api/') || 
          req.originalUrl.startsWith('/health') ||
          req.originalUrl.startsWith('/@') ||
          req.originalUrl.startsWith('/src/') ||
          req.originalUrl.includes('.js') ||
          req.originalUrl.includes('.css') ||
          req.originalUrl.includes('.tsx') ||
          req.originalUrl.includes('.ts') ||
          req.originalUrl.includes('.html') ||
          req.originalUrl.includes('.png') ||
          req.originalUrl.includes('.jpg') ||
          req.originalUrl.includes('.svg')) {
        return next();
      }
      res.sendFile(path.resolve(distPath, "index.html"));
    });
    
    console.log(`📁 Serving static files from: ${distPath}`);
  } else {
    await setupVite(app, server);
  }
  
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    
    // Preload assets after server is started to avoid blocking health checks
    if (process.env.NODE_ENV !== "production") {
      // Only preload in development to avoid slow startup in production
      preloadAssets().catch(console.error);
    } else {
      // In production, preload assets in background after a short delay
      setTimeout(() => {
        console.log("🔄 Starting background asset preloading...");
        preloadAssets().catch(console.error);
      }, 5000);
    }
  });
});
