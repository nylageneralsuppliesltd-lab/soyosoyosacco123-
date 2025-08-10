import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { 
  conversations,
  messages,
  uploadedFiles,
  apiLogs,
  type Conversation,
  type Message,
  type UploadedFile,
  type ApiLog,
  insertConversationSchema,
  insertMessageSchema,
  insertFileSchema,
  insertApiLogSchema,
} from "../../shared/schema"; // Updated path
import { eq } from "drizzle-orm";

// Initialize database
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ... rest of the file unchanged ...
