import OpenAI from "openai";
import { searchSimilarChunks } from "./vectorSearch.js";
import { eq, desc } from "drizzle-orm";
import { conversations, messages } from "../../shared/schema.js"; // Adjust path to match your schema location from routes
import { db } from "../db.js"; // Import from your DB setup (index.js exports)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Helper: Get or create conversation ID
async function getOrCreateConversation(conversationId?: string): Promise<string> {
  if (conversationId) {
    // Check if exists
    const existing = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (existing.length > 0) {
      return existing[0].id;
    }
  }
  // Create new
  const [newConv] = await db.insert(conversations).values({
    title: "New Conversation", // Can update later based on first message if needed
  }).returning({ id: conversations.id });
  console.log(`🆕 [CHAT] New conversation started: ${newConv.id}`);
  return newConv.id;
}

// Helper: Load history messages
async function loadHistory(conversationId: string): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const history = await db.select({
    role: messages.role,
    content: messages.content,
  }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.timestamp);
  
  // Trim to last 20 for token limits
  return history.slice(-20);
}

// Helper: Save user and assistant messages
async function saveMessages(conversationId: string, userMessage: string, assistantResponse: string): Promise<void> {
  await db.insert(messages).values([
    {
      conversationId,
      content: userMessage,
      role: "user",
    },
    {
      conversationId,
      content: assistantResponse,
      role: "assistant",
    },
  ]);
}

export async function generateChatResponse(
  userMessage: string,
  conversationId?: string
): Promise<{ response: string; conversationId: string }> { // Return object with required ID
  const finalId = await getOrCreateConversation(conversationId);

  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let fallbackResponse: string | undefined;

  try {
    console.log(`🤖 [CHAT] Processing: "${userMessage.slice(0, 100)}..."`);

    // Load history
    history = await loadHistory(finalId);
    console.log(`📜 [CHAT] Loaded ${history.length} messages from history`);

    // Use vector search to find most relevant chunks
    const relevantChunks = await searchSimilarChunks(userMessage, 15);
    
    if (relevantChunks.length === 0) {
      fallbackResponse = "I'm sorry, but I don't have any SOYOSOYO SACCO documents to reference. Please ensure documents are uploaded.";
      await saveMessages(finalId, userMessage, fallbackResponse);
      return { response: fallbackResponse, conversationId: finalId };
    }

    // Prioritize financial documents
    const sortedChunks = relevantChunks.sort((a, b) => {
      const aIsFinancial = a.filename.toLowerCase().includes('financial');
      const bIsFinancial = b.filename.toLowerCase().includes('financial');
      if (aIsFinancial && !bIsFinancial) return -1;
      if (!aIsFinancial && bIsFinancial) return 1;
      return b.similarity - a.similarity;
    });

    // Build context from top chunks
    const context = sortedChunks
      .slice(0, 15)
      .map((chunk, i) => `[${chunk.filename}]\n${chunk.text}`)
      .join("\n\n---\n\n");

    console.log(`📚 [CHAT] Context: ${relevantChunks.length} chunks, ${context.length} chars`);

    const systemMessage = `You are the SOYOSOYO SACCO Assistant for SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD.

CRITICAL INSTRUCTIONS:
- Answer ONLY using the SOYOSOYO SACCO documents below
- For financial questions (profit, revenue, income, expenses, earnings):
  * Search for: INCOME STATEMENT, BALANCE SHEET, RETAINED EARNINGS
  * Key terms: "TOTAL INCOME", "TOTAL EXPENSES", "RETAINED EARNINGS", "PROFIT"
  * Calculate: PROFIT = TOTAL INCOME - TOTAL EXPENSES
  * Excel data has "Unnamed:" headers - focus on VALUES not column names
- For member/dividend questions: Look for "dividend", "member", "share capital", "distribution"
- Provide specific numbers and amounts from documents
- Use **bold** for important figures
- If info not in documents, say: "I don't have that specific information in the SOYOSOYO SACCO documents I have access to."
MATH/FORMATTING RULES:
- Always show calculations in plain text style (example: ROA = (8811.29 ÷ 786613.44) × 100 = 1.12%)
- Do NOT use LaTeX (\[ \], \( \), ^, _) or math markup
- Keep it readable like a financial report
RELEVANT SOYOSOYO SACCO DOCUMENTS:
${context}`;

    // Build messages with history (minimal addition)
    const messagesForOpenAI = [
      { role: "system", content: systemMessage },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesForOpenAI,
      max_tokens: 1000,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ [CHAT] Response: ${aiResponse.length} chars`);
    console.log(`💰 [CHAT] Tokens:`, response.usage);

    // Save to history
    if (aiResponse !== "I couldn't generate a response.") {
      await saveMessages(finalId, userMessage, aiResponse);
    }

    return { response: aiResponse, conversationId: finalId };
  } catch (error) {
    console.error("❌ [CHAT] Error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    
    if (err.includes('insufficient_quota') || err.includes('rate_limit')) {
      fallbackResponse = "I'm experiencing high demand. Please try again in a moment.";
      await saveMessages(finalId, userMessage, fallbackResponse);
      return { response: fallbackResponse, conversationId: finalId };
    } else if (err.includes('invalid_api_key')) {
      fallbackResponse = "Configuration issue. Please contact support.";
      await saveMessages(finalId, userMessage, fallbackResponse);
      return { response: fallbackResponse, conversationId: finalId };
    }
    
    fallbackResponse = "I'm experiencing technical difficulties. Please try again.";
    await saveMessages(finalId, userMessage, fallbackResponse);
    return { response: fallbackResponse, conversationId: finalId };
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
          content: "Analyze file content and provide a brief summary for SACCO operations."
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
    return "Analysis completed.";
  }
}

// Export for debug endpoint in routes
export async function getAllExtractedTexts() {
  const files = await db.select({ extractedText: messages.extractedText }).from(uploadedFiles).where(isNotNull(uploadedFiles.extractedText));
  return files.map(f => f.extractedText || '').join('\n\n---\n\n');
}
