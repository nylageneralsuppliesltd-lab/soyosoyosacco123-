import express from "express";
import { v4 as uuid } from "uuid";
import { db } from "./db";
import { uploadedFiles, insertFileSchema, chatRequestSchema, chatResponseSchema } from "../shared/schema";
import { processUploadedFile } from "./services/fileProcessor";
import { eq } from "drizzle-orm";

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production"
  });
});

router.post("/api/upload", async (req, res) => {
  try {
    console.log("DEBUG: /api/upload called");
    if (!req.files || !Array.isArray(req.files.files)) {
      console.log("DEBUG: No files uploaded");
      return res.status(400).json({ error: "No files uploaded" });
    }

    const results = [];
    for (const file of req.files.files) {
      console.log(`DEBUG: Processing ${file.originalname} (${file.mimetype})`);
      const parsed = insertFileSchema.safeParse({
        conversationId: req.body.conversationId || uuid(),
        filename: `${uuid()}-${file.originalname}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedText: undefined,
        metadata: undefined,
      });

      if (!parsed.success) {
        console.log(`DEBUG: Schema error: ${JSON.stringify(parsed.error.flatten())}`);
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { extractedText, analysis } = await processUploadedFile(file.buffer, file.originalname, file.mimetype);

      await db.insert(uploadedFiles).values({
        id: uuid(),
        ...parsed.data,
        extractedText,
        content: file.buffer.toString("base64"),
        uploadedAt: new Date(),
        processed: !!extractedText,
      });

      results.push({
        id: parsed.data.id,
        filename: file.originalname,
        analysis,
        conversationId: parsed.data.conversationId,
      });
    }

    console.log("DEBUG: Upload successful");
    res.json({ files: results });
  } catch (error) {
    console.error(`❌ Upload error: ${error}`);
    res.status(500).json({ error: "Failed to process file" });
  }
});

router.get("/api/files/:id", async (req, res) => {
  try {
    console.log(`DEBUG: Retrieving file ${req.params.id}`);
    const [file] = await db
      .select({ content: uploadedFiles.content, mimeType: uploadedFiles.mimeType, originalName: uploadedFiles.originalName })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, req.params.id))
      .limit(1);
    if (!file?.content) {
      console.log("DEBUG: File not found");
      return res.status(404).json({ error: "File not found" });
    }
    const buffer = Buffer.from(file.content, "base64");
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.originalName}"`,
    });
    res.send(buffer);
  } catch (error) {
    console.error(`❌ File retrieval error: ${error}`);
    res.status(500).json({ error: "Failed to retrieve file" });
  }
});

router.post("/api/chat", async (req, res) => {
  try {
    console.log("DEBUG: /api/chat called");
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log(`DEBUG: Chat schema error: ${JSON.stringify(parsed.error.flatten())}`);
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { message, conversationId, includeContext } = parsed.data;
    const finalConversationId = conversationId || uuid();
    let fileContext = "";
    if (includeContext) {
      const relevantFiles = await db.select({
        id: uploadedFiles.id,
        conversationId: uploadedFiles.conversationId,
        originalName: uploadedFiles.originalName,
        extractedText: uploadedFiles.extractedText,
      }).from(uploadedFiles).where(eq(uploadedFiles.conversationId, finalConversationId));
      fileContext = relevantFiles.map(f => `=== ${f.originalName} ===\n${f.extractedText || "No text extracted"}`).join('\n\n');
      console.log(`DEBUG: File context length: ${fileContext.length} chars`);
    }

    const { generateChatResponse } = await import("./services/openai");
    const aiResponse = await generateChatResponse(message, [], fileContext);

    const response = chatResponseSchema.parse({
      response: aiResponse,
      conversationId: finalConversationId,
      messageId: uuid(),
    });

    res.json(response);
  } catch (error) {
    console.error(`❌ Chat error: ${error}`);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

export async function registerRoutes(app: express.Express) {
  app.use(router);
}
