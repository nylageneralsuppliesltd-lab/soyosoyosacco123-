import { storage } from '../server/storage.js';
import { processUploadedFile } from '../server/services/fileProcessor.js';
import { insertFileSchema } from '../shared/schema.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize database schema
async function initializeDatabase() {
  if (process.env.DATABASE_URL) {
    try {
      console.log("🗃️ Initializing database schema...");
      const { execSync } = await import("child_process");
      execSync('npx drizzle-kit push', { stdio: 'inherit' });
      console.log("✅ Database schema updated!");
    } catch (error) {
      console.error("❌ Database initialization failed:", error instanceof Error ? error.message : String(error));
      console.log("🔄 Continuing...");
    }
  }
}

let dbInitialized = false;

export default async function handler(req: any, res: any) {
  // Initialize database once
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }

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

  // Chat endpoint
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get all uploaded files for context
      const files = await storage.getAllFiles();
      let context = "";
      
      if (files.length > 0) {
        context = files.map(f => `Document: ${f.originalName}\n${f.extractedText}`).join("\n\n");
      }

      // Simple response with document context
      const response = {
        response: `Based on the SOYOSOYO SACCO documents, I can help you with questions about our policies, procedures, and services. Your question: "${message}". Please note that this is a simplified response. The full AI integration requires the complete system deployment.`,
        context: context ? "Response based on uploaded SOYOSOYO SACCO documents" : "No documents uploaded yet"
      };

      return res.json(response);
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // File upload endpoint
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    return res.status(501).json({ error: "File upload requires full multipart handling - use the dashboard for uploads" });
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
  }

  // Default response
  return res.json({
    message: "SOYOSOYO SACCO Assistant API",
    endpoints: {
      health: "/api/health",
      chat: "/api/chat (POST)",
      widget: "/google-sites-svg-embed.html"
    },
    status: "running"
  });
}