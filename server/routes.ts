// server/routes.ts
import express from "express";
import multer from "multer";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { db } from "./db.js";
import {
  conversations,
  messages,
  uploadedFiles,
  insertConversationSchema,
  insertMessageSchema,
  insertUploadedFileSchema,
} from "../shared/schema.js";
import { eq, desc, isNotNull } from "drizzle-orm";
import { generateChatResponse, analyzeFileContent, generateImage } from "./services/openai.js";
import { processFile } from "./services/fileProcessor.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// -----------------------------
// DEBUG ENDPOINT FOR PRODUCTION TROUBLESHOOTING
// -----------------------------
router.get("/debug/files", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Files endpoint accessed");
    
    const files = await db
      .select({
        id: uploadedFiles.id,
        filename: uploadedFiles.originalName,
        mimeType: uploadedFiles.mimeType,
        textLength: uploadedFiles.extractedText ? 'HAS_TEXT' : 'NO_TEXT',
        actualLength: uploadedFiles.extractedText?.length || 0,
        processed: uploadedFiles.processed,
        uploadedAt: uploadedFiles.uploadedAt
      })
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt));

    const stats = {
      total: files.length,
      withText: files.filter(f => f.textLength === 'HAS_TEXT').length,
      processed: files.filter(f => f.processed).length,
      bylaws: files.filter(f => f.filename?.toLowerCase().includes('bylaw')),
      policies: files.filter(f => f.filename?.toLowerCase().includes('policy')),
      loans: files.filter(f => f.filename?.toLowerCase().includes('loan')),
    };

    console.log("📊 [DEBUG] File stats:", stats);
    
    res.json({ 
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      stats,
      recentFiles: files.slice(0, 10),
      bylawsDetails: stats.bylaws.map(f => ({
        filename: f.filename,
        textLength: f.actualLength,
        processed: f.processed
      }))
    });
  } catch (error) {
    console.error("❌ [DEBUG] Files endpoint error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint for testing database connection
router.get("/debug/connection", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Connection test accessed");
    
    // Test basic database connection
    const testQuery = await db.select({ count: '1' }).from(uploadedFiles).limit(1);
    
    const connectionInfo = {
      database: {
        connected: true,
        hasUrl: !!process.env.DATABASE_URL,
        environment: process.env.NODE_ENV || 'unknown'
      },
      openai: {
        hasKey: !!process.env.OPENAI_API_KEY,
        keyLength: process.env.OPENAI_API_KEY?.length || 0
      },
      timestamp: new Date().toISOString()
    };
    
    console.log("✅ [DEBUG] Connection test successful");
    res.json({ success: true, ...connectionInfo });
  } catch (error) {
    console.error("❌ [DEBUG] Connection test failed:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint for testing text retrieval
router.get("/debug/texts", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Texts endpoint accessed");
    
    const { getAllExtractedTexts } = await import("./services/openai.js");
    const extractedTexts = await getAllExtractedTexts();
    
    const preview = extractedTexts.substring(0, 2000);
    const hasBylaws = extractedTexts.toLowerCase().includes('soyosoyo') && extractedTexts.toLowerCase().includes('bylaw');
    const hasPolicy = extractedTexts.toLowerCase().includes('policy');
    
    res.json({
      success: true,
      totalLength: extractedTexts.length,
      preview,
      analysis: {
        hasBylaws,
        hasPolicy,
        hasContent: extractedTexts.length > 100,
        isError: extractedTexts.includes('Unable to retrieve') || extractedTexts.includes('No documents')
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ [DEBUG] Texts endpoint error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// -----------------------------
// CHAT ENDPOINTS
// -----------------------------
router.post("/chat", async (req, res) => {
  try {
    console.log("💬 [PRODUCTION] Chat request received");
    
    const { message, conversationId } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`💬 [PRODUCTION] Processing: "${message.substring(0, 100)}..." (ID: ${conversationId || 'new'})`);

    let currentConversationId = conversationId;

    // Create new conversation if none provided
    if (!currentConversationId) {
      const newConversation = await db.insert(conversations).values({
        id: uuidv4(),
        title: message.substring(0, 100),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      
      currentConversationId = newConversation[0].id;
      console.log(`🆕 [PRODUCTION] Created new conversation: ${currentConversationId}`);
    }

    // Save user message
    await db.insert(messages).values({
      id: uuidv4(),
      conversationId: currentConversationId,
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Generate AI response
    const aiResponse = await generateChatResponse(message, currentConversationId);

    // Save AI response
    await db.insert(messages).values({
      id: uuidv4(),
      conversationId: currentConversationId,
      role: "assistant", 
      content: aiResponse,
      timestamp: new Date(),
    });

    // Update conversation timestamp
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, currentConversationId));

    console.log(`✅ [PRODUCTION] Chat response generated: ${aiResponse.length} chars`);

    res.json({
      response: aiResponse,
      conversationId: currentConversationId,
    });
  } catch (error) {
    console.error("❌ [PRODUCTION] Chat error:", error);
    res.status(500).json({ 
      error: "Failed to process chat message. Please try again.",
      details: error.message 
    });
  }
});

// Get conversation history
router.get("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (conversation.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.timestamp);

    res.json({
      conversation: conversation[0],
      messages: msgs,
    });
  } catch (error) {
    console.error("❌ [PRODUCTION] Get conversation error:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Get all conversations
router.get("/conversations", async (req, res) => {
  try {
    const allConversations = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));

    res.json(allConversations);
  } catch (error) {
    console.error("❌ [PRODUCTION] Get conversations error:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// -----------------------------
// FILE UPLOAD ENDPOINTS  
// -----------------------------
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📤 [PRODUCTION] File upload request received");
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    console.log(`📄 [PRODUCTION] Processing file: ${file.originalname} (${file.size} bytes)`);

    // Process the file
    const result = await processFile(file.path, file.originalname, file.mimetype);

    // Save to database
    const uploadedFile = await db.insert(uploadedFiles).values({
      id: uuidv4(),
      filename: `${file.filename}-${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath: file.path,
      extractedText: result.text,
      processed: true,
      uploadedAt: new Date(),
      analysis: result.analysis,
    }).returning();

    console.log(`✅ [PRODUCTION] File uploaded and processed: ${uploadedFile[0].id}`);
    console.log(`📝 [PRODUCTION] Extracted text length: ${result.text?.length || 0} chars`);

    res.json({
      success: true,
      file: {
        id: uploadedFile[0].id,
        name: file.originalname,
        size: file.size,
        extractedTextLength: result.text?.length || 0,
        analysis: result.analysis,
      },
    });
  } catch (error) {
    console.error("❌ [PRODUCTION] File upload error:", error);
    res.status(500).json({ 
      error: "Failed to process file upload",
      details: error.message 
    });
  }
});

// Get uploaded files
router.get("/files", async (req, res) => {
  try {
    const files = await db
      .select({
        id: uploadedFiles.id,
        originalName: uploadedFiles.originalName,
        mimeType: uploadedFiles.mimeType,
        fileSize: uploadedFiles.fileSize,
        processed: uploadedFiles.processed,
        uploadedAt: uploadedFiles.uploadedAt,
        hasText: uploadedFiles.extractedText !== null,
        textLength: uploadedFiles.extractedText?.length || 0,
      })
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt));

    res.json(files);
  } catch (error) {
    console.error("❌ [PRODUCTION] Get files error:", error);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// Delete file
router.delete("/files/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const deleted = await db
      .delete(uploadedFiles)
      .where(eq(uploadedFiles.id, id))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    console.log(`🗑️ [PRODUCTION] File deleted: ${deleted[0].originalName}`);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ [PRODUCTION] Delete file error:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Generate image endpoint
router.post("/generate-image", async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`🎨 [PRODUCTION] Image generation request: "${prompt}"`);
    const imageUrl = await generateImage(prompt, userId);

    res.json({ 
      success: true, 
      imageUrl,
      prompt 
    });
  } catch (error) {
    console.error("❌ [PRODUCTION] Image generation error:", error);
    res.status(500).json({ 
      error: "Failed to generate image",
      details: error.message 
    });
  }
});

export default router;
