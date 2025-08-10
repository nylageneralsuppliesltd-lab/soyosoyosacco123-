import { 
  type Conversation, 
  type InsertConversation,
  type Message,
  type InsertMessage,
  type UploadedFile,
  type InsertFile,
  type ApiLog,
  type InsertApiLog
} from "@shared/schema";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import path from "path";

export interface IStorage {
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getRecentMessages(limit: number): Promise<Message[]>;
  getFile(id: string): Promise<UploadedFile | undefined>;
  createFile(file: InsertFile): Promise<UploadedFile>;
  updateFile(id: string, updates: Partial<UploadedFile>): Promise<UploadedFile | undefined>;
  getFilesByConversation(conversationId: string): Promise<UploadedFile[]>;
  getAllFiles(): Promise<UploadedFile[]>;
  createApiLog(log: InsertApiLog): Promise<ApiLog>;
  getRecentApiLogs(limit: number): Promise<ApiLog[]>;
  getApiStats(): Promise<{
    totalMessages: number;
    filesProcessed: number;
    avgResponseTime: number;
    errorRate: number;
  }>;
}

export class SQLiteStorage implements IStorage {
  private db: Database.Database;

  constructor() {
    this.db = new Database(path.join("/app/data", "chatbot.db"), { verbose: console.log });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        content TEXT NOT NULL,
        role TEXT NOT NULL,
        timestamp TEXT NOT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversationId) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        conversationId TEXT,
        filename TEXT NOT NULL,
        originalName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        extractedText TEXT,
        metadata TEXT,
        uploadedAt TEXT NOT NULL,
        processed BOOLEAN NOT NULL,
        path TEXT,
        FOREIGN KEY (conversationId) REFERENCES conversations(id)
      );
      CREATE TABLE IF NOT EXISTS api_logs (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        statusCode INTEGER NOT NULL,
        responseTime INTEGER NOT NULL,
        errorMessage TEXT,
        timestamp TEXT NOT NULL
      );
    `);
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    if (!row) return undefined;
    return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = {
      id,
      title: insertConversation.title || "New Conversation",
      createdAt: now,
      updatedAt: now
    };
    this.db.prepare("INSERT INTO conversations (id, title, createdAt, updatedAt) VALUES (?, ?, ?, ?)")
      .run(id, conversation.title, now.toISOString(), now.toISOString());
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const existing = await this.getConversation(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.db.prepare("UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?")
      .run(updated.title, updated.updatedAt.toISOString(), id);
    return updated;
  }

  async getAllConversations(): Promise<Conversation[]> {
    const rows = this.db.prepare("SELECT * FROM conversations").all();
    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    })).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    const rows = this.db.prepare("SELECT * FROM messages WHERE conversationId = ?").all(conversationId);
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      conversationId: insertMessage.conversationId,
      content: insertMessage.content,
      role: insertMessage.role,
      timestamp: new Date(),
      metadata: insertMessage.metadata || null
    };
    this.db.prepare("INSERT INTO messages (id, conversationId, content, role, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, message.conversationId, message.content, message.role, message.timestamp.toISOString(), JSON.stringify(message.metadata));
    return message;
  }

  async getRecentMessages(limit: number): Promise<Message[]> {
    const rows = this.db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?").all(limit);
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }

  async getFile(id: string): Promise<UploadedFile | undefined> {
    const row = this.db.prepare("SELECT * FROM files WHERE id = ?").get(id);
    if (!row) return undefined;
    return {
      ...row,
      uploadedAt: new Date(row.uploadedAt),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      processed: !!row.processed
    };
  }

  async createFile(insertFile: InsertFile): Promise<UploadedFile> {
    const id = randomUUID();
    const file: UploadedFile = {
      id,
      conversationId: insertFile.conversationId || null,
      filename: insertFile.filename,
      originalName: insertFile.originalName,
      mimeType: insertFile.mimeType,
      size: insertFile.size,
      extractedText: insertFile.extractedText || null,
      metadata: insertFile.metadata || null,
      uploadedAt: new Date(),
      processed: insertFile.processed || false,
      path: insertFile.path || null
    };
    this.db.prepare("INSERT INTO files (id, conversationId, filename, originalName, mimeType, size, extractedText, metadata, uploadedAt, processed, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, file.conversationId, file.filename, file.originalName, file.mimeType, file.size, file.extractedText, JSON.stringify(file.metadata), file.uploadedAt.toISOString(), file.processed ? 1 : 0, file.path);
    return file;
  }

  async updateFile(id: string, updates: Partial<UploadedFile>): Promise<UploadedFile | undefined> {
    const existing = await this.getFile(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.db.prepare("UPDATE files SET filename = ?, originalName = ?, mimeType = ?, size = ?, extractedText = ?, metadata = ?, uploadedAt = ?, processed = ?, path = ? WHERE id = ?")
      .run(updated.filename, updated.originalName, updated.mimeType, updated.size, updated.extractedText, JSON.stringify(updated.metadata), updated.uploadedAt.toISOString(), updated.processed ? 1 : 0, updated.path, id);
    return updated;
  }

  async getFilesByConversation(conversationId: string): Promise<UploadedFile[]> {
    const rows = this.db.prepare("SELECT * FROM files WHERE conversationId = ?").all(conversationId);
    return rows.map(row => ({
      ...row,
      uploadedAt: new Date(row.uploadedAt),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      processed: !!row.processed
    })).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async getAllFiles(): Promise<UploadedFile[]> {
    const rows = this.db.prepare("SELECT * FROM files").all();
    return rows.map(row => ({
      ...row,
      uploadedAt: new Date(row.uploadedAt),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      processed: !!row.processed
    })).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async createApiLog(insertLog: InsertApiLog): Promise<ApiLog> {
    const id = randomUUID();
    const log: ApiLog = {
      id,
      endpoint: insertLog.endpoint,
      method: insertLog.method,
      statusCode: insertLog.statusCode,
      responseTime: insertLog.responseTime,
      timestamp: new Date(),
      errorMessage: insertLog.errorMessage || null
    };
    this.db.prepare("INSERT INTO api_logs (id, endpoint, method, statusCode, responseTime, errorMessage, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, log.endpoint, log.method, log.statusCode, log.responseTime, log.errorMessage, log.timestamp.toISOString());
    return log;
  }

  async getRecentApiLogs(limit: number): Promise<ApiLog[]> {
    const rows = this.db.prepare("SELECT * FROM api_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
    return rows.map(row => ({
      ...row,
      timestamp: new Date(row.timestamp),
      errorMessage: row.errorMessage || null
    }));
  }

  async getApiStats(): Promise<{
    totalMessages: number;
    filesProcessed: number;
    avgResponseTime: number;
    errorRate: number;
  }> {
    const totalMessages = this.db.prepare("SELECT COUNT(*) as count FROM messages").get().count;
    const filesProcessed = this.db.prepare("SELECT COUNT(*) as count FROM files WHERE processed = 1").get().count;
    const logs = this.db.prepare("SELECT responseTime, statusCode FROM api_logs").all();
    const avgResponseTime = logs.length > 0 ? logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length : 0;
    const errorCount = logs.filter(log => log.statusCode >= 400).length;
    const errorRate = logs.length > 0 ? (errorCount / logs.length) * 100 : 0;
    return { totalMessages, filesProcessed, avgResponseTime, errorRate };
  }
}

export const storage = new SQLiteStorage();
