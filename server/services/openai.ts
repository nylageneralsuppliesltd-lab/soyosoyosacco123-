import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Fetch extracted texts from DB with BYLAWS FIRST PRIORITY
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 [PRODUCTION DEBUG] Testing database connection...");
    console.log("🔍 [PRODUCTION DEBUG] Environment:", process.env.NODE_ENV);
    console.log("🔍 [PRODUCTION DEBUG] DB URL exists:", !!process.env.DATABASE_URL);
    console.log("🔍 [PRODUCTION DEBUG] OpenAI Key exists:", !!process.env.OPENAI_API_KEY);

    // Get all files with extracted text
    const rawRows = await db
      .select({ 
        text: uploadedFiles.extractedText, 
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id 
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText));

    console.log(`📊 [PRODUCTION DEBUG] Found ${rawRows.length} total files with text`);

    // CORE FIX: Sort to put BYLAWS FIRST before token limit applies
    const rows = rawRows.sort((a, b) => {
      const aName = (a.filename || '').toLowerCase();
      const bName = (b.filename || '').toLowerCase();
      
      // Priority levels - BYLAWS GET TOP PRIORITY
      const aPriority = aName.includes('bylaw') ? 1 :
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

    console.log(`🎯 [PRODUCTION DEBUG] First 3 files after sorting: ${rows.slice(0, 3).map(r => r.filename).join(', ')}`);
    console.log(`🏛️ [PRODUCTION DEBUG] Bylaws files found: ${rows.filter(r => (r.filename || '').toLowerCase().includes('bylaw')).length}`);

    const validRows = rows.filter(r => r.text && r.text.trim().length > 0);
    console.log(`✅ [PRODUCTION DEBUG] Valid files after filtering: ${validRows.length}`);

    if (validRows.length === 0) {
      console.log("❌ [PRODUCTION DEBUG] NO VALID DOCUMENTS FOUND!");
      return "No documents with extracted text found in the SOYOSOYO SACCO database.";
    }

    // TOKEN MANAGEMENT: Ensure bylaws fit within limits
    const MAX_TOTAL_CHARS = 60000; // Conservative limit for GPT-4o (~15K tokens)
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ [PRODUCTION DEBUG] Reached text limit, included ${i} files`);
        break;
      }

      let text = row.text || "";
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      // For bylaws, preserve more content
      const isBylaw = (row.filename || '').toLowerCase().includes('bylaw');
      const isPolicy = (row.filename || '').toLowerCase().includes('policy');
      const isImportant = isBylaw || isPolicy;
      
      if (text.length > remainingChars) {
        if (isImportant && remainingChars > 10000) {
          // Keep more of important documents (bylaws/policies)
          text = text.substring(0, remainingChars) + `\n[Document continues but truncated for token management - ${text.length - remainingChars} more characters available]`;
          console.log(`⚠️ [PRODUCTION DEBUG] Truncated ${row.filename} from ${text.length} to ${remainingChars} chars`);
        } else {
          text = text.substring(0, Math.min(remainingChars, 15000)) + `\n[Document truncated for token management]`;
          console.log(`⚠️ [PRODUCTION DEBUG] Heavily truncated ${row.filename}`);
        }
      }

      processedTexts.push(`=== ${row.filename || `Document ${i + 1}`} ===\n${text}`);
      totalChars += text.length;
      
      console.log(`📝 [PRODUCTION DEBUG] Added ${row.filename}: ${text.length} chars (total: ${totalChars})`);
    }

    const allTexts = processedTexts.join("\n\n");
    console.log(`📋 [PRODUCTION DEBUG] Final context: ${allTexts.length} chars from ${processedTexts.length} documents`);
    
    // Check if bylaws are included
    const hasBylaws = allTexts.toLowerCase().includes('soyosoyo') && allTexts.toLowerCase().includes('bylaw');
    console.log(`🏛️ [PRODUCTION DEBUG] Bylaws included in context: ${hasBylaws}`);

    return allTexts;
  } catch (err) {
    console.error("❌ [PRODUCTION DEBUG] Database query failed:", err);
    console.error("❌ [PRODUCTION DEBUG] Error details:", (err as Error).message);
    return "Unable to retrieve SOYOSOYO SACCO documents due to database connection issues.";
  }
}

// -----------------------------
// Generate chat response with enhanced debugging
// -----------------------------
export async function generateChatResponse(userMessage: string, conversationId?: string): Promise<string> {
  try {
    console.log(`🤖 [PRODUCTION DEBUG] Processing message: "${userMessage}" (conversation: ${conversationId || 'new'})`);
    
    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 [PRODUCTION DEBUG] Retrieved context length: ${extractedTexts.length} chars`);

    if (extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No documents")) {
      console.log(`❌ [PRODUCTION DEBUG] No documents available for context`);
      return "I'm sorry, but I'm unable to access the SOYOSOYO SACCO documents at the moment. Please try again later.";
    }

    // Enhanced system message with better instructions
    const systemMessage = `You are the SOYOSOYO SACCO Assistant, a specialized AI assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

CRITICAL INSTRUCTIONS:
- Answer questions ONLY using the SOYOSOYO SACCO documents provided below
- If information is not in the provided documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."
- For questions about bylaws, policies, loans, or membership, refer to the specific document sections
- Maintain conversation context and remember previous exchanges
- Provide specific details like amounts, procedures, names when available
- Use **bold** for important information like deadlines, amounts, requirements

RESPONSE EXAMPLES:
- For bylaw questions: "According to the SOYOSOYO SACCO bylaws, [specific information]..."
- For policy questions: "The loan policy states that [specific details]..."
- For unavailable info: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`;

    // Start with system message
    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemMessage
      }
    ];

    // Add conversation history if available
    if (conversationId) {
      try {
        console.log(`🔍 [PRODUCTION DEBUG] Retrieving conversation history for: ${conversationId}`);
        
        const { messages } = await import("../../shared/schema.js");
        const { eq } = await import("drizzle-orm");
        
        const conversationMessages = await db
          .select({
            role: messages.role,
            content: messages.content,
            timestamp: messages.timestamp
          })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.timestamp);

        console.log(`📜 [PRODUCTION DEBUG] Found ${conversationMessages.length} previous messages`);

        // Add previous messages (excluding the current one we're about to add)
        for (const msg of conversationMessages) {
          if (msg.role === "user" || msg.role === "assistant") {
            messagesToSend.push({
              role: msg.role as "user" | "assistant",
              content: msg.content
            });
          }
        }

        // Limit message history to prevent token overflow (keep system + last 8 exchanges)
        if (messagesToSend.length > 17) { // system + 16 messages (8 exchanges)
          const systemMsg = messagesToSend[0];
          const recentMessages = messagesToSend.slice(-16); // Last 16 messages
          messagesToSend.splice(0, messagesToSend.length, systemMsg, ...recentMessages);
          console.log(`⚠️ [PRODUCTION DEBUG] Limited to last 8 conversation exchanges`);
        }

      } catch (historyError) {
        console.error("❌ [PRODUCTION DEBUG] Error retrieving conversation history:", historyError);
        // Continue without history rather than failing
      }
    }

    // Add current user message
    messagesToSend.push({
      role: "user",
      content: userMessage
    });

    console.log(`🚀 [PRODUCTION DEBUG] Sending ${messagesToSend.length} messages to OpenAI`);
    console.log(`🎯 [PRODUCTION DEBUG] Total system prompt chars: ${systemMessage.length}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 800,
      temperature: 0.1, // Consistent responses
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response at this time.";
    console.log(`✅ [PRODUCTION DEBUG] Generated response: ${aiResponse.length} chars`);
    console.log(`💰 [PRODUCTION DEBUG] Token usage: ${JSON.stringify(response.usage)}`);

    return aiResponse;
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] OpenAI API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('rate_limit')) {
      return "I'm experiencing high demand right now. Please try again in a moment.";
    } else if (errorMessage.includes('invalid_api_key')) {
      return "There's a configuration issue. Please contact support.";
    }
    
    return `I'm experiencing technical difficulties. Please try again. If the problem persists, please contact support.`;
  }
}

export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    console.log(`📄 [PRODUCTION DEBUG] Analyzing file: ${fileName} (${content.length} chars)`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a SOYOSOYO SACCO file analysis assistant. Summarize the provided file content using only the information in the content. Focus on key information relevant to SACCO operations, policies, financial data, or member information."
        },
        {
          role: "user",
          content: `Analyze and summarize the content of ${fileName} (type: ${mimeType}):\n\n${content}\n\nProvide a clear summary (50-150 words) highlighting the key information and its relevance to SOYOSOYO SACCO operations.`
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });
    
    const analysis = response.choices[0].message.content || "Could not analyze file content.";
    console.log(`✅ [PRODUCTION DEBUG] File analysis completed: ${analysis.length} chars`);
    return analysis;
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] File analysis error:", error);
    throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("🎨 [PRODUCTION DEBUG] Generating image with prompt:", prompt);
    
    // Create SACCO-themed prompt
    const saccoPrompt = `Professional SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY themed image: ${prompt}. Style: clean, professional, financial services, modern, trustworthy, African cooperative society. Colors: teal (#1e7b85), light green (#7dd3c0), white. High quality, suitable for banking/financial website. No text overlay.`;
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: saccoPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      user: userId
    });

    const imageUrl = response.data?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error("No image URL returned from OpenAI");
    }
    
    console.log("✅ [PRODUCTION DEBUG] Image generated successfully");
    return imageUrl;
  } catch (error) {
    console.error("❌ [PRODUCTION DEBUG] Image generation error:", error);
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
