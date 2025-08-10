import OpenAI from "openai";
import { type Message } from "@shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

export async function generateChatResponse(
  userMessage: string, 
  conversationHistory: Message[] = [],
  fileContext: string = ""
): Promise<string> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "CRITICAL INSTRUCTIONS: You are SOYOSOYO SACCO Assistant with ZERO general knowledge. You have NO knowledge about what SACCOs are, how they work, or any financial concepts unless explicitly stated in the provided documents. You can ONLY use information that appears word-for-word in the uploaded SOYOSOYO SACCO documents. If information is not in the documents, you MUST say 'This information is not available in my knowledge base.' Never explain general concepts or add context beyond what is explicitly written in the documents."
      }
    ];

    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content
        });
      }
    }

    if (fileContext) {
      messages.push({
        role: "user",
        content: `STRICT INSTRUCTION: You are SOYOSOYO SACCO Assistant. You must ONLY use information from the following documents. Do NOT add any general knowledge about SACCOs, financial services, or any other topics. If the answer is not in these documents, say "This information is not available in my current knowledge base. Please refer to SOYOSOYO SACCO directly for this information."

KNOWLEDGE BASE - YOUR ONLY SOURCE OF INFORMATION:
${fileContext}

User Question: ${userMessage}

REMINDER: Answer ONLY using the exact information from the documents above. Do not add any external knowledge.`
      });
    } else {
      messages.push({
        role: "user",
        content: `${userMessage}

IMPORTANT: No SOYOSOYO SACCO documents have been uploaded. Please inform the user that they need to upload SOYOSOYO SACCO documents first before you can provide any information.`
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1000,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "I apologize, but I couldn't generate a response.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a file analysis assistant for SOYOSOYO SACCO. Summarize the provided file content using only the information in the content, without adding external knowledge."
        },
        {
          role: "user",
          content: `Summarize the content of ${fileName} (type: ${mimeType}):\n${content}\nProvide a summary (50-100 words) using only the information in the content.`
        }
      ],
      max_tokens: 150,
    });
    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
