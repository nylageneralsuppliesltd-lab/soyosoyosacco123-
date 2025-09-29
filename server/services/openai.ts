import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 [PRODUCTION DEBUG] Fetching all documents...");
    
    // Get ALL documents, ordered by priority
    const rows = await db
      .select({ 
        text: uploadedFiles.extractedText, 
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id,
        uploadedAt: uploadedFiles.uploadedAt
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt)); // Most recent first to avoid duplicates

    console.log(`📊 [PRODUCTION DEBUG] Found ${rows.length} documents`);
    
    if (rows.length === 0) {
      return "No documents found in SOYOSOYO SACCO database.";
    }

    // Remove duplicates by filename (keep most recent)
    const uniqueDocs = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const normalizedName = (row.filename || '').toLowerCase().replace(/[_\s-]+/g, '');
      if (!uniqueDocs.has(normalizedName) || 
          new Date(row.uploadedAt) > new Date(uniqueDocs.get(normalizedName)!.uploadedAt)) {
        uniqueDocs.set(normalizedName, row);
      }
    }
    
    const deduplicatedRows = Array.from(uniqueDocs.values());
    console.log(`🎯 [PRODUCTION DEBUG] After deduplication: ${deduplicatedRows.length} documents`);

    // Sort by priority: BYLAWS FIRST, then others
    const prioritizedRows = deduplicatedRows.sort((a, b) => {
      const aName = (a.filename || '').toLowerCase();
      const bName = (b.filename || '').toLowerCase();
      
      const aPriority = aName.includes('bylaw') ? 1 :
                       aName.includes('policy') ? 2 :
                       aName.includes('loan') ? 3 : 10;
                       
      const bPriority = bName.includes('bylaw') ? 1 :
                       bName.includes('policy') ? 2 :
                       bName.includes('loan') ? 3 : 10;
      
      return aPriority - bPriority;
    });

    console.log(`🏛️ [PRODUCTION DEBUG] First 3 files: ${prioritizedRows.slice(0, 3).map(r => r.filename).join(', ')}`);
    
    // Build comprehensive context with LARGER token budget
    const MAX_TOTAL_CHARS = 80000; // Increased for comprehensive coverage
    let totalChars = 0;
    const processedTexts: string[] = [];
    let bylawsIncluded = false;

    for (const row of prioritizedRows) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      
      let text = (row.text || "").trim();
      if (!text) continue;

      const isBylaws = (row.filename || '').toLowerCase().includes('bylaw');
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      // Ensure bylaws get full allocation
      if (isBylaws) {
        if (text.length > remainingChars && remainingChars > 30000) {
          text = text.substring(0, remainingChars - 1000) + "\n[Bylaws content continues...]";
        }
        bylawsIncluded = true;
        console.log(`🏛️ [PRODUCTION DEBUG] BYLAWS INCLUDED: ${text.length} chars`);
      } else if (text.length > remainingChars) {
        text = text.substring(0, Math.min(remainingChars, 15000)) + "\n[Document truncated]";
      }

      processedTexts.push(`=== ${row.filename} ===\n${text}`);
      totalChars += text.length;
      
      console.log(`📝 [PRODUCTION DEBUG] Added ${row.filename}: ${text.length} chars (total: ${totalChars})`);
    }

    const finalContext = processedTexts.join("\n\n");
    console.log(`📋 [PRODUCTION DEBUG] Final context: ${finalContext.length} chars from ${processedTexts.length} documents`);
    console.log(`🏛️ [PRODUCTION DEBUG] Bylaws included: ${bylawsIncluded}`);

    return finalContext.length > 0 ? finalContext : "No valid document content found.";
    
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] Error:", error);
    return "Unable to retrieve SOYOSOYO SACCO documents due to database error.";
  }
}

export async function generateChatResponse(userMessage: string, conversationId?: string): Promise<string> {
  try {
    console.log(`🤖 [PRODUCTION DEBUG] Processing: "${userMessage.substring(0, 100)}..."`);
    
    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 [PRODUCTION DEBUG] Context length: ${extractedTexts.length} chars`);

    if (extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No valid document")) {
      return "I'm sorry, but I'm unable to access the SOYOSOYO SACCO documents at the moment. Please try again later.";
    }

    const systemMessage = `You are the SOYOSOYO SACCO Assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

INSTRUCTIONS:
- Answer questions ONLY using the SOYOSOYO SACCO documents provided below
- If information is not in the documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."
- Provide specific details from the documents (amounts, procedures, names)
- Use **bold** for important information

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
    console.log(`✅ [PRODUCTION DEBUG] Response: ${aiResponse.length} chars`);

    return aiResponse;
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] OpenAI error:", error);
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
          content: "Analyze the file content and provide a brief summary."
        },
        {
          role: "user",
          content: `Analyze ${fileName}: ${content.substring(0, 1000)}...`
        }
      ],
      max_tokens: 200,
      temperature: 0.1
    });
    
    return response.choices[0].message.content || "Analysis completed.";
  } catch (error) {
    console.error("File analysis error:", error);
    return `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
