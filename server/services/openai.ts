// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db";
import { uploadedFiles } from "@shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// -----------------------------
// Fetch all extracted texts
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    const rows = await db
      .select({ text: uploadedFiles.extractedText })
      .from(uploadedFiles);

    const allTexts = rows
      .map((r, i) => `Document ${i + 1}:\n${r.text}`)
      .filter(Boolean)
      .join("\n\n");

    return allTexts.length > 5000
      ? allTexts.substring(0, 5000) + "\n...[truncated]"
      : allTexts;
  } catch (err) {
    console.error("Error fetching extracted texts:", err);
    return "No extracted text available.";
  }
}

// -----------------------------
// Generate chat response
// -----------------------------
export async function generateChatResponse(userMessage: string): Promise<string> {
  try {
    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Strict system prompt
    messagesToSend.push({
      role: "system",
      content: `
You are a SOYOSOYO SACCO assistant. ONLY use the reference materials provided below from uploaded documents.
Do NOT use prior assistant replies, general knowledge, or the internet.
If the answer is not in the reference material, respond exactly: "The information is not available."
`
    });

    const extractedTexts = await getAllExtractedTexts();

    // User message with reference material
    messagesToSend.push({
      role: "user",
      content: `Reference Material:\n${extractedTexts}\n\nUser Question:\n${userMessage}`
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 800,
      temperature: 0, // deterministic
    });

    return response.choices[0].message.content || "I couldn't generate a response.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// -----------------------------
// Analyze file content (keep for fileProcessor.ts)
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
    throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
