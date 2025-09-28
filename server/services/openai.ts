// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db";
import { uploadedFiles } from "../../shared/schema";
import { isNotNull } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Fetch extracted texts from DB with SMART PRIORITIZATION
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 Testing database connection...");

    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText));

    console.log(`📊 Found ${rows.length} total files with text`);

    const validRows = rows.filter(r => r.text && r.text.trim().length > 0);

    if (validRows.length === 0) {
      return "No documents with extracted text found.";
    }

    // SMART PRIORITIZATION: Put important documents first
    validRows.sort((a, b) => {
      const aFilename = (a.filename || '').toLowerCase();
      const bFilename = (b.filename || '').toLowerCase();
      
      // Priority 1: Bylaws and policies
      const aPriority = aFilename.includes('bylaw') || aFilename.includes('policy') ? 1 :
                       aFilename.includes('loan') ? 2 :
                       aFilename.includes('financial') ? 3 :
                       aFilename.includes('member') ? 4 : 5;
      
      const bPriority = bFilename.includes('bylaw') || bFilename.includes('policy') ? 1 :
                       bFilename.includes('loan') ? 2 :
                       bFilename.includes('financial') ? 3 :
                       bFilename.includes('member') ? 4 : 5;
      
      return aPriority - bPriority;
    });

    // TOKEN MANAGEMENT: Prioritize important docs within limits
    const MAX_TOTAL_CHARS = 80000; // Increased for bylaws (~20K tokens)
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ Reached text limit, prioritized ${i} most important files`);
        break;
      }

      let text = row.text || "";
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      // For bylaws/policies, allow more space
      const isImportant = (row.filename || '').toLowerCase().includes('bylaw') || 
                         (row.filename || '').toLowerCase().includes('policy');
      
      if (text.length > remainingChars) {
        if (isImportant && remainingChars > 5000) {
          // Keep more of important documents
          text = text.substring(0, remainingChars) + `\n[Document continues - truncated for token management]`;
        } else {
          text = text.substring(0, Math.min(remainingChars, 10000)) + `\n[Document truncated for token management]`;
        }
      }

      processedTexts.push(`=== ${row.filename || `Document ${i + 1}`} ===\n${text}`);
      totalChars += text.length;
    }

    const allTexts = processedTexts.join("\n\n");
    console.log(`📝 Total extracted text: ${allTexts.length} chars (${processedTexts.length} documents)`);

    return allTexts;
  } catch (err) {
    console.error("❌ Database query failed:", err);
    return "Unable to retrieve SOYOSOYO SACCO documents.";
  }
}

// -----------------------------
// Generate chat response with conversation context
// -----------------------------
export async function generateChatResponse(userMessage: string, conversationId?: string): Promise<string> {
  try {
    console.log(`🤖 Processing message: "${userMessage}" (conversation: ${conversationId || 'new'})`);
    
    const extractedTexts = await getAllExtractedTexts();
    console.log(`📚 Extracted texts length: ${extractedTexts.length} chars`);

    // Start with system message
    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are the SOYOSOYO SACCO Assistant. 

CONTEXT RULES:
- Use the SOYOSOYO SACCO documents provided below as your primary knowledge base
- Maintain conversation context to answer follow-up questions naturally
- When users refer to previous answers (like "tell me more about that" or "what about the second option"), use the conversation history
- If information isn't in the documents OR previous conversation, say: "I don't have that information in the SOYOSOYO SACCO documents."

RESPONSE STYLE:
- Be helpful and conversational
- Remember what was discussed earlier in the conversation
- Provide specific details when available (names, amounts, procedures)
- Use **bold** for important information

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`
      }
    ];

    // Add conversation history if available
    if (conversationId) {
      try {
        console.log(`🔍 Retrieving conversation history for: ${conversationId}`);
        
        const { messages } = await import("../../shared/schema");
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

        console.log(`📜 Found ${conversationMessages.length} previous messages`);

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
          const systemMessage = messagesToSend[0];
          const recentMessages = messagesToSend.slice(-16); // Last 16 messages
          messagesToSend.splice(0, messagesToSend.length, systemMessage, ...recentMessages);
          console.log(`⚠️ Limited to last 8 conversation exchanges`);
        }

      } catch (historyError) {
        console.error("❌ Error retrieving conversation history:", historyError);
        // Continue without history rather than failing
      }
    }

    // Add current user message
    messagesToSend.push({
      role: "user",
      content: userMessage
    });

    console.log(`🚀 Sending ${messagesToSend.length} messages to OpenAI (including conversation context)`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 800,
      temperature: 0.1, // Slightly creative but consistent
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ Generated response: ${aiResponse.length} chars`);

    return aiResponse;
  } catch (error) {
    console.error("❌ OpenAI API error:", error);
    return `I'm experiencing technical difficulties. Please try again. Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

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
          content: `Summarize the content of ${fileName} (type: ${mimeType}):\n${content}\nProvide a summary (50-100 words) using only the information in the content.`
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

export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);
    
    // Create SACCO-themed prompt
    const saccoPrompt = `Professional SACCO (Savings and Credit Cooperative) themed image: ${prompt}. Style: clean, professional, financial services, modern, trustworthy. Colors: teal (#1e7b85), light green (#7dd3c0), white. High quality, suitable for banking/financial website.`;
    
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
    
    return imageUrl;
  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
