import express from "express";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { processUploadedFile } from "./services/fileProcessor";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { insertFileSchema } from "../shared/schema";
import { eq } from "drizzle-orm";

async function preloadAssets() {
  const assetsDir = path.join(__dirname, "..", "attached_assets");
  const assetFiles = ["SOYOSOYO BY LAWS -2025_1754774335855.pdf", "loan policy_1754774281152.pdf"];
  console.log(`DEBUG: Preloading assets from ${assetsDir}`);

  for (const fileName of assetFiles) {
    const filePath = path.join(assetsDir, fileName);
    try {
      await fs.access(filePath);
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = "application/pdf";
      const size = fileBuffer.length;
      const { extractedText, analysis } = await processUploadedFile(fileBuffer, fileName, mimeType);

      // Check if file already exists in database
      const existingFiles = await storage.getAllFiles().then(files => 
        files.filter(f => f.filename === fileName)
      );

      if (existingFiles.length === 0) {
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
        console.log(`DEBUG: ${fileName} already exists in database, skipping preload`);
      }
    } catch (error) {
      console.error(`Error preloading ${fileName}:`, error);
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.static("client/dist"));

registerRoutes(app).then(async (server) => {
  await preloadAssets();
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
