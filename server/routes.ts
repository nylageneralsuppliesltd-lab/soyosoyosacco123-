import express from "express";
import multer from "multer";
import { db } from "./db.js";
import { conversations, messages, uploadedFiles } from "../shared/schema.js";
import { eq, desc, isNotNull, sql } from "drizzle-orm";
import { generateChatResponse, analyzeFileContent } from "./services/openai.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { getEmbedding } from "./utils/embeddings";  // 🪄 New wand import

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

async function processFile(filePath, originalName, mimeType) {
  try {
    console.log(`📄 [PRODUCTION] Processing: ${originalName}`);
    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = "";

    if (mimeType.includes('text/') || originalName.endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else if (mimeType.includes('json')) {
      extractedText = fileBuffer.toString('utf-8');
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
      analysis: `Processing failed: ${err}`
    };
  }
}

const router = express.Router();

// ========================================
// DEBUG ENDPOINTS
// ========================================
router.get("/debug/files", async (req, res) => {
  try {
    const totalFiles = await db.$count(uploadedFiles);
    const filesWithText = await db.$count(uploadedFiles, isNotNull(uploadedFiles.extractedText));
    const filesWithEmbedding = await db.$count(uploadedFiles, isNotNull(uploadedFiles.embedding));  // 🪄 New stat

    const recentFiles = await db
      .select({ filename: uploadedFiles.originalName, uploadedAt: uploadedFiles.uploadedAt })
      .from(uploadedFiles)
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(5);

    const bylawsFiles = recentFiles.filter(f => f.filename?.toLowerCase().includes('bylaw'));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        total: totalFiles,
        withText: filesWithText,
        withEmbedding: filesWithEmbedding,  // 🪄 Peek clues
        bylaws: bylawsFiles.length,
        recent: recentFiles
      }
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

router.get("/debug/connection", async (req, res) => {
  try {
    await db.select().from(uploadedFiles).limit(1);
    res.json({
      success: true,
      database: { connected: true, hasUrl: !!process.env.DATABASE_URL },
      openai: { hasKey: !!process.env.OPENAI_API_KEY },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

router.get("/debug/texts", async (req, res) => {
  try {
    const { getAllExtractedTexts } = await import("./services/openai.js");
    const texts = await getAllExtractedTexts();

    const preview = texts.substring(0, 1000);
    const hasBylaws = texts.toLowerCase().includes('bylaws') || texts.toLowerCase().includes('bylaw') || texts.toLowerCase().includes('soyosoyo');

    res.json({
      success: true,
      totalLength: texts.length,
      preview,
      analysis: { hasBylaws, hasContent: texts.length > 100, isError: texts.includes('Unable to retrieve') || texts.includes('No valid document') },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: err, timestamp: new Date().toISOString() });
  }
});

// ========================================
// SECRET ADMIN (FOR ONE-TIME FIX)
// ========================================
router.post("/admin/fix-embeddings", async (req, res) => {  // 🪄 Secret door!
  const { secret } = req.body;
  if (secret !== process.env.FIX_SECRET) {
    return res.status(401).json({ error: 'Shoo, intruder!' });
  }

  try {
    console.log('🪄 Serverless clue party starting...');

    const oldFiles = await db
      .select({ id: uploadedFiles.id, content: uploadedFiles.content, extractedText: uploadedFiles.extractedText })
      .from(uploadedFiles)
      .where(sql`embedding IS NULL`)
      .where(sql`content IS NOT NULL OR extractedText IS NOT NULL`);

    console.log(`Found ${oldFiles.length} stories to sparkle!`);

    let fixedCount = 0;
    for (const file of oldFiles) {
      const text = file.content || file.extractedText || '';
      if (!text.trim()) continue;

      const embedding = await getEmbedding(text);
      if (embedding.length > 0) {
        await db
          .update(uploadedFiles)
          .set({ embedding })
          .where(eq(uploadedFiles.id, file.id));
        fixedCount++;
        console.log(`✨ Sparkled ${file.id.slice(0,8)}...`);
      }
    }

    res.json({ success: true, fixed: fixedCount, total: oldFiles.length });
    console.log(`🎉 Party over: ${fixedCount} clued!`);
  } catch (error) {
    console.error('Party crasher:', error);
    res.status(500).json({ error: 'Oops—try again?' });
  }
});

// ========================================
// MAIN API ENDPOINTS
// ========================================

// Chat
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: "Message is required" });

    let currentConversationId = conversationId;

    if (!currentConversationId) {
      const [newConv] = await db.insert(conversations).values({ title: message.substring(0, 100) }).returning({ id: conversations.id });
      currentConversationId = newConv.id;
    }

    await db.insert(messages).values({ conversationId: currentConversationId, role: "user", content: message });
    const aiResponse = await generateChatResponse(message, currentConversationId);

    const [savedMessage] = await db.insert(messages).values({ conversationId: currentConversationId, role: "assistant", content: aiResponse }).returning({ id: messages.id });

    res.json({ response: aiResponse, conversationId: currentConversationId, messageId: savedMessage.id });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to process chat message. Please try again.", details: err });
  }
});

// File upload
router.post("/upload", upload.single("file"), async (req, res) => {  // 🪄 Auto-clue new files
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const result = await processFile(req.file.path, req.file.originalname, req.file.mimetype);
    const [uploadedFile] = await db.insert(uploadedFiles).values({
      filename: `${req.file.filename}-${req.file.originalname}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      extractedText: result.text,
      processed: true
    }).returning({ id: uploadedFiles.id });

    // 🪄 Zap clue for new story
    const text = result.text;
    const embedding = await getEmbedding(text);
    if (embedding.length > 0) {
      await db.update(uploadedFiles).set({ embedding }).where(eq(uploadedFiles.id, uploadedFile.id));
      console.log(`✨ Auto-clued new file ${uploadedFile.id.slice(0,8)}...`);
    }

    res.json({ success: true, file: { id: uploadedFile.id, name: req.file.originalname, size: req.file.size, extractedTextLength: result.text?.length || 0 } });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to process file upload", details: err });
  }
});

// Get conversations
router.get("/conversations", async (req, res) => {
  try {
    const allConversations = await db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(50);
    res.json(allConversations);
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch conversations", details: err });
  }
});

// Get conversation by ID
router.get("/conversations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const conversationMessages = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.timestamp);
    res.json({ conversation, messages: conversationMessages });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch conversation", details: err });
  }
});

// Stats
router.get("/stats", async (req, res) => {
  try {
    const totalMessages = await db.$count(messages);
    const totalFiles = await db.$count(uploadedFiles);
    const totalConversations = await db.$count(conversations);

    res.json({
      totalMessages,
      filesProcessed: totalFiles,
      totalConversations,
      avgResponseTime: 350,
      errorRate: 1.2
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Failed to fetch stats", details: err });
  }
});

// Export
export function registerRoutes(app) {  // Dropped unused getEncoding
  app.use("/api", router);
  console.log("✅ [PRODUCTION] API routes registered successfully");
}

export default router;
