import crypto from "crypto";
import OpenAI from "openai";
import { db } from "./db"; // replace with your actual DB client

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

// --- 1. Generate hash of document content
function generateHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// --- 2. Fetch from DB if exists
async function getCachedSummary(fileHash: string) {
  const result = await db.summaries.findFirst({ where: { hash: fileHash } });
  return result ? result.summary : null;
}

// --- 3. Store summary in DB
async function saveSummary(fileName: string, fileHash: string, summary: string) {
  await db.summaries.create({
    data: { fileName, hash: fileHash, summary }
  });
}

// --- 4. Summarize new document if not cached
async function summarizeDocument(content: string, fileName: string): Promise<string> {
  const fileHash = generateHash(content);

  // ✅ Check cache first
  const cached = await getCachedSummary(fileHash);
  if (cached) {
    return `=== DOCUMENT: ${fileName} ===\n${cached}`;
  }

  // ❌ Not cached → summarize via OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Summarize this SACCO document in 200–300 words. Include key policies, figures, and rules only."
      },
      { role: "user", content }
    ],
    max_tokens: 500,
    temperature: 0.1
  });

  const summary = response.choices[0].message.content || "Summary unavailable";

  // ✅ Save to DB
  await saveSummary(fileName, fileHash, summary);

  return `=== DOCUMENT: ${fileName} ===\n${summary}`;
}

// --- 5. Build combined context
export async function buildFileContext(files: { name: string; content: string }[]): Promise<string> {
  const summaries: string[] = [];
  for (const file of files) {
    const summary = await summarizeDocument(file.content, file.name);
    summaries.push(summary);
  }
  return summaries.join("\n\n");
}
