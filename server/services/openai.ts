import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";
import { isNotNull } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Analyze question complexity for response sizing
// -----------------------------
function analyzeQuestionComplexity(question: string): { isSimple: boolean; maxTokens: number } {
  const lowerQ = question.toLowerCase();

  // Simple question patterns (short answers needed)
  const simplePatterns = [
    /^(who is|what is|when|where|how much|what time|is there|do you|can i|what's)/,
    /(chairperson|president|secretary|treasurer|manager)/,
    /(phone|email|address|location|hours|rate|fee)/,
    /(yes|no|true|false)/,
    /^.{1,50}$/ // Very short questions
  ];

  // Complex question patterns (detailed answers needed)
  const complexPatterns = [
    /(how to|process|procedure|steps|requirements|application|compare|difference|explain|describe)/,
    /(loan|credit|savings|investment|account|policy|bylaw)/,
    /(eligibility|qualification|benefits|terms|conditions)/,
    /\b(and|or)\b.*\b(and|or)\b/ // Multiple questions
  ];

  const isSimpleQuestion = simplePatterns.some(pattern => pattern.test(lowerQ));
  const isComplexQuestion = complexPatterns.some(pattern => pattern.test(lowerQ));

  if (isSimpleQuestion && !isComplexQuestion) {
    return { isSimple: true, maxTokens: 150 }; // Brief response
  } else if (isComplexQuestion) {
    return { isSimple: false, maxTokens: 800 }; // Detailed response
  } else {
    return { isSimple: false, maxTokens: 400 }; // Medium response
  }
}

// -----------------------------
// Fetch extracted texts from DB with SMART PRIORITIZATION
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 Testing database connection...");

    const { testDatabaseConnection } = await import("../db.js");
    const isConnected = await testDatabaseConnection();

    if (!isConnected) {
      console.log("❌ Database connection failed");
      return "Database connection is currently unavailable.";
    }

    console.log("🔍 Querying database for extracted texts...");

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
    let totalChars = 0;
    const processedTexts: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.log(`⚠️ Reached text limit, truncating remaining ${validRows.length - i} files`);
        break;
      }

      let text = row.text || "";
      const remainingChars = MAX_TOTAL_CHARS - totalChars;
      
      if (text.length > remainingChars) {
        text = text.substring(0, remainingChars) + `\n[Document truncated for token management]`;
      }

      processedTexts.push(`=== ${row.filename || `Document ${i + 1}`} ===\n${text}`);
      totalChars += text.length;
    }

    const allTexts = processedTexts.join("\n\n");
    console.log(`📝 Total extracted text: ${allTexts.length} chars`);

    return allTexts;
  } catch (err) {
    console.error("❌ Database query failed:", err);
    return "Unable to retrieve SOYOSOYO SACCO documents.";
  }
}

// -----------------------------
// Generate chat response with conversation context + smart tokens
// -----------------------------
export async function generateChatResponse(userMessage: string, conversationId?: string): Promise<string> {
  try {
    console.log(`🤖 Processing: "${userMessage}" (conversation: ${conversationId || 'new'})`);

    const extractedTexts = await getAllExtractedTexts();
    const { isSimple, maxTokens } = analyzeQuestionComplexity(userMessage);

    console.log(`📊 Question type: ${isSimple ? 'Simple' : 'Complex'}, Max tokens: ${maxTokens}`);

    if (extractedTexts.includes("Database connection") || extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No documents")) {
      return "I'm currently unable to access the SOYOSOYO SACCO documents. Please try again in a moment.";
    }

    // Smart system prompt based on question complexity
    const systemContent = isSimple
      ? `You are the SOYOSOYO SACCO Assistant. Provide brief, direct answers using the documents and conversation history.

CONTEXT RULES:
- Use SOYOSOYO SACCO documents as primary source
- Remember previous conversation context for follow-up questions
- Keep answers concise (1-3 sentences for simple questions)
- Include specific names, amounts, or details when asked
- Use **bold** for key information only

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`

      : `You are the SOYOSOYO SACCO Assistant. Provide comprehensive information using the documents and conversation history.

CONTEXT RULES:
- Use SOYOSOYO SACCO documents as primary knowledge base
- Maintain conversation context to answer follow-up questions naturally
- When users refer to previous answers ("tell me more about that"), use conversation history
- If information isn't in documents OR previous conversation, say: "I don't have that information in the SOYOSOYO SACCO documents."

RESPONSE STYLE:
- Be helpful and conversational
- Remember what was discussed earlier
- Provide specific details (names, amounts, procedures)
- Use **bold** for important information
- Use bullet points for lists when helpful

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}`;

    // Start with system message
    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent }
    ];

    // Add conversation history if available
    if (conversationId) {
      try {
        console.log(`🔍 Retrieving conversation history for: ${conversationId}`);

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

        // Limit message history to prevent token overflow (keep system + last 6 exchanges for simple, 4 for complex)
        const maxMessages = isSimple ? 13 : 9; // system + 12/8 messages (6/4 exchanges)
        if (messagesToSend.length > maxMessages) {
          const systemMessage = messagesToSend[0];
          const recentMessages = messagesToSend.slice(-(maxMessages - 1));
          messagesToSend.splice(0, messagesToSend.length, systemMessage, ...recentMessages);
          console.log(`⚠️ Limited to last ${(maxMessages - 1) / 2} conversation exchanges`);
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

    console.log(`🚀 Sending ${messagesToSend.length} messages to OpenAI (${maxTokens} tokens max)`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: maxTokens,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ Response: ${aiResponse.length} chars`);

    return aiResponse;
  } catch (error) {
    console.error("❌ OpenAI error:", error);
    return "I'm currently experiencing technical difficulties. Please try again.";
  }
}

// -----------------------------
// File analysis function (optimized)
// -----------------------------
export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Provide a concise summary (50-80 words) highlighting key SACCO information."
        },
        {
          role: "user",
          content: `Summarize key information from: ${fileName}\n\nContent: ${content.substring(0, 2000)}...\n\nFocus on: leadership, policies, procedures, rates, requirements.`
        }
      ],
      max_tokens: 150,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "Could not analyze file.";
  } catch (error) {
    console.error("File analysis error:", error);
    return `Failed to analyze ${fileName}.`;
  }
}

// -----------------------------
// Image generation function (unchanged)
// -----------------------------
export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);

    const saccoPrompt = `Professional SACCO themed image: ${prompt}. Style: clean, professional, financial services. Colors: teal (#1e7b85), light green (#7dd3c0), white.`;

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
      throw new Error("No image URL returned");
    }

    return imageUrl;
  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
