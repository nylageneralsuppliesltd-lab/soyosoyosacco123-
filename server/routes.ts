import express from "express";
import { processUploadedFile } from "./services/fileProcessor.js"; // ✅ Keep .js for ESM
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { insertFileSchema, uploadedFiles, conversations, messages, apiLogs } from "../shared/schema.js";
import { db, testDatabaseConnection } from "./db.js";
import { eq } from "drizzle-orm";

// Single multer configuration - increased limits and better error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // Only allow 1 file per request
    fieldSize: 1024 * 1024 // 1MB field size limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`🔍 Checking file: ${file.originalname} (${file.mimetype})`);
    
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      console.log(`✅ File type accepted: ${file.mimetype}`);
      cb(null, true);
    } else {
      console.log(`❌ File type rejected: ${file.mimetype}`);
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported: PDF, text, images, Word docs.`), false);
    }
  }
});

// Keep existing storage functions unchanged...
const storage = {
  async createFile(data: any) {
    try {
      const [result] = await db.insert(uploadedFiles).values(data).returning();
      console.log(`✅ File created in database: ${result.id}`);
      return result;
    } catch (error) {
      console.error("❌ Database insert error:", error);
      throw new Error("Failed to save file to database");
    }
  },
  // ... rest of storage functions remain the same
};

export async function registerRoutes(app: express.Express) {
  const router = express.Router();

  // ... existing routes remain the same until upload endpoint

  // FIXED UPLOAD ENDPOINT with comprehensive error handling
  router.post("/api/upload", (req, res, next) => {
    console.log("🔄 Upload endpoint hit");
    
    // Use upload middleware with error handling
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("❌ Multer error:", err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: "File too large",
            message: "File size must be less than 10MB"
          });
        }
        
        if (err.message.includes("Unsupported file type")) {
          return res.status(400).json({
            error: "Unsupported file type",
            message: err.message
          });
        }
        
        return res.status(400).json({
          error: "Upload error",
          message: err.message || "Failed to upload file"
        });
      }
      
      // Continue to main upload handler
      next();
    });
  }, async (req, res) => {
    console.log("🔄 Processing upload request");
    
    try {
      if (!req.file) {
        console.log("❌ No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { conversationId } = req.body;
      const file = req.file;
      const filename = `${uuidv4()}-${file.originalname}`;

      console.log(`📁 File details: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)}KB)`);

      // Check database connectivity
      console.log("🔍 Checking database connection...");
      const dbConnected = await testDatabaseConnection();
      if (!dbConnected) {
        console.log("❌ Database not available");
        return res.status(503).json({
          error: "Database temporarily unavailable",
          message: "Please try uploading again in a moment"
        });
      }
      console.log("✅ Database connection verified");

      // Process file with timeout and detailed logging
      console.log("🔄 Starting file processing...");
      const startTime = Date.now();
      
      const processingPromise = processUploadedFile(file.buffer, file.originalname, file.mimetype);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("File processing timeout after 30 seconds")), 30000)
      );

      const { extractedText, analysis } = await Promise.race([processingPromise, timeoutPromise]);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ File processed in ${processingTime}ms: ${extractedText.length} chars extracted`);

      // Prepare and validate file data
      const fileData = {
        conversationId: conversationId || null,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedText,
        metadata: { analysis, processingTime },
        content: file.buffer.toString("base64")
      };

      console.log("🔍 Validating file data with schema...");
      const validatedData = insertFileSchema.parse(fileData);
      console.log("✅ File data validated successfully");

      // Save to database with retry logic
      console.log("💾 Saving to database...");
      let createdFile;
      let retries = 3;

      while (retries > 0) {
        try {
          createdFile = await storage.createFile(validatedData);
          console.log(`✅ File saved successfully: ${createdFile.id}`);
          break;
        } catch (error) {
          retries--;
          console.error(`❌ Database save attempt ${3-retries}/3 failed:`, error);

          if (retries === 0) {
            throw new Error("Failed to save file to database after 3 attempts");
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Re-test connection
          const stillConnected = await testDatabaseConnection();
          if (!stillConnected) {
            throw new Error("Database connection lost during save");
          }
        }
      }

      // Success response
      const response = {
        id: createdFile.id,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedLength: extractedText.length,
        processingTime,
        analysis: analysis.substring(0, 200) + (analysis.length > 200 ? "..." : ""),
        success: true
      };

      console.log(`🎉 Upload completed successfully: ${response.id}`);
      res.json(response);

    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack",
        filename: req.file?.originalname || "No file",
        size: req.file?.size || 0,
        mimetype: req.file?.mimetype || "Unknown"
      };
      
      console.error("❌ Upload processing error:", errorDetails);

      // Return appropriate error response
      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          return res.status(408).json({
            error: "Processing timeout",
            message: "File took too long to process. Try a smaller file or different format."
          });
        }
        if (error.message.includes("PDF")) {
          return res.status(422).json({
            error: "PDF processing failed",
            message: "Unable to extract text from PDF. The file might be image-based or corrupted."
          });
        }
        if (error.message.includes("Database")) {
          return res.status(503).json({
            error: "Database error",
            message: "Temporary database issue. Please try again in a moment."
          });
        }
        if (error.message.includes("Unsupported file type")) {
          return res.status(400).json({
            error: "Unsupported file type",
            message: error.message
          });
        }
      }

      res.status(500).json({
        error: "Upload failed",
        message: "An unexpected error occurred during file processing.",
        details: process.env.NODE_ENV === "development" ? errorDetails.message : undefined
      });
    }
  });

  // ... rest of routes remain the same

  app.use("/", router);
  return app;
}
