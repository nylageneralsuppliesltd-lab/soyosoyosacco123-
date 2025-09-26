import express from "express";
import { processUploadedFile } from "./services/fileProcessor.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles, conversations, messages, apiLogs } from "../shared/schema.js";
import { db, testDatabaseConnection } from "./db.js";
import { eq } from "drizzle-orm";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept common file types
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  }
});

// Improved storage interface with error handling
const storage = {
  async createFile(data: any) {
    try {
      const [result] = await db.insert(uploadedFiles).values(data).returning();
      console.log(`✅ File created in database: ${result.id}`);
      return result;
    } catch (error) {
      console.error("❌ Database insert error:", error);
      throw new Error("Failed to save file to database");
    }
  },

  async getAllFiles() {
    try {
      return await db.select().from(uploadedFiles);
    } catch (error) {
      console.error("❌ Database select error:", error);
      return [];
    }
  },

  async getFile(id: string) {
    try {
      const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
      return file;
    } catch (error) {
      console.error("❌ Database select error:", error);
      return null;
    }
  },

  async createConversation(data: any) {
    try {
      const [result] = await db.insert(conversations).values(data).returning();
      return result;
    } catch (error) {
      console.error("❌ Database conversation error:", error);
      throw error;
    }
  },

  async getConversation(id: string) {
    try {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
      return conv;
    } catch (error) {
      console.error("❌ Database conversation error:", error);
      return null;
    }
  },

  async getAllConversations() {
    try {
      return await db.select().from(conversations);
    } catch (error) {
      console.error("❌ Database conversations error:", error);
      return [];
    }
  },

  async createMessage(data: any) {
    try {
      const [result] = await db.insert(messages).values(data).returning();
      return result;
    } catch (error) {
      console.error("❌ Database message error:", error);
      throw error;
    }
  },

  async getMessagesByConversation(conversationId: string) {
    try {
      return await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    } catch (error) {
      console.error("❌ Database messages error:", error);
      return [];
    }
  },

  async createApiLog(data: any) {
    try {
      const [result] = await db.insert(apiLogs).values(data).returning();
      return result;
    } catch (error) {
      console.error("❌ Database API log error:", error);
      // Don't throw - logging should be non-critical
      return null;
    }
  },

  async getApiLogs() {
    try {
      return await db.select().from(apiLogs);
    } catch (error) {
      console.error("❌ Database API logs error:", error);
      return [];
    }
  }
};

export async function registerRoutes(app: express.Express) {
  const router = express.Router();

  // Health check with database status
  router.get("/health", async (req, res) => {
    const dbConnected = await testDatabaseConnection();
    res.status(200).json({
      status: dbConnected ? "healthy" : "degraded",
      database: dbConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Simple health check
  router.get("/", (req, res, next) => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(200).json({ status: "ok" });
    }
    next();
  });

  // Skip middleware for static assets
  router.use((req, res, next) => {
    if (req.path.startsWith('/@') ||
        req.path.startsWith('/src/') ||
        req.path.startsWith('/node_modules/') ||
        req.path.includes('.js') ||
        req.path.includes('.css') ||
        req.path.includes('.tsx') ||
        req.path.includes('.ts')) {
      return next();
    }
    next();
  });

  // IMPROVED UPLOAD ENDPOINT with comprehensive error handling
  router.post("/api/upload", upload.single("file"), async (req, res) => {
    console.log("🔄 Upload request received");
    
    try {
      // Validate file upload
      if (!req.file) {
        console.log("❌ No file in upload request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { conversationId } = req.body;
      const file = req.file;
      const filename = `${uuidv4()}-${file.originalname}`;
      
      console.log(`📁 Processing file: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)}KB)`);

      // Check database connectivity first
      const dbConnected = await testDatabaseConnection();
      if (!dbConnected) {
        console.log("❌ Database not available for upload");
        return res.status(503).json({ 
          error: "Database temporarily unavailable", 
          message: "Please try uploading again in a moment"
        });
      }

      // Process file with timeout
      console.log("🔄 Processing file content...");
      const processingPromise = processUploadedFile(file.buffer, file.originalname, file.mimetype);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("File processing timeout")), 30000)
      );
      
      const { extractedText, analysis } = await Promise.race([processingPromise, timeoutPromise]);
      console.log(`✅ File processed: ${extractedText.length} chars extracted`);

      // Validate and prepare file data
      const fileData = {
        conversationId: conversationId || null,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedText,
        metadata: { analysis },
        content: file.buffer.toString("base64")
      };

      // Validate with schema
      const validatedData = insertFileSchema.parse(fileData);
      console.log("✅ File data validated");

      // Save to database with retry logic
      let createdFile;
      let retries = 3;
      
      while (retries > 0) {
        try {
          createdFile = await storage.createFile(validatedData);
          console.log(`✅ File saved to database: ${createdFile.id}`);
          break;
        } catch (error) {
          retries--;
          console.error(`❌ Database save attempt failed (${3-retries}/3):`, error);
          
          if (retries === 0) {
            throw new Error("Failed to save file after multiple attempts");
          }
          
          // Wait 1 second before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Test connection before retry
          const stillConnected = await testDatabaseConnection();
          if (!stillConnected) {
            throw new Error("Database connection lost");
          }
        }
      }

      // Success response
      const response = {
        id: createdFile.id,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedLength: extractedText.length,
        analysis
      };

      console.log(`✅ Upload successful: ${response.id}`);
      res.json(response);

    } catch (error) {
      console.error("❌ Upload error:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack",
        filename: req.file?.originalname || "No file",
        size: req.file?.size || 0
      });

      // Return appropriate error response
      if (error instanceof Error) {
        if (error.message.includes("File processing timeout")) {
          return res.status(408).json({ 
            error: "File processing timeout", 
            message: "File took too long to process. Try a smaller file." 
          });
        }
        if (error.message.includes("Unsupported file type")) {
          return res.status(400).json({ 
            error: "Unsupported file type", 
            message: "Please upload PDF, text, or image files only." 
          });
        }
        if (error.message.includes("Database")) {
          return res.status(503).json({ 
            error: "Database error", 
            message: "Temporary database issue. Please try again." 
          });
        }
      }

      res.status(500).json({ 
        error: "Upload failed", 
        message: "An unexpected error occurred during file upload." 
      });
    }
  });

  // Keep other routes unchanged but add error handling
  router.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      const [dbFile] = await db
        .select({ content: uploadedFiles.content, mimeType: uploadedFiles.mimeType, originalName: uploadedFiles.originalName })
        .from(uploadedFiles)
        .where(eq(uploadedFiles.id, req.params.id))
        .limit(1);
        
      if (!dbFile?.content) {
        return res.status(404).json({ error: "File content not found" });
      }
      
      const buffer = Buffer.from(dbFile.content, "base64");
      res.set({
        "Content-Type": dbFile.mimeType,
        "Content-Disposition": `attachment; filename="${dbFile.originalName}"`,
      });
      res.send(buffer);
    } catch (error) {
      console.error("File retrieval error:", error);
      res.status(500).json({ error: "Failed to retrieve file" });
    }
  });

  router.get("/api/stats", async (req, res) => {
    try {
      const dbConnected = await testDatabaseConnection();
      
      if (!dbConnected) {
        return res.status(503).json({
          error: "Database unavailable",
          systemStatus: "degraded"
        });
      }

      const [conversations, files, apiLogs] = await Promise.all([
        storage.getAllConversations(),
        storage.getAllFiles(), 
        storage.getApiLogs()
      ]);

      res.json({
        totalConversations: conversations.length,
        totalFiles: files.length,
        totalApiCalls: apiLogs.length,
        systemStatus: "operational",
        lastProcessedFile: files.length > 0 ? files[files.length - 1].filename : null,
        lastActivity: apiLogs.length > 0 ? apiLogs[apiLogs.length - 1].timestamp : null
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({
        error: "Failed to fetch stats",
        systemStatus: "error"
      });
    }
  });

  router.get("/api/debug", async (req, res) => {
    try {
      const dbConnected = await testDatabaseConnection();
      res.json({
        environment: process.env.NODE_ENV,
        hasDatabase: !!process.env.DATABASE_URL,
        databaseConnected: dbConnected,
        databaseHost: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : null,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
      });
    } catch (error) {
      res.status(500).json({
        error: "Debug failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Keep existing conversation and chat routes
  router.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Conversations error:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  router.get("/api/files", async (req, res) => {
    try {
      const files = await storage.getAllFiles();
      res.json(files);
    } catch (error) {
      console.error("Files error:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  router.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Check database connectivity
      const dbConnected = await testDatabaseConnection();
      if (!dbConnected) {
        return res.status(503).json({ 
          error: "Service temporarily unavailable",
          message: "Database connection issue. Please try again."
        });
      }

      // Create/get conversation
      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
      }

      if (!conversation) {
        conversation = await storage.createConversation({
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        });
      }

      // Save user message
      await storage.createMessage({
        conversationId: conversation.id,
        content: message,
        role: "user",
      });

      // Generate AI response
      const { generateChatResponse } = await import("./services/openai.js");
      const aiResponse = await generateChatResponse(message);

      // Save assistant message
      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: "assistant",
      });

      res.json({
        response: aiResponse,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
      });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  router.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, conversationId } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Image prompt is required" });
      }

      const { generateImage } = await import("./services/openai.js");
      const imageUrl = await generateImage(prompt, conversationId);

      await storage.createApiLog({
        endpoint: "/api/generate-image",
        method: "POST",
        statusCode: 200,
        responseTime: 0,
        success: true,
        metadata: { prompt, conversationId, imageUrl }
      });

      res.json({ imageUrl, prompt, success: true });
    } catch (error) {
      console.error("Image generation error:", error);

      await storage.createApiLog({
        endpoint: "/api/generate-image", 
        method: "POST",
        statusCode: 500,
        responseTime: 0,
        success: false,
        metadata: { prompt: req.body.prompt, error: error instanceof Error ? error.message : "Unknown error" }
      });

      res.status(500).json({
        error: "Failed to generate image",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.use("/", router);
  return app;
}
