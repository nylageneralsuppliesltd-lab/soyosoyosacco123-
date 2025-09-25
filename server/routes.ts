import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles } from "../shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { processUploadedFile } from "./services/fileProcessor";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: express.Express) {
  const router = express.Router();

  // Health check
  router.get("/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Upload endpoint
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

      await db.insert(uploadedFiles).values({
        id: uuidv4(),
        ...fileData,
        content: file.buffer.toString("base64"),
      });

      res.json({ id: fileData.id, filename, originalName: file.originalname, mimeType, size, analysis });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  // Other endpoints (chat, files, etc.)
  router.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, includeContext = true } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Create conversation if it doesn't exist
      let conversation;
      if (conversationId) {
        conversation = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
      }
      
      if (!conversation.length) {
        conversation = await db.insert(conversations).values({
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        }).returning();
      }

      // Save user message
      await db.insert(messages).values({
        conversationId: conversation[0].id,
        content: message,
        role: "user",
      });

      // Get conversation history
      const history = await db.select().from(messages).where(eq(messages.conversationId, conversation[0].id)).orderBy(messages.timestamp);
      
      // Get file context if requested
      let fileContext = "";
      if (includeContext) {
        const files = await db.select().from(uploadedFiles).where(eq(uploadedFiles.conversationId, conversation[0].id));
        const relevantFiles = files.filter(f => f.extractedText && f.extractedText.length > 0);
        
        console.log(`DEBUG: Found ${files.length} total files, ${relevantFiles.length} with extracted text`);
        
        if (relevantFiles.length > 0) {
          fileContext = relevantFiles
            .map(f => `=== ${f.originalName} ===\n${f.extractedText}`)
            .join('\n\n');
          console.log(`DEBUG: File context length: ${fileContext.length} characters`);
        }
      }

      // Generate AI response using the OpenAI service
      const { generateChatResponse } = await import("./services/openai");
      const aiResponse = await generateChatResponse(message, history, fileContext);
      
      // Save assistant message
      await db.insert(messages).values({
        conversationId: conversation[0].id,
        content: aiResponse,
        role: "assistant",
      });

      res.json({
        response: aiResponse,
        conversationId: conversation[0].id,
        messageId: uuidv4(),
      });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // ... (other endpoints like /api/files/:id, /api/stats, etc., as in your original code)

  app.use("/", router);
  return app;
}
