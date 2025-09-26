import express from "express";
import { processUploadedFile } from "./services/fileProcessor.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles, conversations, messages, apiLogs } from "../shared/schema.js";
import { db, testDatabaseConnection } from "./db.js";
import { eq } from "drizzle-orm";

// Single multer configuration - increased limits and better error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // Only allow 1 file per request
    fieldSize: 1024 * 1024 // 1MB field size limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`🔍 Checking file: ${file.originalname} (${file.mimetype})`);
    
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
      console.log(`✅ File type accepted: ${file.mimetype}`);
      cb(null, true);
    } else {
      console.log(`❌ File type rejected: ${file.mimetype}`);
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: PDF, text, images, Word docs.`), false);
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

  // FIXED UPLOAD ENDPOINT with comprehensive error handling
  router.post("/api/upload", (req, res, next) => {
    console.log("🔄 Upload endpoint hit");
    
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("❌ Multer error:", err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: "File too large",
            message: "File size must be less than 10MB"
          });
        }
        
        if (err.message.includes("Unsupported file type")) {
          return res.status(400).json({
            error: "Unsupported file type",
            message: err.message
          });
        }
        
        return res.status(400).json({
          error: "Upload error",
          message: err.message || "Failed to upload file"
        });
      }
      
      next();
    });
  }, async (req, res) => {
    console.log("🔄 Processing upload request");
    
    try {
      if (!req.file) {
        console.log("❌ No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { conversationId } = req.body;
      const file = req.file;
      const filename = `${uuidv4()}-${file.originalname}`;

      console.log(`📁 File details: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)}KB)`);

      // Check database connectivity
      const dbConnected = await testDatabaseConnection();
      if (!dbConnected) {
        console.log("❌ Database not available");
        return res.status(503).json({
          error: "Database temporarily unavailable", 
          message: "Please try uploading again in a moment"
        });
      }

      // Process file with timeout
      console.log("🔄 Starting file processing...");
      const startTime = Date.now();
      
      const processingPromise = processUploadedFile(file.buffer, file.originalname, file.mimetype);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("File processing timeout after 30 seconds")), 30000)
      );

      const { extractedText, analysis } = await Promise.race([processingPromise, timeoutPromise]);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ File processed in ${processingTime}ms: ${extractedText.length} chars extracted`);

      // Prepare and validate file data
      const fileData = {
        conversationId: conversationId || null,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedText,
        metadata: { analysis, processingTime },
        content: file.buffer.toString("base64")
      };

      console.log("🔍 Validating file data with schema...");
      const validatedData = insertFileSchema.parse(fileData);
      console.log("✅ File data validated successfully");

      // Save to database with retry logic
      let createdFile;
      let retries = 3;

      while (retries > 0) {
        try {
          createdFile = await storage.createFile(validatedData);
          console.log(`✅ File saved successfully: ${createdFile.id}`);
          break;
        } catch (error) {
          retries--;
          console.error(`❌ Database save attempt ${3-retries}/3 failed:`, error);

          if (retries === 0) {
            throw new Error("Failed to save file to database after 3 attempts");
          }

          await new Promise(resolve => setTimeout(resolve, 1000));

          const stillConnected = await testDatabaseConnection();
          if (!stillConnected) {
            throw new Error("Database connection lost during save");
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
        processingTime,
        analysis: analysis.substring(0, 200) + (analysis.length > 200 ? "..." : ""),
        success: true
      };

      console.log(`🎉 Upload completed successfully: ${response.id}`);
      res.json(response);

    } catch (error) {
      console.error("❌ Upload processing error:", error);

      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          return res.status(408).json({
            error: "Processing timeout",
            message: "File took too long to process. Try a smaller file or different format."
          });
        }
        if (error.message.includes("PDF")) {
          return res.status(422).json({
            error: "PDF processing failed",
            message: "Unable to extract text from PDF. The file might be image-based or corrupted."
          });
        }
        if (error.message.includes("Database")) {
          return res.status(503).json({
            error: "Database error",
            message: "Temporary database issue. Please try again in a moment."
          });
        }
      }

      res.status(500).json({
        error: "Upload failed",
        message: "An unexpected error occurred during file processing."
      });
    }
  });

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

  // ✅ FIXED CHAT ENDPOINT - Correct parameters for generateChatResponse
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

      // ✅ FIXED: Pass conversation ID to generateChatResponse for context + smart tokens
      const { generateChatResponse } = await import("./services/openai.js");
      const aiResponse = await generateChatResponse(message, conversation.id);

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
