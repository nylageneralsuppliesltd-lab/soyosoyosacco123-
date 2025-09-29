import express from "express";
import multer from "multer";
import { db } from "./db.js";
import { conversations, messages, uploadedFiles } from "../shared/schema.js";
import { eq, desc, isNotNull } from "drizzle-orm";
import { generateChatResponse, analyzeFileContent } from "./services/openai.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

async function processFile(filePath: string, originalName: string, mimeType: string) {
  try {
    console.log(`📄 [PRODUCTION] Processing: ${originalName}`);
    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = "";

    if (mimeType.includes("text/") || originalName.endsWith(".txt")) {
      extractedText = fileBuffer.toString("utf-8");
    } else if (mimeType.includes("json")) {
      extractedText = fileBuffer.toString("utf-8");
    } else {
      extractedText = `File: ${originalName}\nType: ${mimeType}\nProcessed for SOYOSOYO SACCO.`;
    }

    console.log(`✅ [PRODUCTION] Extracted ${extractedText.length} characters`);
    const analysis = await analyzeFileContent(extractedText, originalName, mimeType);
    return { text: extractedText, analysis };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ [PRODUCTION] Processing error for ${originalName}:`, err);
    return {
      text: `File: ${originalName}\nError: ${err}`,
      analysis: `Processing failed: ${err}`,
    };
  }
}

const router = express.Router();

// ========================================
// DEBUG ENDPOINTS
// ========================================

router.get("/debug/files", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Files endpoint accessed");
    const totalFiles = await db.$count(uploadedFiles);
    const filesWithText = await db.$count(uploadedFiles, isNotNull(uploadedFiles.extractedText));

    const recentFiles = await db
      .select({ filename: uploadedFiles.originalName, uploadedAt: uploadedFiles.uploadedAt })
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(5);

    const bylawsFiles = recentFiles.filter(f =>
      f.filename?.toLowerCase().includes("bylaw")
    );

    const stats = { total: totalFiles, withText: filesWithText, bylaws: bylawsFiles.length, recent: recentFiles };
    console.log("📊 [DEBUG] Stats:", stats);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "unknown",
      stats,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [DEBUG] Files endpoint error:", err);
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

router.get("/debug/connection", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Connection test");
    await db.select().from(uploadedFiles).limit(1);
    res.json({
      success: true,
      database: { connected: true, hasUrl: !!process.env.DATABASE_URL },
      openai: { hasKey: !!process.env.OPENAI_API_KEY },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [DEBUG] Connection test failed:", err);
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

router.get("/debug/texts", async (req, res) => {
  try {
    console.log("🔍 [DEBUG] Text retrieval test");
    const { getAllExtractedTexts } = await import("./services/openai.js");
    const texts = await getAllExtractedTexts();

    const preview = texts.substring(0, 1000);
    const hasBylaws =
      texts.toLowerCase().includes("bylaws") ||
      texts.toLowerCase().includes("bylaw") ||
      texts.toLowerCase().includes("soyosoyo");

    console.log(`📋 [DEBUG] Retrieved ${texts.length} chars, bylaws: ${hasBylaws}`);

    res.json({
      success: true,
      totalLength: texts.length,
      preview,
      analysis: {
        hasBylaws,
        hasContent: texts.length > 100,
        isError: texts.includes("Unable to retrieve") || texts.includes("No valid document"),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [DEBUG] Text retrieval error:", err);
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

// ========================================
// MAIN API ENDPOINTS
// ========================================

router.post("/chat", async (req, res) => {
  try {
    console.log("💬 [PRODUCTION] Chat request received");
    const { message, conversationId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`💬 [PRODUCTION] Processing: "${message.substring(0, 50)}..."`);
    let currentConversationId = conversationId;

    if (!currentConversationId) {
      const [newConv] = await db.insert(conversations).values({
        title: message.substring(0, 100),
      }).returning({ id: conversations.id });
      currentConversationId = newConv.id;
      console.log(`🆕 [PRODUCTION] New conversation: ${currentConversationId}`);
    }

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "user",
      content: message,
    });

    const aiResponse = await generateChatResponse(message, currentConversationId);
    console.log(`🤖 [PRODUCTION] Generated response: ${aiResponse.length} chars`);

    const [savedMessage] = await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "assistant",
      content: aiResponse,
    }).returning({ id: messages.id });

    res.json({
      response: aiResponse,
      conversationId: currentConversationId,
      messageId: savedMessage.id,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [PRODUCTION] Chat error:", err);
    res.status(500).json({ error: "Failed to process chat message. Please try again.", details: err });
  }
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("📤 [PRODUCTION] File upload received");
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const file = req.file;
    console.log(`📄 [PRODUCTION] Processing: ${file.originalname} (${file.size} bytes)`);

    const result = await processFile(file.path, file.originalname, file.mimetype);

    const [uploadedFile] = await db.insert(uploadedFiles).values({
      filename: `${file.filename}-${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      extractedText: result.text,
      processed: true,
    }).returning({ id: uploadedFiles.id });

    console.log(`✅ [PRODUCTION] File saved: ${uploadedFile.id}`);

    res.json({
      success: true,
      file: {
        id: uploadedFile.id,
        name: file.originalname,
        size: file.size,
        extractedTextLength: result.text?.length || 0,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [PRODUCTION] Upload error:", err);
    res.status(500).json({ error: "Failed to process file upload", details: err });
  }
});

router.get("/conversations", async (req, res) => {
  try {
    const allConversations = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    res.json(allConversations);
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch conversations", details: err });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.timestamp);

    res.json({ conversation, messages: conversationMessages });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch conversation", details: err });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const totalMessages = await db.$count(messages);
    const totalFiles = await db.$count(uploadedFiles);
    const totalConversations = await db.$count(conversations
