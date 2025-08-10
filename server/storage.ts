import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { 
  type Message, type Conversation, type File, type ApiLog,
  insertMessageSchema, insertFileSchema, insertApiLogSchema, insertConversationSchema
} from "@shared/schema";
import { pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

// Define schema
const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversationId").references(() => conversations.id),
  content: text("content").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  metadata: text("metadata"),
});

const files = pgTable("files", {
  id: text("id").primaryKey(),
  conversationId: text("conversationId").references(() => conversations.id),
  filename: text("filename").notNull(),
  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  size: integer("size").notNull(),
  extractedText: text("extractedText"),
  metadata: text("metadata"),
  path: text("path").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

const apiLogs = pgTable("api_logs", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("statusCode").notNull(),
  responseTime: integer("responseTime").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow(),
});

// Initialize database
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export const storage = {
  async init() {
    console.log(`DEBUG: Initializing PostgreSQL database`);
    // Schema is created automatically by drizzle-orm when tables are accessed
    return db;
  },

  async createConversation(data: Omit<Conversation, "id" | "createdAt" | "updatedAt">) {
    const id = require("crypto").randomUUID();
    const validated = insertConversationSchema.parse({ ...data, id });
    await db.insert(conversations).values({
      id: validated.id,
      title: validated.title,
    });
    return { id, title: validated.title, createdAt: new Date(), updatedAt: new Date() };
  },

  async getConversation(id: string) {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return result[0] as Conversation | undefined;
  },

  async updateConversation(id: string, data: Partial<Omit<Conversation, "id" | "createdAt">>) {
    await db
      .update(conversations)
      .set({ title: data.title, updatedAt: new Date() })
      .where(eq(conversations.id, id));
    return this.getConversation(id);
  },

  async createMessage(data: Omit<Message, "id" | "createdAt">) {
    const id = require("crypto").randomUUID();
    const validated = insertMessageSchema.parse({ ...data, id });
    await db.insert(messages).values({
      id: validated.id,
      conversationId: validated.conversationId,
      content: validated.content,
      role: validated.role,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
    });
    return { ...validated, createdAt: new Date() };
  },

  async getMessagesByConversation(conversationId: string) {
    const results = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
    return results.map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
    })) as Message[];
  },

  async createFile(data: Omit<File, "id" | "createdAt">) {
    const id = require("crypto").randomUUID();
    const validated = insertFileSchema.parse({ ...data, id });
    await db.insert(files).values({
      id: validated.id,
      conversationId: validated.conversationId,
      filename: validated.filename,
      originalName: validated.originalName,
      mimeType: validated.mimeType,
      size: validated.size,
      extractedText: validated.extractedText,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
      path: validated.path,
    });
    return { ...validated, createdAt: new Date() };
  },

  async getFile(id: string) {
    const result = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);
    const file = result[0] as File | undefined;
    return file ? { ...file, metadata: file.metadata ? JSON.parse(file.metadata) : null } : null;
  },

  async getFilesByConversation(conversationId: string) {
    const results = await db
      .select()
      .from(files)
      .where(eq(files.conversationId, conversationId))
      .orderBy(files.createdAt);
    return results.map(file => ({
      ...file,
      metadata: file.metadata ? JSON.parse(file.metadata) : null,
    })) as File[];
  },

  async createApiLog(data: Omit<ApiLog, "id" | "createdAt">) {
    const [result] = await db
      .insert(apiLogs)
      .values({
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        responseTime: data.responseTime,
        errorMessage: data.errorMessage,
      })
      .returning({ id: apiLogs.id });
    return { ...data, id: result.id, createdAt: new Date() };
  },
};
