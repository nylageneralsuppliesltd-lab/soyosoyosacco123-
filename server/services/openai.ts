import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 [PRODUCTION DEBUG] Fetching documents...");
    
    // Get ALL documents with text, ordered by upload date (newest first to avoid duplicates)
    const rows = await db
      .select({ 
        text: uploadedFiles.extractedText, 
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id,
        uploadedAt: uploadedFiles.uploadedAt
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt));

    console.log(`📊 [PRODUCTION DEBUG] Found ${rows.length} documents`);
    
    if (rows.length === 0) {
      return "No documents found in SOYOSOYO SACCO database.";
    }

    // Remove duplicates (keep most recent version of each document)
    const uniqueDocs = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const normalizedName = (row.filename || '').toLowerCase()
        .replace(/[_\s-]+/g, '')
        .replace(/\.pdf$/, '')
        .replace(/\.txt$/, '');
      
      if (!uniqueDocs.has(normalizedName) || 
          new Date(row.uploadedAt) > new Date(uniqueDocs.get(normalizedName)!.uploadedAt)) {
        uniqueDocs.set(normalizedName, row);
      }
    }
    
    const deduplicatedRows = Array.from(uniqueDocs.values());
    console.log(`🎯 [PRODUCTION DEBUG] After deduplication: ${deduplicatedRows.length} unique documents`);

    // CRITICAL: Sort by priority - BYLAWS FIRST
    const prioritizedRows = deduplicatedRows.sort((a, b) => {
      const aName = (a.filename || '').toLowerCase();
      const bName = (b.filename || '').toLowerCase();
      
      const aPriority = aName.includes('bylaw') ? 1 :     // HIGHEST PRIORITY
                       aName.includes('policy') ? 2 :
                       aName.includes('loan') ? 3 :
                       aName.includes('financial') ? 4 :
                       aName.includes('member') ? 5 : 10;
                       
      const bPriority = bName.includes('bylaw') ? 1 :
                       bName.includes('policy') ? 2 :
                       bName.includes('loan') ? 3 :
                       bName.includes('financial') ? 4 :
                       bName.includes('member') ? 5 : 10;
      
      return aPriority - bPriority;
    });

    console.log(`🏛️ [PRODUCTION DEBUG] First 3 prioritized documents:`);
    prioritizedRows.slice(0, 3).forEach((row, i) => {
      console.log(`  ${i+1}. ${row.filename} (${(row.text || '').length} chars)`);
    });
    
    // Build comprehensive context with increased token budget
    const MAX_TOTAL_CHARS = 90000; // Generous budget for comprehensive coverage
    let totalChars = 0;
    const processedTexts: string[] = [];
    let bylawsIncluded = false;

    for (const row of prioritizedRows) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ [PRODUCTION DEBUG] Reached ${MAX_TOTAL_CHARS} char limit`);
        break;
      }
      
      let text = (row.text || "").trim();
      if (!text) continue;

      const isBylaws = (row.filename || '').toLowerCase().includes('bylaw');
      const isPolicy = (row.filename || '').toLowerCase().includes('policy');
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      // Ensure bylaws get maximum space
      if (isBylaws) {
        if (text.length > remainingChars && remainingChars > 40000) {
          text = text.substring(0, remainingChars - 2000) + "\n[BYLAWS content continues - full document processed]";
        }
        bylawsIncluded = true;
        console.log(`🏛️ [PRODUCTION DEBUG] BYLAWS INCLUDED: ${text.length} chars`);
      } else if (isPolicy && text.length > remainingChars && remainingChars > 20000) {
        text = text.substring(0, remainingChars - 1000) + "\n[Policy document continues]";
      } else if (text.length > remainingChars) {
        text = text.substring(0, Math.min(remainingChars, 20000)) + "\n[Document truncated for space]";
      }

      processedTexts.push(`=== ${row.filename} ===\n${text}`);
      totalChars += text.length;
      
      console.log(`📝 [PRODUCTION DEBUG] Added ${row.filename}: ${text.length} chars (total: ${totalChars})`);
    }

    const finalContext = processedTexts.join("\n\n");
    console.log(`📋 [PRODUCTION DEBUG] Final context: ${finalContext.length} chars from ${processedTexts.length} documents`);
    console.log(`🏛️ [PRODUCTION DEBUG] BYLAWS INCLUDED: ${bylawsIncluded}`);
    console.log(`✅ [PRODUCTION DEBUG] Context ready for OpenAI`);

    return finalContext.length > 0 ? finalContext : "No valid document content found.";
    
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] Document retrieval error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    return `Unable to retrieve SOYOSOYO SACCO documents due to database error: ${err}`;
  }
}

export async function generateChatResponse(userMessage: string, conversationId?: string): Promise<string> {
  try {
    console.log(`🤖 [PRODUCTION DEBUG] Processing message: "${userMessage.substring(0, 100)}..."`);
    
    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 [PRODUCTION DEBUG] Context length: ${extractedTexts.length} chars`);

    if (extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No valid document")) {
      return "I'm sorry, but I'm unable to access the SOYOSOYO SACCO documents at the moment. Please try again later.";
    }

    const systemMessage = `You are the SOYOSOYO SACCO Assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

CRITICAL INSTRUCTIONS:
- Answer questions ONLY using the SOYOSOYO SACCO documents provided below
- If information is not in the provided documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."
- For questions about bylaws, policies, loans, or membership, refer to the specific document sections
- Provide specific details from the documents (amounts, procedures, names, requirements)
- Use **bold** for important information like deadlines, amounts, requirements
- Be helpful and professional in your responses

RESPONSE EXAMPLES:
- For bylaw questions: "According to the SOYOSOYO SACCO bylaws, [specific information]..."
- For policy questions: "The loan policy states that [specific details]..."
- For membership: "Based on our membership requirements, [specific criteria]..."
- For unavailable info: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ [PRODUCTION DEBUG] Generated response: ${aiResponse.length} chars`);
    console.log(`💰 [PRODUCTION DEBUG] Token usage:`, response.usage);

    return aiResponse;
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] OpenAI error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    
    if (err.includes('insufficient_quota') || err.includes('rate_limit')) {
      return "I'm experiencing high demand right now. Please try again in a moment.";
    } else if (err.includes('invalid_api_key')) {
      return "There's a configuration issue. Please contact support.";
    }
    
    return "I'm experiencing technical difficulties. Please try again.";
  }
}

export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
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
