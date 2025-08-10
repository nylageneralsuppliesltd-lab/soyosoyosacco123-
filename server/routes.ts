import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { generateChatResponse } from "./openai";
import { processUploadedFile, cleanupFile, readAssetsFiles } from "./fileProcessor";
import { chatRequestSchema, insertMessageSchema, insertFileSchema, insertApiLogSchema } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs/promises";

// Multer configuration
const upload = multer({
  dest: "/app/uploads",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/plain", "text/csv", "application/pdf", "image/jpeg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`));
    }
  }
});

async function logApiRequest(endpoint: string, method: string, statusCode: number, responseTime: number, errorMessage?: string) {
  try {
    await storage.createApiLog({ endpoint, method, statusCode, responseTime, errorMessage });
  } catch (error) {
    console.error("Failed to log API request:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize attached_assets files
  const assetFiles = [
    "SOYOSOYO BY LAWS -2025_1754774335855.pdf",
    "loan policy_1754774281152.pdf"
  ];
  const assetsContext = await readAssetsFiles(assetFiles);

  // Store attached_assets files in SQLite
  for (const file of assetFiles) {
    const filePath = path.join(__dirname, "..", "attached_assets", file);
    try {
      const stats = await fs.stat(filePath);
      const mimeType = "application/pdf";
      const { extractedText } = await processUploadedFile(filePath, file, mimeType);
      await storage.createFile({
        conversationId: null,
        filename: file,
        originalName: file,
        mimeType,
        size: stats.size,
        extractedText,
        metadata: { path: filePath },
        path: filePath
      });
      console.log(`Stored ${file} in SQLite`);
    } catch (error) {
      console.error(`Failed to store ${file} in SQLite:`, error);
    }
  }

  app.post("/api/chat", async (req, res) => {
    const startTime = Date.now();
    try {
      const parsed = chatRequestSchema.parse(req.body);
      const { message, conversationId, includeContext } = parsed;

      let conversation;
      if (conversationId) {
        conversation = await storage.getConversation(conversationId);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      } else {
        conversation = await storage.createConversation({
          title: message.substring(0, 50) + (message.length > 50 ? "..." : "")
        });
      }

      let conversationHistory: any[] = [];
      let fileContext = assetsContext;
      if (includeContext) {
        conversationHistory = await storage.getMessagesByConversation(conversation.id);
        const recentFiles = await storage.getFilesByConversation(conversation.id);
        if (recentFiles.length > 0) {
          fileContext += "\n\n" + recentFiles
            .filter(f => f.extractedText && f.extractedText.trim().length > 50)
            .map(f => `File: ${f.originalName}\n${f.extractedText?.substring(0, 4000)}`)
            .join("\n\n");
        }
        console.log(`DEBUG: File context length: ${fileContext.length} characters`);
      }

      const userMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: message,
        role: "user",
        metadata: null
      });

      const aiResponse = await generateChatResponse(message, conversationHistory, fileContext);

      const assistantMessage = await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: "assistant",
        metadata: null
      });

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

  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const startTime = Date.now();
    try {
      const files = req.files as Express.Multer.File[];
      const conversationId = req.body.conversationId;
      if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

      const results = [];
      for (const file of files) {
        try {
          const filePath = path.join("/app/uploads", file.filename);
          const { extractedText, analysis } = await processUploadedFile(file.path, file.originalname, file.mimetype);
          const fileRecord = await storage.createFile({
            conversationId: conversationId || null,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            extractedText,
            metadata: { path: filePath },
            path: filePath
          });
          // await cleanupFile(file.path); // Keep files
          results.push({
            fileId: fileRecord.id,
            fileName: fileRecord.originalName,
            size: fileRecord.size,
            mimeType: fileRecord.mimetype,
            extractedText: extractedText?.substring(0, 500) + (extractedText?.length > 500 ? "..." : ""),
            analysis,
            processed: true
          });
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
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
      res.status(201).json({ message: "Files processed", results });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await logApiRequest("/api/upload", "POST", 500, responseTime, errorMessage);
      console.error("Upload error:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || !file.path) return res.status(404).json({ error: "File not found" });
      res.sendFile(file.path, { root: "/" });
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
