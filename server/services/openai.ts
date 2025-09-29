// src/services/saccoAssistant.ts
import OpenAI from "openai";
import { getEncoding } from "tiktoken";  // npm i tiktoken for exact token counting
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

// ✅ Fetch all extracted texts from DB (with query relevance)
export async function getAllExtractedTexts(query?: string): Promise<string> {
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

    let prioritizedRows = Array.from(uniqueDocs.values());
    console.log(
      `🎯 [DEBUG] After deduplication: ${prioritizedRows.length} unique documents`
    );

    // ✅ Prioritize documents (Bylaws > Policy > Loan > Financial > Member > Others)
    prioritizedRows = prioritizedRows.sort((a, b) => {
      const priority = (name: string) => {
        const n = (name || "").toLowerCase();
        if (n.includes("bylaw") || n.includes("law")) return 1;  // Fixed: Added "law" for "BY LAWS"
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

    // ✅ Query-specific filtering for alignment
    let filteredRows = prioritizedRows;
    if (query) {
      const queryLower = query.toLowerCase();
      filteredRows = prioritizedRows.filter(row => {
        const nameLower = (row.filename || '').toLowerCase();
        const textLower = (row.text || '').toLowerCase();
        return nameLower.includes(queryLower) || textLower.includes(queryLower);
      });
      console.log(`🔍 [DEBUG] Filtered to ${filteredRows.length} relevant docs for "${query}"`);
    }

    // ✅ Limit total chars to avoid token overflow
    const MAX_TOTAL_CHARS = 111000;
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (const row of filteredRows) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ [DEBUG] Reached ${MAX_TOTAL_CHARS} char limit`);
        break;
      }

      let text = (row.text || "").trim();
      if (!text) continue;

      // ✅ Add file-specific summary for better display (bold key sections)
      let fileSummary = "";
      if (row.filename.toLowerCase().includes('financial')) {
        fileSummary = '**Financial Summary: Key metrics from balance sheet and income statement.**\n';
      } else if (row.filename.toLowerCase().includes('by laws') || row.filename.toLowerCase().includes('bylaw')) {
        fileSummary = '**By-Laws Key Points: Governance, membership, and election rules.**\n';
      } else if (row.filename.toLowerCase().includes('loan') || row.filename.toLowerCase().includes('policy')) {
        fileSummary = '**Loan Policy Highlights: Eligibility, rates, and procedures.**\n';
      } else if (row.filename.toLowerCase().includes('member') || row.filename.toLowerCase().includes('dividend')) {
        fileSummary = '**Member Data Summary: Qualifications and dividends.**\n';
      }

      // ✅ Split into chunks
      const chunks = chunkText(fileSummary + text, 8000);

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
    
    // ✅ Exact token count with tiktoken (optional, for debugging)
    try {
      const encoder = getEncoding('cl100k_base');
      const tokens = encoder.encode(finalContext).length;
      console.log(`📊 [DEBUG] Exact tokens: ${tokens} (est. chars: ${finalContext.length})`);
    } catch (e) {
      console.log(`📊 [DEBUG] Token count skipped: ${e.message}`);
    }

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

    const extractedTexts = await getAllExtractedTexts(userMessage);  // Pass query for filtering
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
- Always include financial and member details when relevant (amounts, dates, qualifications)
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
