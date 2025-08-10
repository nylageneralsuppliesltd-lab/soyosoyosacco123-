import express from "express";
import { processUploadedFile } from "./services/fileProcessor";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles } from "../shared/schema";
import { db } from "./storage";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: express.Express) {
  const router = express.Router();

  router.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { conversationId } = req.body;
      const file = req.file;
      const filename = `${uuidv4()}-${file.originalname}`;
      const mimeType = file.mimetype;
      const size = file.size;

      // Process file
      const { extractedText, analysis } = await processUploadedFile(file.buffer, file.originalname, mimeType);

      // Store file metadata and content in PostgreSQL
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

      res.json({ id: createdFile.id, filename, originalName: file.originalname, mimeType, size, analysis });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process file" });
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

  router.post("/api/chat", async (req, res) => {
    // Existing chat route logic
    // Ensure it uses storage.getMessagesByConversation and storage.createMessage
  });

  app.use("/", router);
  return app;
}
