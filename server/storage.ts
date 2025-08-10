import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./db/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

// Define type for file data
interface FileData {
  conversationId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  extractedText: string;
  metadata: unknown; // Replace with specific type if known
  content: string;
}

// Initialize Neon database
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is not set. Please set it in the Render Dashboard."
  );
}
const sql = neon(DATABASE_URL);
export const db = drizzle(sql, { schema });

// Multer storage configuration
const UPLOAD_DIR = "/tmp/uploads";

const diskStorage = multer.diskStorage({
  destination: async function (
    req: express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: function (
    req: express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

export const storage = {
  multer: multer({ storage: diskStorage }),
  async createFile(fileData: FileData): Promise<void> {
    const { conversationId, filename, originalName, mimeType, size, extractedText, metadata, content } =
      fileData;
    await db.insert(schema.uploadedFiles).values({
      conversationId,
      filename,
      originalName,
      mimeType,
      size,
      extractedText,
      metadata,
      content,
    });
  },
};

// Export uploadedFiles schema
export const { uploadedFiles } = schema;
