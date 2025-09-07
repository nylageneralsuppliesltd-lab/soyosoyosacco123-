import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
} from "../shared/schema";
import { eq } from "drizzle-orm";

// Initialize database - compatible with both Neon and Supabase
// AGGRESSIVE IPv4 WORKAROUND for Render connectivity issues
let connectionString = process.env.DATABASE_URL!;

// Force Supabase to use transaction pooler (IPv4-friendly)
if (connectionString.includes('supabase.co') && process.env.NODE_ENV === 'production') {
  // Use transaction pooler: pooler.*.supabase.co:6543
  connectionString = connectionString.replace('postgresql://', 'postgresql://');
  connectionString = connectionString.replace('db.', 'pooler.');
  connectionString = connectionString.replace(':5432', ':6543');
  // Add pool mode for transaction pooling
  connectionString += connectionString.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
}

console.log('Database config:', {
  env: process.env.NODE_ENV,
  hasUrl: !!process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'none',
  finalConnection: connectionString.replace(/:[^:]*@/, ':****@')
});

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Force IPv4 and aggressive timeouts
  options: process.env.NODE_ENV === 'production' ? '-c default_transaction_isolation=read_committed' : undefined,
  max: 5, // Smaller pool for transaction mode
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 8000,
});
export const db = drizzle(pool);

// Storage interface implementation
export const storage = {
  // Conversation methods
  async createConversation(data: any) {
    const [result] = await db.insert(conversations).values(data).returning();
    return result;
  },

  async getConversation(id: string) {
    const [result] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return result;
  },

  async getAllConversations() {
    return await db.select().from(conversations).orderBy(conversations.createdAt);
  },

  // Message methods
  async createMessage(data: any) {
    const [result] = await db.insert(messages).values(data).returning();
    return result;
  },

  async getMessagesByConversation(conversationId: string) {
    return await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.timestamp);
  },

  // File methods
  async createFile(data: any) {
    const [result] = await db.insert(uploadedFiles).values(data).returning();
    return result;
  },

  async getFile(id: string) {
    const [result] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id)).limit(1);
    return result;
  },

  async getAllFiles() {
    return await db.select().from(uploadedFiles).orderBy(uploadedFiles.uploadedAt);
  },

  async getFilesByConversation(conversationId: string) {
    return await db.select().from(uploadedFiles).where(eq(uploadedFiles.conversationId, conversationId));
  },

  // API Log methods
  async createApiLog(data: any) {
    const [result] = await db.insert(apiLogs).values(data).returning();
    return result;
  },

  async getApiLogs() {
    return await db.select().from(apiLogs).orderBy(apiLogs.timestamp);
  }
};

// Export schemas for external use
export { 
  conversations, 
  messages, 
  uploadedFiles, 
  apiLogs,
  insertConversationSchema,
  insertMessageSchema,
  insertFileSchema,
  insertApiLogSchema
};
