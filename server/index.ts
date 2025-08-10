import express from "express";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { processUploadedFile } from "./services/fileProcessor";
import fs from "fs/promises";
import path from "path";
import { insertFileSchema } from "./db/schema";
import { db, uploadedFiles } from "./storage";
import { eq } from "drizzle-orm";

// Define type for file processing result
interface FileProcessingResult {
  extractedText: string;
  analysis: unknown; // Replace with specific type if known
}

// Ensure upload directory exists
const UPLOAD_DIR = "/tmp/uploads";

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    console.log(`DEBUG: Created upload directory at ${UPLOAD_DIR}`);
  } catch (error) {
    console.error(`Error creating upload directory ${UPLOAD_DIR}:`, error);
  }
}

async function preloadAssets(): Promise<void> {
  const assetsDir = path.join(__dirname, "..", "attached_assets");
  const assetFiles = [
    "SOYOSOYO BY LAWS -2025_1754774335855.pdf",
    "loan policy_1754774281152.pdf",
  ];
  console.log(`DEBUG: Preloading assets from ${assetsDir}`);

  for (const fileName of assetFiles) {
    const filePath = path.join(assetsDir, fileName);
    try {
      await fs.access(filePath);
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = "application/pdf";
      const size = fileBuffer.length;
      const { extractedText, analysis }: FileProcessingResult = await processUploadedFile(
        fileBuffer,
        fileName,
        mimeType
      );

      // Check if file already exists in database
      const [existingFile] = await db
        .select({ id: uploadedFiles.id })
        .from(uploadedFiles)
        .where(eq(uploadedFiles.filename, fileName))
        .limit(1);

      if (!existingFile) {
        const fileData = insertFileSchema.parse({
          conversationId: "initial-assets",
          filename: fileName,
          originalName: fileName,
          mimeType,
          size,
          extractedText,
          metadata: { analysis },
        });

        await storage.createFile({
          ...fileData,
          content: fileBuffer.toString("base64"),
        });
        console.log(`DEBUG: Preloaded ${fileName} into database`);
      } else {
        console.log(
          `DEBUG: ${fileName} already exists in database, skipping preload`
        );
      }
    } catch (error) {
      console.error(`Error preloading ${fileName}:`, error);
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.static("client/dist"));

// Log DATABASE_URL for debugging
console.log("DEBUG: DATABASE_URL =", process.env.DATABASE_URL || "Not set");

registerRoutes(app).then(async (server: express.Express) => {
  try {
    await ensureUploadDir(); // Create upload directory
    await preloadAssets();
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
    server.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
});
