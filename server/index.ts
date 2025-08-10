import express from "express";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { processUploadedFile } from "./services/fileProcessor";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { setupVite } from "./vite";
import { createServer } from "http";
import { insertFileSchema } from "../shared/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function preloadAssets() {
  const assetsDir = path.join(__dirname, "..", "attached_assets");
  const assetFiles = ["SOYOSOYO BY LAWS -2025_1754774335855.pdf", "loan policy_1754774281152.pdf"];
  console.log(`DEBUG: Preloading assets from ${assetsDir}`);

  // Create initial conversation for assets if it doesn't exist
  try {
    let initialConversation = await storage.getConversation("initial-assets");
    if (!initialConversation) {
      initialConversation = await storage.createConversation({
        id: "initial-assets",
        title: "Initial SACCO Documents",
      });
      console.log("DEBUG: Created initial conversation for assets");
    }
  } catch (error) {
    console.error("Error creating initial conversation:", error);
  }

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

import { setupVite } from "./vite";
import { createServer } from "http";

const app = express();
app.use(express.json());

const server = createServer(app);

registerRoutes(app).then(async () => {
  // Setup Vite development server
  await setupVite(app, server);
  
  // Preload assets after Vite is set up
  await preloadAssets();
  
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
  });
});
