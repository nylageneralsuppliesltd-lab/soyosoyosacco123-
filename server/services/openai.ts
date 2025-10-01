import OpenAI from "openai";
import { searchSimilarChunks } from "./vectorSearch.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function generateChatResponse(
  userMessage: string,
  conversationId?: string
): Promise<string> {
  try {
    console.log(`🤖 [CHAT] Processing: "${userMessage.slice(0, 100)}..."`);

    // Use vector search to find most relevant chunks
    const relevantChunks = await searchSimilarChunks(userMessage, 15);
    
    if (relevantChunks.length === 0) {
      return "I'm sorry, but I don't have any SOYOSOYO SACCO documents to reference. Please ensure documents are uploaded.";
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
    console.log(`✅ [CHAT] Response: ${aiResponse.length} chars`);
    console.log(`💰 [CHAT] Tokens:`, response.usage);

    return aiResponse;
  } catch (error) {
    console.error("❌ [CHAT] Error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";
    
    if (err.includes('insufficient_quota') || err.includes('rate_limit')) {
      return "I'm experiencing high demand. Please try again in a moment.";
    } else if (err.includes('invalid_api_key')) {
      return "Configuration issue. Please contact support.";
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
