import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull, desc } from "drizzle-orm";
// ✅ Fixed import for tiktoken (CommonJS in ESM)
import tiktokenPkg from "tiktoken";
const { getEncoding } = tiktokenPkg;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 [PRODUCTION] Fetching documents...");
    
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

    console.log(`📊 [PRODUCTION] Found ${rows.length} documents`);

    if (rows.length === 0) {
      return "No documents found in SOYOSOYO SACCO database.";
    }

    // Deduplicate
    const uniqueDocs = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const normalizedName = (row.filename || "")
        .toLowerCase()
        .replace(/[_\s-]+/g, "")
        .replace(/\.pdf$/, "")
        .replace(/\.txt$/, "")
        .replace(/\.xlsx$/, "");

      if (
        !uniqueDocs.has(normalizedName) ||
        new Date(row.uploadedAt) > new Date(uniqueDocs.get(normalizedName)!.uploadedAt)
      ) {
        uniqueDocs.set(normalizedName, row);
      }
    }

    const allRows = Array.from(uniqueDocs.values());
    console.log(`🎯 [PRODUCTION] After deduplication: ${allRows.length} unique documents`);

    // CRITICAL: Sort to prioritize financial documents FIRST
    const prioritizedRows = allRows.sort((a, b) => {
      const aName = (a.filename || "").toLowerCase();
      const bName = (b.filename || "").toLowerCase();
      
      // Financial files get highest priority
      const aPriority = aName.includes('financial') ? 1 :
                       aName.includes('bylaw') ? 2 :
                       aName.includes('loan') || aName.includes('policy') ? 3 :
                       aName.includes('member') || aName.includes('dividend') ? 4 : 10;
                       
      const bPriority = bName.includes('financial') ? 1 :
                       bName.includes('bylaw') ? 2 :
                       bName.includes('loan') || bName.includes('policy') ? 3 :
                       bName.includes('member') || bName.includes('dividend') ? 4 : 10;
      
      return aPriority - bPriority;
    });

    console.log(`🏛️ [PRODUCTION] First 5 prioritized documents:`);
    prioritizedRows.slice(0, 5).forEach((row, i) => {
      console.log(`  ${i+1}. ${row.filename} (${(row.text || '').length} chars)`);
    });

    // Build context with generous budget for financial data
    const MAX_TOTAL_CHARS = 120000;
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (const row of prioritizedRows) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ [PRODUCTION] Reached ${MAX_TOTAL_CHARS} char limit`);
        break;
      }

      let text = (row.text || "").trim();
      if (!text) continue;

      const isFinancial = (row.filename || '').toLowerCase().includes('financial');
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      // Ensure financial files get full space
      if (isFinancial && text.length > remainingChars && remainingChars > 10000) {
        text = text.substring(0, remainingChars - 1000);
        console.log(`💰 [PRODUCTION] FINANCIAL FILE INCLUDED: ${text.length} chars`);
      } else if (text.length > remainingChars) {
        text = text.substring(0, Math.min(remainingChars, 20000));
      }

      processedTexts.push(`=== ${row.filename} ===\n${text}`);
      totalChars += text.length;
      
      console.log(`📝 [PRODUCTION] Added ${row.filename}: ${text.length} chars (total: ${totalChars})`);
    }

    const finalContext = processedTexts.join("\n\n");
    console.log(`📋 [PRODUCTION] Final context: ${finalContext.length} chars from ${processedTexts.length} documents`);

    return finalContext.length > 0 ? finalContext : "No valid document content found.";
    
  } catch (error) {
    console.error("❌ [PRODUCTION] Document retrieval error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    return `Unable to retrieve SOYOSOYO SACCO documents: ${err}`;
  }
}

export async function generateChatResponse(
  userMessage: string,
  conversationId?: string
): Promise<string> {
  try {
    console.log(`🤖 [PRODUCTION] Processing: "${userMessage.slice(0, 100)}..."`);

    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 [PRODUCTION] Context length: ${extractedTexts.length} chars`);

    if (
      extractedTexts.includes("Unable to retrieve") ||
      extractedTexts.includes("No valid document")
    ) {
      return "I'm sorry, but I'm unable to access the SOYOSOYO SACCO documents at the moment. Please try again later.";
    }

    // ENHANCED system prompt with explicit financial instructions
    const systemMessage = `You are the SOYOSOYO SACCO Assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

CRITICAL INSTRUCTIONS:
- Answer questions ONLY using the SOYOSOYO SACCO documents provided below
- For financial questions (profit, revenue, income, expenses, earnings):
  * Look for INCOME STATEMENT, BALANCE SHEET, RETAINED EARNINGS data
  * Search for terms: "TOTAL INCOME", "TOTAL EXPENSES", "RETAINED EARNINGS", "PROFIT"
  * Calculate profit as: TOTAL INCOME - TOTAL EXPENSES = PROFIT (or RETAINED EARNINGS)
  * Financial data may include "Unnamed:" column headers - focus on the VALUES not column names
- For member dividends: Look for "dividend", "member", "share capital", "distribution" data
- Provide specific numbers and amounts from the documents
- Use **bold** for important amounts and figures
- If information is not in the provided documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."

RESPONSE EXAMPLES:
- For profit: "According to our financial statements as of [DATE], SOYOSOYO SACCO made a profit of **KSH [AMOUNT]**. Total income was [AMOUNT] and total expenses were [AMOUNT]."
- For member info: "Based on our member records, [specific details from documents]..."
- For unavailable info: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ [PRODUCTION] Generated response: ${aiResponse.length} chars`);
    console.log(`💰 [PRODUCTION] Token usage:`, response.usage);

    return aiResponse;
  } catch (error) {
    console.error("❌ [PRODUCTION] OpenAI error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    
    if (err.includes('insufficient_quota') || err.includes('rate_limit')) {
      return "I'm experiencing high demand right now. Please try again in a moment.";
    } else if (err.includes('invalid_api_key')) {
      return "There's a configuration issue. Please contact support.";
    }
    
    return "I'm experiencing technical difficulties. Please try again.";
  }
}

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
          content: "Analyze the file content and provide a brief summary focused on SACCO operations."
        },
        {
          role: "user",
          content: `Analyze ${fileName}: ${content.substring(0, 2000)}...`
        }
      ],
      max_tokens: 200,
      temperature: 0.1
    });
    
    return response.choices[0].message.content || "Analysis completed.";
  } catch (error) {
    console.error("File analysis error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    return `Analysis failed: ${err}`;
  }
}
