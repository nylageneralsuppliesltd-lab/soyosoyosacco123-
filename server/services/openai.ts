// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db";
import { uploadedFiles } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Fetch extracted texts from DB
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    const rows = await db
      .select({ text: uploadedFiles.extractedText })
      .from(uploadedFiles)
      .where(uploadedFiles.extractedText.isNotNull());

    const allTexts = rows
      .map((r, i) => `Document ${i + 1}:\n${r.text}`)
      .join("\n\n");

    console.log("Fetched extracted texts length:", allTexts.length);
    console.log("Fetched extracted texts preview:", allTexts.substring(0, 500));

    return allTexts.length > 0
      ? allTexts
      : "No extracted text available.";
  } catch (err) {
    console.error("Error fetching extracted texts:", err);
    return "No extracted text available due to DB error.";
  }
}

// -----------------------------
// Generate chat response using only DB content
// -----------------------------
export async function generateChatResponse(userMessage: string): Promise<string> {
  try {
    const extractedTexts = await getAllExtractedTexts();

    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `
You are a strict assistant for SOYOSOYO SACCO.
ONLY use the extracted texts provided below.
Do NOT use prior assistant replies, training data, or the internet.
If the answer is not in the extracted texts, respond exactly:
"The information is not available."
`
      },
      {
        role: "user",
        content: `EXTRACTED TEXTS:\n${extractedTexts}\n\nQUESTION: ${userMessage}`
      }
    ];

    console.log("Sending to OpenAI. User message:", userMessage);
    console.log("Extracted texts length sent:", extractedTexts.length);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 800,
      temperature: 0, // deterministic
    });

    return response.choices[0].message.content || "I couldn't generate a response.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return `OpenAI error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

// -----------------------------
// Keep for fileProcessor.ts
// -----------------------------
export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a file analysis assistant. Summarize the provided file content using only the information in the content."
        },
        {
          role: "user",
          content: `Summarize the content of ${fileName} (type: ${mimeType}):\n${content}\nProvide a summary (50-100 words).`
        }
      ],
      max_tokens: 200,
    });

    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    return `Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
