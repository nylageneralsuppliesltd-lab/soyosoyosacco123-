import express from "express";
import multer from "multer";
import { db } from "./db.js";
import {
  conversations,
  messages,
  uploadedFiles,
  insertFileSchema,
} from "../shared/schema.js";
import { eq, desc, isNotNull } from "drizzle-orm";
import { generateChatResponse, analyzeFileContent, generateImage } from "./services/openai.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function processUploadedFile(filePath: string, originalName: string, mimeType: string) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = "";
    
    if (mimeType.includes('text/') || originalName.endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else if (mimeType.includes('json')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      extractedText = `File: ${originalName}\nType: ${mimeType}\nUploaded for SOYOSOYO SACCO processing.`;
    }

    const analysis = await analyzeFileContent(extractedText, originalName, mimeType);
    
    return {
      text: extractedText,
      analysis: analysis
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      text: `File: ${originalName}\nProcessing error: ${errorMessage}`,
      analysis: `Failed to process ${originalName}: ${errorMessage}`
    };
  }
}

const router = express.Router();

// Debug endpoints
router.get("/debug/files", async (req, res) => {
  try {
    const files = await db
      .select({
        id: uploadedFiles.id,
        filename: uploadedFiles.originalName,
        mimeType: uploadedFiles.mimeType,
        processed: uploadedFiles.processed,
        uploadedAt: uploadedFiles.uploadedAt
      })
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt));

    const stats = {
      total: files.length,
      bylaws: files.filter(f => f.filename?.toLowerCase().includes('bylaw')),
    };
    
    res.json({ 
      success: true,
      timestamp: new Date().toISOString(),
      stats,
      recentFiles: files.slice(0, 10),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

router.get("/debug/connection", async (req, res) => {
  try {
    await db.select().from(uploadedFiles).limit(1);
    
    res.json({ 
      success: true, 
      database: { connected: true },
      openai: { hasKey: !!process.env.OPENAI_API_KEY },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

router.get("/debug/texts", async (req, res) => {
  try {
    const { getAllExtractedTexts } = await import("./services/openai.js");
    const extractedTexts = await getAllExtractedTexts();
    
    const preview = extractedTexts.substring(0, 2000);
    const hasBylaws = extractedTexts.toLowerCase().includes('soyosoyo') && extractedTexts.toLowerCase().includes('bylaw');
    
    res.json({
      success: true,
      totalLength: extractedTexts.length,
      preview,
      analysis: { hasBylaws },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

// Chat endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Message is required" });
    }

    let currentConversationId = conversationId;

    if (!currentConversationId) {
      const newConversation = await db.insert(conversations).values({
        id: uuidv4(),
        title: message.substring(0, 100),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      currentConversationId = newConversation[0].id;
    }

    await db.insert(messages).values({
      id: uuidv4(),
      conversationId: currentConversationId,
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    const aiResponse = await generateChatResponse(message, currentConversationId);

    await db.insert(messages).values({
      id: uuidv4(),
      conversationId: currentConversationId,
      role: "assistant", 
      content: aiResponse,
      timestamp: new Date(),
    });

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, currentConversationId));

    res.json({
      response: aiResponse,
      conversationId: currentConversationId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      error: "Failed to process chat message. Please try again.",
      details: errorMessage 
    });
  }
});

// File upload endpoint
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const result = await processUploadedFile(file.path, file.originalname, file.mimetype);

    const uploadedFile = await db.insert(uploadedFiles).values({
      filename: `${file.filename}-${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      extractedText: result.text,
      processed: true,
      uploadedAt: new Date(),
    }).returning();

    res.json({
      success: true,
      file: {
        id: uploadedFile[0].id,
        name: file.originalname,
        size: file.size,
        extractedTextLength: result.text?.length || 0,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      error: "Failed to process file upload",
      details: errorMessage 
    });
  }
});

export function registerRoutes(app: express.Application) {
  app.use("/api", router);
  console.log("✅ [PRODUCTION] API routes registered successfully");
}

export default router;
