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

export interface IStorage {
  // Conversations
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;

  // Messages
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getRecentMessages(limit: number): Promise<Message[]>;

  // Files
  getFile(id: string): Promise<UploadedFile | undefined>;
  createFile(file: InsertFile): Promise<UploadedFile>;
  updateFile(id: string, updates: Partial<UploadedFile>): Promise<UploadedFile | undefined>;
  getFilesByConversation(conversationId: string): Promise<UploadedFile[]>;
  getAllFiles(): Promise<UploadedFile[]>;

  // API Logs
  createApiLog(log: InsertApiLog): Promise<ApiLog>;
  getRecentApiLogs(limit: number): Promise<ApiLog[]>;
  getApiStats(): Promise<{
    totalMessages: number;
    filesProcessed: number;
    avgResponseTime: number;
    errorRate: number;
  }>;
}

export class MemStorage implements IStorage {
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message> = new Map();
  private files: Map<string, UploadedFile> = new Map();
  private apiLogs: Map<string, ApiLog> = new Map();

  // Conversations
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = {
      id,
      title: insertConversation.title || "New Conversation",
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    
    const updated = { ...conversation, ...updates, updatedAt: new Date() };
    this.conversations.set(id, updated);
    return updated;
  }

  async getAllConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort((a, b) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  // Messages
  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      conversationId: insertMessage.conversationId,
      content: insertMessage.content,
      role: insertMessage.role,
      timestamp: new Date(),
      metadata: insertMessage.metadata || null,
    };
    this.messages.set(id, message);
    return message;
  }

  async getRecentMessages(limit: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Files
  async getFile(id: string): Promise<UploadedFile | undefined> {
    return this.files.get(id);
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
      processed: false,
    };
    this.files.set(id, file);
    return file;
  }

  async updateFile(id: string, updates: Partial<UploadedFile>): Promise<UploadedFile | undefined> {
    const file = this.files.get(id);
    if (!file) return undefined;
    
    const updated = { ...file, ...updates };
    this.files.set(id, updated);
    return updated;
  }

  async getFilesByConversation(conversationId: string): Promise<UploadedFile[]> {
    return Array.from(this.files.values())
      .filter(file => file.conversationId === conversationId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async getAllFiles(): Promise<UploadedFile[]> {
    return Array.from(this.files.values())
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  // API Logs
  async createApiLog(insertLog: InsertApiLog): Promise<ApiLog> {
    const id = randomUUID();
    const log: ApiLog = {
      id,
      endpoint: insertLog.endpoint,
      method: insertLog.method,
      statusCode: insertLog.statusCode,
      responseTime: insertLog.responseTime,
      timestamp: new Date(),
      errorMessage: insertLog.errorMessage || null,
    };
    this.apiLogs.set(id, log);
    return log;
  }

  async getRecentApiLogs(limit: number): Promise<ApiLog[]> {
    return Array.from(this.apiLogs.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getApiStats(): Promise<{
    totalMessages: number;
    filesProcessed: number;
    avgResponseTime: number;
    errorRate: number;
  }> {
    const logs = Array.from(this.apiLogs.values());
    const totalMessages = Array.from(this.messages.values()).length;
    const filesProcessed = Array.from(this.files.values()).filter(f => f.processed).length;
    
    const responseTimes = logs.map(log => log.responseTime);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    const errorCount = logs.filter(log => log.statusCode >= 400).length;
    const errorRate = logs.length > 0 ? (errorCount / logs.length) * 100 : 0;

    return {
      totalMessages,
      filesProcessed,
      avgResponseTime,
      errorRate,
    };
  }
}

export const storage = new MemStorage();
