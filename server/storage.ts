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
} from "./db/schema";
import { eq } from "drizzle-orm";

// Initialize database
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export const storage = {
  async init() {
    console.log(`DEBUG: Initializing PostgreSQL database`);
    // Schema is applied via drizzle-kit push
    return db;
  },

  async createConversation(data: Omit<Conversation, "id" | "createdAt" | "updatedAt">) {
    const validated = insertConversationSchema.parse(data);
    const [result] = await db
      .insert(conversations)
      .values({
        title: validated.title || "New Conversation",
      })
      .returning({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt });
    return result as Conversation;
  },

  async getConversation(id: string) {
    const [result] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return result as Conversation | undefined;
  },

  async updateConversation(id: string, data: Partial<Omit<Conversation, "id" | "createdAt">>) {
    await db
      .update(conversations)
      .set({ title: data.title, updatedAt: new Date() })
      .where(eq(conversations.id, id));
    return this.getConversation(id);
  },

  async createMessage(data: Omit<Message, "id" | "timestamp">) {
    const validated = insertMessageSchema.parse(data);
    const [result] = await db
      .insert(messages)
      .values({
        conversationId: validated.conversationId,
        content: validated.content,
        role: validated.role,
        metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
      })
      .returning({ id: messages.id, conversationId: messages.conversationId, content: messages.content, role: messages.role, timestamp: messages.timestamp, metadata: messages.metadata });
    return {
      ...result,
      metadata: result.metadata ? JSON.parse(result.metadata as string) : null,
    } as Message;
  },

  async getMessagesByConversation(conversationId: string) {
    const results = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
    return results.map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata as string) : null,
    })) as Message[];
  },

  async createFile(data: Omit<UploadedFile, "id" | "uploadedAt" | "processed"> & { content?: string }) {
    const validated = insertFileSchema.parse(data);
    const [result] = await db
      .insert(uploadedFiles)
      .values({
        conversationId: validated.conversationId,
        filename: validated.filename,
        originalName: validated.originalName,
        mimeType: validated.mimeType,
        size: validated.size,
        extractedText: validated.extractedText,
        metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
        content: data.content,
        processed: true,
      })
      .returning();
    return {
      ...result,
      metadata: result.metadata ? JSON.parse(result.metadata as string) : null,
    } as UploadedFile;
  },

  async getFile(id: string) {
    const [result] = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, id))
      .limit(1);
    return result
      ? { ...result, metadata: result.metadata ? JSON.parse(result.metadata as string) : null }
      : null;
  },

  async getFilesByConversation(conversationId: string) {
    const results = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.conversationId, conversationId))
      .orderBy(uploadedFiles.uploadedAt);
    return results.map(file => ({
      ...file,
      metadata: file.metadata ? JSON.parse(file.metadata as string) : null,
    })) as UploadedFile[];
  },

  async createApiLog(data: Omit<ApiLog, "id" | "timestamp">) {
    const validated = insertApiLogSchema.parse(data);
    const [result] = await db
      .insert(apiLogs)
      .values({
        endpoint: validated.endpoint,
        method: validated.method,
        statusCode: validated.statusCode,
        responseTime: validated.responseTime,
        errorMessage: validated.errorMessage,
      })
      .returning({ id: apiLogs.id, timestamp: apiLogs.timestamp });
    return { ...validated, id: result.id, timestamp: result.timestamp } as ApiLog;
  },
};
