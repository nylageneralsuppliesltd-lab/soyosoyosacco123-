import { pgTable, varchar, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Conversations Table
export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Messages Table
export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  role: text("role").notNull().$type<"user" | "assistant">(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  metadata: jsonb("metadata").default("{}"),
});

// Uploaded Files Table (Fixed to Match Your DB: size column, no text_length)
export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).references(() => conversations.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),  // Matches DB: original_name
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),  // Matches DB: size (integer for bytes)
  extractedText: text("extracted_text"),  // Matches DB: extracted_text
  metadata: jsonb("metadata").default("{}"),
  content: text("content"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),  // Matches DB: uploaded_at
  processed: boolean("processed").default(false).notNull(),
});

// API Logs Table
export const apiLogs = pgTable("api_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  errorMessage: text("error_message"),
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  files: many(uploadedFiles),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const uploadedFilesRelations = relations(uploadedFiles, ({ one }) => ({
  conversation: one(conversations, {
    fields: [uploadedFiles.conversationId],
    references: [conversations.id],
  }),
}));

// Zod Schemas
export const insertConversationSchema = createInsertSchema(conversations, { driver: "pg" }).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages, { driver: "pg" }).omit({
  id: true,
  timestamp: true,
  metadata: true,
});

export const insertFileSchema = createInsertSchema(uploadedFiles, { driver: "pg" }).omit({
  id: true,
  uploadedAt: true,
  processed: true,
});

export const insertApiLogSchema = createInsertSchema(apiLogs, { driver: "pg" }).omit({
  id: true,
  timestamp: true,
});

// Types
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof insertConversationSchema.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof insertMessageSchema.$inferInsert;

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertFile = typeof insertFileSchema.$inferInsert;

export type ApiLog = typeof apiLogs.$inferSelect;
export type InsertApiLog = typeof insertApiLogSchema.$inferInsert;

// Chat Schemas
export const chatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  conversationId: z.string().optional(),
  includeContext: z.boolean().default(true),
});

export const chatResponseSchema = z.object({
  response: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
