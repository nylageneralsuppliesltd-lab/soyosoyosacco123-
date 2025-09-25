import express from "express";
import { processUploadedFile } from "./services/fileProcessor";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles, type UploadedFile } from "../shared/schema";
import { db } from "./storage";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: express.Express) {
  const router = express.Router();

  // Health check endpoint
  router.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  // Simple root check
  router.get("/", (req, res, next) => {
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(200).json({ status: "ok" });
    }
    next();
  });

  // Prevent static assets from hitting API routes
  router.use((req, res, next) => {
    if (
      req.path.startsWith("/@") ||
      req.path.startsWith("/src/") ||
      req.path.startsWith("/node_modules/") ||
      req.path.includes(".js") ||
      req.path.includes(".css") ||
      req.path.includes(".tsx") ||
      req.path.includes(".ts")
    ) {
      return next();
    }
    next();
  });

  // ========= FILE UPLOAD =========
  router.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      console.log("DEBUG: /api/upload called");
      if (!req.file) {
        console.log("DEBUG: No file uploaded");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { conversationId } = req.body;
      const file = req.file;
      const filename = `${uuidv4()}-${file.originalname}`;
      const mimeType = file.mimetype;
      const size = file.size;

      const { extractedText, analysis } = await processUploadedFile(
        file.buffer,
        file.originalname,
        mimeType
      );

      const fileData = insertFileSchema.parse({
        conversationId,
        filename,
        originalName: file.originalname,
        mimeType,
        size,
        extractedText,
        metadata: { analysis },
      });

      const createdFile = await storage.createFile({
        ...fileData,
        content: file.buffer.toString("base64"),
      });

      console.log("DEBUG: Upload successful");
      res.json({
        id: createdFile.id,
        filename,
        originalName: file.originalname,
        mimeType,
        size,
        analysis,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  // ========= FILE DOWNLOAD =========
  router.get("/api/files/:id", async (req, res) => {
    try {
      console.log(`DEBUG: Retrieving file ${req.params.id}`);
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      const [dbFile] = await db
        .select({
          content: uploadedFiles.content,
          mimeType: uploadedFiles.mimeType,
          originalName: uploadedFiles.originalName,
        })
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

  // ========= SYSTEM STATS =========
  router.get("/api/stats", async (req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      const files = await storage.getAllFiles();
      const apiLogs = await storage.getApiLogs();

      res.json({
        totalConversations: conversations.length,
        totalFiles: files.length,
        totalApiCalls: apiLogs.length,
        systemStatus: "operational",
        lastProcessedFile:
          files.length > 0 ? files[files.length - 1].filename : null,
        lastActivity:
          apiLogs.length > 0 ? apiLogs[apiLogs.length - 1].timestamp : null,
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // ========= DEBUG =========
  router.get("/api/debug", async (req, res) => {
    try {
      res.json({
        environment: process.env.NODE_ENV,
        hasDatabase: !!process.env.DATABASE_URL,
        databaseHost: process.env.DATABASE_URL
          ? new URL(process.env.DATABASE_URL).hostname
          : null,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
      });
    } catch (error) {
      res.status(500).json({
        error: "Debug failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ========= CONVERSATIONS =========
  router.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Conversations error:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // ========= FILE LIST =========
  router.get("/api/files", async (req, res) => {
    try {
      const files = await storage.getAllFiles();
      res.json(files);
    } catch (error) {
      console.error("Files error:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // ========= CHAT =========
  router.post("/api/chat", async (req, res) => {
    let fileContext = ""; // <-- define early to avoid ReferenceError
    try {
      console.log("DEBUG: /api/chat called", req.body);

      const { message, conversationId, includeContext = true } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      let conversation;
      if (conversationId) {
        console.log("DEBUG: Looking up conversation", conversationId);
        conversation = await storage.getConversation(conversationId);
      }

      if (!conversation) {
        console.log("DEBUG: Creating new conversation");
        conversation = await storage.createConversation({
          title:
            message.substring(0, 50) +
            (message.length > 50 ? "..." : ""),
        });
      }

      console.log("DEBUG: Saving user message");
      await storage.createMessage({
        conversationId: conversation.id,
        content: message,
        role: "user",
      });

      console.log("DEBUG: Fetching conversation history");
      const history = await storage.getMessagesByConversation(conversation.id);

      if (includeContext) {
        console.log("DEBUG: Fetching all files");
        const files = await storage.getAllFiles();
        const relevantFiles = files.filter(
          (f: UploadedFile) => f.extractedText?.length > 0
        );
        fileContext = relevantFiles
          .map((f: UploadedFile) => `=== ${f.originalName} ===\n${f.extractedText}`)
          .join("\n\n");
        console.log("DEBUG: File context length:", fileContext.length);
      }

      console.log("DEBUG: Calling OpenAI with message + history");
      const { generateChatResponse } = await import("./services/openai");
      const aiResponse = await generateChatResponse(
        message,
        history,
        fileContext
      );

      console.log("DEBUG: Saving assistant response");
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
      console.error("Chat error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack",
        conversationId: req.body?.conversationId,
        userMessage: req.body?.message,
        fileContextLength: fileContext?.length || 0,
      });
      res
        .status(500)
        .json({ error: "Failed to process chat message", details: String(error) });
    }
  });

  // ========= IMAGE GENERATION =========
  router.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, conversationId } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Image prompt is required" });
      }

      const { generateImage } = await import("./services/openai");
      const imageUrl = await generateImage(prompt, conversationId);

      await storage.createApiLog({
        endpoint: "/api/generate-image",
        method: "POST",
        statusCode: 200,
        responseTime: 0,
        success: true,
        metadata: { prompt, conversationId, imageUrl },
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
        metadata: {
          prompt: req.body.prompt,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      res.status(500).json({
        error: "Failed to generate image",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/", router);
  return app;
}
