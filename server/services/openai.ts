import OpenAI from "openai";
import { searchSimilarChunks } from "./vectorSearch.js";
import { Pool } from "pg"; // npm install pg @types/pg
import { v4 as uuidv4 } from "uuid"; // npm install uuid @types/uuid

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Neon Postgres pool (connects per request for serverless)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false 
  },
  enableChannelBinding: true,  // Opt-in for Neon's channel_binding=require
});

// DB helper: Get history (empty if none)
async function getHistory(conversationId: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT messages FROM chat_history WHERE conversation_id = $1",
      [conversationId]
    );
    return res.rows[0]?.messages || [];
  } finally {
    client.release();
  }
}

// DB helper: Save/upsert history (trims to last 20 msgs)
async function saveHistory(conversationId: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const client = await pool.connect();
  try {
    const trimmed = messages.slice(-20);
    await client.query(
      "INSERT INTO chat_history (conversation_id, messages) VALUES ($1, $2) ON CONFLICT (conversation_id) DO UPDATE SET messages = $2, updated_at = CURRENT_TIMESTAMP",
      [conversationId, JSON.stringify(trimmed)]
    );
  } finally {
    client.release();
  }
}

export async function generateChatResponse(
  userMessage: string,
  conversationId?: string
): Promise<{ response: string; conversationId?: string }> { // Minor: Return object for ID passthrough
  let finalId = conversationId;
  if (!finalId) {
    finalId = uuidv4();
    console.log(`🆕 [CHAT] New conversation started: ${finalId}`);
  }

  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let fallbackResponse: string | undefined;

  try {
    console.log(`🤖 [CHAT] Processing: "${userMessage.slice(0, 100)}..."`);

    // Load history if ID provided
    if (finalId) {
      history = await getHistory(finalId);
      history = history.slice(-20); // Trim for tokens
      console.log(`📜 [CHAT] Loaded ${history.length} messages from history`);
    }

    // Use vector search to find most relevant chunks
    const relevantChunks = await searchSimilarChunks(userMessage, 15);
    
    if (relevantChunks.length === 0) {
      fallbackResponse = "I'm sorry, but I don't have any SOYOSOYO SACCO documents to reference. Please ensure documents are uploaded.";
      if (finalId) {
        await saveHistory(finalId, [...history, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: fallbackResponse }]);
      }
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

RELEVANT SOYOSOYO SACCO DOCUMENTS:
${context}`;

    // Build messages with history (minimal addition)
    const messages = [
      { role: "system", content: systemMessage },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1000,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ [CHAT] Response: ${aiResponse.length} chars`);
    console.log(`💰 [CHAT] Tokens:`, response.usage);

    // Save to history
    if (finalId && aiResponse !== "I couldn't generate a response.") {
      history.push({ role: "user" as const, content: userMessage });
      history.push({ role: "assistant" as const, content: aiResponse });
      await saveHistory(finalId, history);
    }

    return { response: aiResponse, conversationId: finalId };
  } catch (error) {
    console.error("❌ [CHAT] Error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    
    if (err.includes('insufficient_quota') || err.includes('rate_limit')) {
      fallbackResponse = "I'm experiencing high demand. Please try again in a moment.";
      if (finalId) await saveHistory(finalId, [...history, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: fallbackResponse }]);
      return { response: fallbackResponse, conversationId: finalId };
    } else if (err.includes('invalid_api_key')) {
      fallbackResponse = "Configuration issue. Please contact support.";
      if (finalId) await saveHistory(finalId, [...history, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: fallbackResponse }]);
      return { response: fallbackResponse, conversationId: finalId };
    }
    
    fallbackResponse = "I'm experiencing technical difficulties. Please try again.";
    if (finalId) await saveHistory(finalId, [...history, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: fallbackResponse }]);
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
