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
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function processFile(filePath: string, originalName: string, mimeType: string) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = "";
    
    if (mimeType.includes('text/') || originalName.endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      extractedText = `File: ${originalName}\nType: ${mimeType}\nProcessed for SOYOSOYO SACCO.`;
    }

    const analysis = await analyzeFileContent(extractedText, originalName, mimeType);
    return { text: extractedText, analysis };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    return {
      text: `File: ${originalName}\nError: ${err}`,
      analysis: `Processing failed: ${err}`
    };
  }
}

const router = express.Router();

// Fixed debug endpoints (no circular references)
router.get("/debug/files", async (req, res) => {
  try {
    const fileCount = await db
      .select({ count: uploadedFiles.id })
      .from(uploadedFiles);

    const bylawsCount = await db
      .select({ count: uploadedFiles.id })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText));

    res.json({ 
      success: true,
      stats: {
        total: fileCount.length,
        withText: bylawsCount.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: err });
  }
});

router.get("/debug/texts", async (req, res) => {
  try {
    const { getAllExtractedTexts } = await import("./services/openai.js");
    const texts = await getAllExtractedTexts();
    
    res.json({
      success: true,
      totalLength: texts.length,
      preview: texts.substring(0, 1000),
      hasBylaws: texts.toLowerCase().includes('bylaws') || texts.toLowerCase().includes('bylaw'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: err });
  }
});

// Chat endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    let currentConversationId = conversationId;

    if (!currentConversationId) {
      const [newConv] = await db.insert(conversations).values({
        title: message.substring(0, 100),
      }).returning({ id: conversations.id });
      currentConversationId = newConv.id;
    }

    // Save user message
    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "user",
      content: message,
    });

    // Generate response
    const aiResponse = await generateChatResponse(message, currentConversationId);

    // Save AI response  
    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "assistant", 
      content: aiResponse,
    });

    res.json({
      response: aiResponse,
      conversationId: currentConversationId,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Chat failed", details: err });
  }
});

// File upload
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const result = await processFile(file.path, file.originalname, file.mimetype);

    const [uploadedFile] = await db.insert(uploadedFiles).values({
      filename: `${file.filename}-${file.originalname}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      extractedText: result.text,
      processed: true,
    }).returning({ id: uploadedFiles.id });

    res.json({
      success: true,
      file: {
        id: uploadedFile.id,
        name: file.originalname,
        size: file.size,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Upload failed", details: err });
  }
});

export function registerRoutes(app: express.Application) {
  app.use("/api", router);
}

export default router;
