// src/services/saccoAssistant.ts
import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// ✅ Simple text chunker (balanced splitting)
function chunkText(text: string, maxChunkSize = 8000): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChunkSize, text.length);
    let splitEnd = end;

    // try to split on sentence boundary or newline
    const lastPeriod = text.lastIndexOf(".", end);
    const lastNewline = text.lastIndexOf("\n", end);
    if (lastPeriod > start + 1000) {
      splitEnd = lastPeriod + 1;
    } else if (lastNewline > start + 1000) {
      splitEnd = lastNewline + 1;
    }

    chunks.push(text.slice(start, splitEnd).trim());
    start = splitEnd;
  }
  return chunks;
}

// ✅ Fetch all extracted texts from DB
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 [DEBUG] Fetching documents...");

    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id,
        uploadedAt: uploadedFiles.uploadedAt,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt));

    console.log(`📊 [DEBUG] Found ${rows.length} documents`);

    if (rows.length === 0) {
      return "No documents found in SOYOSOYO SACCO database.";
    }

    // ✅ Deduplicate (keep latest version of each file)
    const uniqueDocs = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const normalizedName = (row.filename || "")
        .toLowerCase()
        .replace(/[_\s-]+/g, "")
        .replace(/\.pdf$/, "")
        .replace(/\.txt$/, "");

      if (
        !uniqueDocs.has(normalizedName) ||
        new Date(row.uploadedAt) >
          new Date(uniqueDocs.get(normalizedName)!.uploadedAt)
      ) {
        uniqueDocs.set(normalizedName, row);
      }
    }

    const deduplicatedRows = Array.from(uniqueDocs.values());
    console.log(
      `🎯 [DEBUG] After deduplication: ${deduplicatedRows.length} unique documents`
    );

    // ✅ Prioritize documents (Bylaws > Policy > Loan > Financial > Member > Others)
    const prioritizedRows = deduplicatedRows.sort((a, b) => {
      const priority = (name: string) => {
        const n = (name || "").toLowerCase();
        if (n.includes("bylaw")) return 1;
        if (n.includes("policy")) return 2;
        if (n.includes("loan")) return 3;
        if (n.includes("financial")) return 4;
        if (n.includes("member")) return 5;
        return 10;
      };
      return priority(a.filename) - priority(b.filename);
    });

    console.log("🏛️ [DEBUG] First 3 prioritized documents:");
    prioritizedRows.slice(0, 3).forEach((row, i) => {
      console.log(
        `  ${i + 1}. ${row.filename} (${(row.text || "").length} chars)`
      );
    });

    // ✅ Limit total chars to avoid token overflow
    const MAX_TOTAL_CHARS = 111000;
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (const row of prioritizedRows) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ [DEBUG] Reached ${MAX_TOTAL_CHARS} char limit`);
        break;
      }

      let text = (row.text || "").trim();
      if (!text) continue;

      // ✅ Split into chunks
      const chunks = chunkText(text, 8000);

      for (const chunk of chunks) {
        if (totalChars >= MAX_TOTAL_CHARS) break;

        const remainingChars = MAX_TOTAL_CHARS - totalChars;
        let chunkTextFinal = chunk;

        if (chunk.length > remainingChars) {
          chunkTextFinal =
            chunk.substring(0, remainingChars) +
            "\n[Document truncated due to space limit]";
        }

        processedTexts.push(`=== ${row.filename} ===\n${chunkTextFinal}`);
        totalChars += chunkTextFinal.length;
      }
    }

    const finalContext = processedTexts.join("\n\n");
    console.log(
      `📋 [DEBUG] Final context: ${finalContext.length} chars from ${processedTexts.length} chunks`
    );

    return finalContext.length > 0
      ? finalContext
      : "No valid document content found.";
  } catch (error) {
    console.error("❌ [DEBUG] Document retrieval error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    return `Unable to retrieve SOYOSOYO SACCO documents due to database error: ${err}`;
  }
}

// ✅ Generate AI response
export async function generateChatResponse(
  userMessage: string,
  conversationId?: string
): Promise<string> {
  try {
    console.log(`🤖 [DEBUG] Processing message: "${userMessage.slice(0, 100)}..."`);

    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 [DEBUG] Context length: ${extractedTexts.length} chars`);

    if (
      extractedTexts.includes("Unable to retrieve") ||
      extractedTexts.includes("No valid document")
    ) {
      return "I'm sorry, but I'm unable to access the SOYOSOYO SACCO documents at the moment. Please try again later.";
    }

    const systemMessage = `You are the SOYOSOYO SACCO Assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

CRITICAL INSTRUCTIONS:
- Answer questions ONLY using the SOYOSOYO SACCO documents provided below
- If information is not in the provided documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."
- For questions about bylaws, policies, loans, or membership, refer to the specific document sections
- Provide specific details from the documents (amounts, procedures, names, requirements)
- Use **bold** for important information like deadlines, amounts, requirements
- Be helpful and professional

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "I couldn't generate a response.";
  } catch (error) {
    console.error("❌ [DEBUG] OpenAI error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";

    if (err.includes("insufficient_quota") || err.includes("rate_limit")) {
      return "I'm experiencing high demand right now. Please try again in a moment.";
    } else if (err.includes("invalid_api_key")) {
      return "There's a configuration issue. Please contact support.";
    }

    return "I'm experiencing technical difficulties. Please try again.";
  }
}

// ✅ Analyze single file content
export async function analyzeFileContent(
  content: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Analyze the file content and provide a brief summary focused on SACCO operations.",
        },
        {
          role: "user",
          content: `Analyze ${fileName}: ${content.substring(0, 2000)}...`,
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "Analysis completed.";
  } catch (error) {
    console.error("File analysis error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    return `Analysis failed: ${err}`;
  }
}
