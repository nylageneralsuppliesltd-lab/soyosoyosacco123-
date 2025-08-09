import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { generateChatResponse } from "./services/openai";
import { processUploadedFile, cleanupFile } from "./services/fileProcessor";
import { 
  chatRequestSchema, 
  insertMessageSchema,
  insertFileSchema,
  insertApiLogSchema 
} from "@shared/schema";
import { randomUUID } from "crypto";

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      "text/plain",
      "text/csv",
      "application/json",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp"
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  }
});

async function logApiRequest(endpoint: string, method: string, statusCode: number, responseTime: number, errorMessage?: string) {
  try {
    await storage.createApiLog({
      endpoint,
      method,
      statusCode,
      responseTime,
      errorMessage
    });
  } catch (error) {
    console.error("Failed to log API request:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const parsed = chatRequestSchema.parse(req.body);
      const { message, conversationId, includeContext } = parsed;

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      } else {
        conversation = await storage.createConversation({
          title: message.substring(0, 50) + (message.length > 50 ? "..." : "")
        });
      }

      // Get conversation history for context
      let conversationHistory: any[] = [];
      let fileContext = "";
      
      if (includeContext) {
        conversationHistory = await storage.getMessagesByConversation(conversation.id);
        
        // Get recent files from conversation for context
        const recentFiles = await storage.getFilesByConversation(conversation.id);
        
        // Also check for any files without conversation ID (global files) as fallback
        if (recentFiles.length === 0) {
          const allFiles = await storage.getAllFiles();
          const globalFiles = allFiles.filter(f => !f.conversationId || f.conversationId === conversation.id);
          recentFiles.push(...globalFiles.slice(0, 3));
        }
        
        console.log(`DEBUG: Found ${recentFiles.length} files for conversation ${conversation.id}`);
        recentFiles.forEach(f => console.log(`- ${f.originalName}: ${f.extractedText ? f.extractedText.length : 0} chars`));
        
        if (recentFiles.length > 0) {
          fileContext = recentFiles
            .filter(f => f.extractedText && f.extractedText.trim().length > 50)
            .slice(0, 3) // Last 3 files
            .map(f => `File: ${f.originalName}\n${f.extractedText?.substring(0, 8000)}`) // Increased context size
            .join("\n\n");
        }
        
        console.log(`DEBUG: File context length: ${fileContext.length} characters`);
      }

      // Save user message
      const userMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: message,
        role: "user",
        metadata: null
      });

      // Generate AI response
      const aiResponse = await generateChatResponse(message, conversationHistory, fileContext);

      // Save AI response
      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: "assistant",
        metadata: null
      });

      // Update conversation timestamp
      await storage.updateConversation(conversation.id, { updatedAt: new Date() });

      const responseTime = Date.now() - startTime;
      await logApiRequest("/api/chat", "POST", 200, responseTime);

      res.json({
        response: aiResponse,
        conversationId: conversation.id,
        messageId: assistantMessage.id
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/chat", "POST", 500, responseTime, errorMessage);
      
      console.error("Chat error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  // File upload endpoint
  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const startTime = Date.now();
    
    try {
      const files = req.files as Express.Multer.File[];
      const conversationId = req.body.conversationId;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const results = [];

      for (const file of files) {
        try {
          // Create file record
          const fileRecord = await storage.createFile({
            conversationId: conversationId || null,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            extractedText: null,
            metadata: {
              path: file.path,
              encoding: file.encoding
            }
          });

          // Process file content
          const { extractedText, analysis } = await processUploadedFile(
            file.path,
            file.originalname,
            file.mimetype
          );

          // Update file record with extracted content
          await storage.updateFile(fileRecord.id, {
            extractedText,
            processed: true,
            metadata: {
              ...(fileRecord.metadata || {}),
              analysis
            }
          });

          // Clean up temporary file
          await cleanupFile(file.path);

          results.push({
            fileId: fileRecord.id,
            fileName: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            extractedText: extractedText.substring(0, 500) + (extractedText.length > 500 ? "..." : ""),
            analysis,
            processed: true
          });

        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
          
          // Clean up temporary file on error
          await cleanupFile(file.path);
          
          results.push({
            fileName: file.originalname,
            error: fileError instanceof Error ? fileError.message : "Processing failed",
            processed: false
          });
        }
      }

      const responseTime = Date.now() - startTime;
      await logApiRequest("/api/upload", "POST", 200, responseTime);

      res.status(201).json({
        message: "Files processed",
        results
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/upload", "POST", 500, responseTime, errorMessage);
      
      console.error("Upload error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get conversation
  app.get("/api/conversations/:id", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messages = await storage.getMessagesByConversation(conversation.id);
      const files = await storage.getFilesByConversation(conversation.id);

      const responseTime = Date.now() - startTime;
      await logApiRequest(`/api/conversations/${req.params.id}`, "GET", 200, responseTime);

      res.json({
        conversation,
        messages,
        files
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest(`/api/conversations/${req.params.id}`, "GET", 500, responseTime, errorMessage);
      
      console.error("Get conversation error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get all conversations
  app.get("/api/conversations", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const conversations = await storage.getAllConversations();
      
      const responseTime = Date.now() - startTime;
      await logApiRequest("/api/conversations", "GET", 200, responseTime);

      res.json(conversations);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/conversations", "GET", 500, responseTime, errorMessage);
      
      console.error("Get conversations error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get API statistics
  app.get("/api/stats", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const stats = await storage.getApiStats();
      
      const responseTime = Date.now() - startTime;
      await logApiRequest("/api/stats", "GET", 200, responseTime);

      res.json(stats);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/stats", "GET", 500, responseTime, errorMessage);
      
      console.error("Get stats error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get recent activity
  app.get("/api/activity", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const logs = await storage.getRecentApiLogs(50);
      
      const responseTime = Date.now() - startTime;
      await logApiRequest("/api/activity", "GET", 200, responseTime);

      res.json(logs);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/activity", "GET", 500, responseTime, errorMessage);
      
      console.error("Get activity error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
