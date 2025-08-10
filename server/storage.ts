import Database from "better-sqlite3";
import path from "path";
import fs from "fs/promises";
import { 
  type Message, type Conversation, type File, type ApiLog,
  insertMessageSchema, insertFileSchema, insertApiLogSchema, insertConversationSchema
} from "@shared/schema";

const dbPath = process.env.NODE_ENV === "production" 
  ? "/app/data/chatbot.db" 
  : path.join(__dirname, "data", "chatbot.db");

export const storage = {
  async init() {
    try {
      console.log(`DEBUG: Initializing database at ${dbPath}`);
      await fs.mkdir(path.dirname(dbPath), { recursive: true });
      console.log(`DEBUG: Directory ${path.dirname(dbPath)} created or already exists`);
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversationId TEXT,
          content TEXT NOT NULL,
          role TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
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
          path TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
        CREATE TABLE IF NOT EXISTS api_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          statusCode INTEGER NOT NULL,
          responseTime INTEGER NOT NULL,
          errorMessage TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log(`DEBUG: Database tables initialized`);
      return db;
    } catch (error) {
      console.error(`Failed to initialize database at ${dbPath}:`, error);
      throw error;
    }
  },

  async createConversation(data: Omit<Conversation, "id" | "createdAt" | "updatedAt">) {
    const db = await this.init();
    const id = require("crypto").randomUUID();
    const validated = insertConversationSchema.parse({ ...data, id });
    const stmt = db.prepare(`
      INSERT INTO conversations (id, title, createdAt, updatedAt)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(validated.id, validated.title);
    db.close();
    return { id, title: validated.title, createdAt: new Date(), updatedAt: new Date() };
  },

  async getConversation(id: string) {
    const db = await this.init();
    const stmt = db.prepare("SELECT * FROM conversations WHERE id = ?");
    const result = stmt.get(id) as Conversation | undefined;
    db.close();
    return result;
  },

  async updateConversation(id: string, data: Partial<Omit<Conversation, "id" | "createdAt">>) {
    const db = await this.init();
    const stmt = db.prepare(`
      UPDATE conversations SET title = COALESCE(?, title), updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(data.title, id);
    db.close();
    return this.getConversation(id);
  },

  async createMessage(data: Omit<Message, "id" | "createdAt">) {
    const db = await this.init();
    const id = require("crypto").randomUUID();
    const validated = insertMessageSchema.parse({ ...data, id });
    const stmt = db.prepare(`
      INSERT INTO messages (id, conversationId, content, role, createdAt, metadata)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `);
    stmt.run(validated.id, validated.conversationId, validated.content, validated.role, JSON.stringify(validated.metadata));
    db.close();
    return { ...validated, createdAt: new Date() };
  },

  async getMessagesByConversation(conversationId: string) {
    const db = await this.init();
    const stmt = db.prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt");
    const results = stmt.all(conversationId) as Message[];
    db.close();
    return results.map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata as string) : null
    }));
  },

  async createFile(data: Omit<File, "id" | "createdAt">) {
    const db = await this.init();
    const id = require("crypto").randomUUID();
    const validated = insertFileSchema.parse({ ...data, id });
    const stmt = db.prepare(`
      INSERT INTO files (id, conversationId, filename, originalName, mimeType, size, extractedText, metadata, path, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      validated.id,
      validated.conversationId,
      validated.filename,
      validated.originalName,
      validated.mimeType,
      validated.size,
      validated.extractedText,
      JSON.stringify(validated.metadata),
      validated.path
    );
    db.close();
    return { ...validated, createdAt: new Date() };
  },

  async getFile(id: string) {
    const db = await this.init();
    const stmt = db.prepare("SELECT * FROM files WHERE id = ?");
    const result = stmt.get(id) as File | undefined;
    db.close();
    return result ? { ...result, metadata: result.metadata ? JSON.parse(result.metadata as string) : null } : null;
  },

  async getFilesByConversation(conversationId: string) {
    const db = await this.init();
    const stmt = db.prepare("SELECT * FROM files WHERE conversationId = ? ORDER BY createdAt");
    const results = stmt.all(conversationId) as File[];
    db.close();
    return results.map(file => ({
      ...file,
      metadata: file.metadata ? JSON.parse(file.metadata as string) : null
    }));
  },

  async createApiLog(data: Omit<ApiLog, "id" | "createdAt">) {
    const db = await this.init();
    const stmt = db.prepare(`
      INSERT INTO api_logs (endpoint, method, statusCode, responseTime, errorMessage, createdAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(data.endpoint, data.method, data.statusCode, data.responseTime, data.errorMessage);
    db.close();
    return { ...data, id: 0, createdAt: new Date() };
  }
};
