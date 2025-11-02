import OpenAI from "openai";
import { searchSimilarChunks } from "./vectorSearch.js";
import { eq, desc, isNotNull } from "drizzle-orm";
import { conversations, messages, uploadedFiles } from "../../shared/schema.js";
import { db } from "../db.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

/* -------------------------------------------------------------------------- */
/* 🗂️ Conversation management helpers                                         */
/* -------------------------------------------------------------------------- */

async function getOrCreateConversation(conversationId) {
  if (conversationId) {
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (existing.length > 0) return existing[0].id;
  }

  const [newConv] = await db
    .insert(conversations)
    .values({ title: "New Conversation" })
    .returning({ id: conversations.id });

  console.log(`🆕 [CHAT] New conversation started: ${newConv.id}`);
  return newConv.id;
}

async function loadHistory(conversationId) {
  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.timestamp);

  return history.slice(-20);
}

async function saveMessages(conversationId, userMessage, assistantResponse) {
  await db.insert(messages).values([
    { conversationId, content: userMessage, role: "user" },
    { conversationId, content: assistantResponse, role: "assistant" },
  ]);
}

/* -------------------------------------------------------------------------- */
/* 💬 Core Chat Function                                                      */
/* -------------------------------------------------------------------------- */

export async function generateChatResponse(
  userMessage,
  conversationId,
  targetLanguage
) {
  const finalId = await getOrCreateConversation(conversationId);

  let history = [];
  let fallbackResponse;

  try {
    console.log(`🤖 [CHAT] Processing: "${userMessage.slice(0, 100)}..."`);
    history = await loadHistory(finalId);

    // === VECTOR SEARCH ===
    const relevantChunks = await searchSimilarChunks(userMessage, 15);
    if (relevantChunks.length === 0) {
      const msg =
        "I'm sorry, but I don't have any SOYOSOYO SACCO documents to reference.";
      fallbackResponse = targetLanguage
        ? `${msg} (Responding in ${targetLanguage})`
        : msg;
      await saveMessages(finalId, userMessage, fallbackResponse);
      return { response: fallbackResponse, conversationId: finalId };
    }

    // === PRIORITIZE FINANCIAL FILES ===
    const sortedChunks = relevantChunks.sort((a, b) => {
      const aIsFinancial = a.filename.toLowerCase().includes("financial");
      const bIsFinancial = b.filename.toLowerCase().includes("financial");
      if (aIsFinancial && !bIsFinancial) return -1;
      if (!aIsFinancial && bIsFinancial) return 1;
      return b.similarity - a.similarity;
    });

    // === BUILD CONTEXT ===
    const context = sortedChunks
      .map(
        (chunk) =>
          `📄 **${chunk.filename}** (Similarity: ${(chunk.similarity * 100).toFixed(
            1
          )}%)\n${chunk.text.substring(0, 1800)}`
      )
      .join("\n\n---\n\n");

    console.log(
      `📚 [CHAT] Context built from ${sortedChunks.length} grouped chunks`
    );

    // === SYSTEM INSTRUCTIONS ===
    const systemMessage = `
You are the official **SOYOSOYO SACCO Virtual Assistant** for **SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD**.

CRITICAL INSTRUCTIONS:
- You must only use the SACCO documents provided in CONTEXT below.
- When answering, use factual numbers, names, and terms exactly as written.
- If data is missing, respond with: "I don’t have that specific information in the available SOYOSOYO SACCO documents."
- For financial questions:
  * Focus on INCOME STATEMENT, BALANCE SHEET, RETAINED EARNINGS.
  * Use these formulas: PROFIT = TOTAL INCOME - TOTAL EXPENSES.
  * Format all figures as plain text (e.g., 8811.29 ÷ 786613.44 × 100 = 1.12%).
  * Do not use LaTeX or special math markup.
- For member or dividend questions:
  * Focus on words like “dividend”, “member”, “share capital”, “distribution”.
- Always show final results rounded to the nearest whole number unless specified otherwise.
- Keep your tone professional and concise, like a financial officer’s report.
- ${
      targetLanguage
        ? `Respond strictly in ${targetLanguage}.`
        : "Detect the input language automatically and reply in the same language."
    }

📘 **SOYOSOYO SACCO DOCUMENT CONTEXT STARTS BELOW**
${context}
📘 **CONTEXT ENDS**
    `;

    // === CONSTRUCT PROMPT ===
    const messagesForOpenAI = [
      { role: "system", content: systemMessage },
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: userMessage },
    ];

    // === OPENAI COMPLETION ===
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesForOpenAI,
      max_tokens: 1200,
      temperature: 0.15,
    });

    const aiResponse =
      response.choices[0].message?.content ||
      "I couldn’t generate a proper response.";
    console.log(`✅ [CHAT] Response (${aiResponse.length} chars)`);

    await saveMessages(finalId, userMessage, aiResponse);
    return { response: aiResponse, conversationId: finalId };
  } catch (error) {
    console.error("❌ [CHAT] Error:", error);
    const err = error instanceof Error ? error.message : "Unknown error";

    if (err.includes("insufficient_quota") || err.includes("rate_limit")) {
      fallbackResponse =
        "The system is busy due to high demand. Please try again shortly.";
    } else if (err.includes("invalid_api_key")) {
      fallbackResponse =
        "Configuration issue — the OpenAI API key appears invalid.";
    } else {
      fallbackResponse =
        "I'm experiencing technical difficulties. Please try again.";
    }

    await saveMessages(finalId, userMessage, fallbackResponse);
    return { response: fallbackResponse, conversationId: finalId };
  }
}

/* -------------------------------------------------------------------------- */
/* 📄 File Analysis for Upload Summaries                                      */
/* -------------------------------------------------------------------------- */
export async function analyzeFileContent(content, fileName, mimeType) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analyze the following file for SACCO operations and summarize its key details in plain language.`,
        },
        {
          role: "user",
          content: `File: ${fileName}\nType: ${mimeType}\n\nContent Preview:\n${content.substring(
            0,
            2000
          )}...`,
        },
      ],
      max_tokens: 250,
      temperature: 0.2,
    });

    return (
      response.choices[0].message?.content || "Analysis completed successfully."
    );
  } catch (error) {
    console.error("❌ [ANALYZE] Error:", error);
    return "Could not analyze file content.";
  }
}

/* -------------------------------------------------------------------------- */
/* 🧾 Retrieve All Texts (Debug)                                              */
/* -------------------------------------------------------------------------- */
export async function getAllExtractedTexts() {
  try {
    const files = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(15);

    return files
      .map(
        (f) =>
          `📄 ${f.filename}\n${(f.text || "").substring(0, 1000)}`
      )
      .join("\n\n---\n\n");
  } catch (error) {
    console.error("❌ [DEBUG] Error fetching extracted texts:", error);
    return "Unable to retrieve texts from database.";
  }
}
