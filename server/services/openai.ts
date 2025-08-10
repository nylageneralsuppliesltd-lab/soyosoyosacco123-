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
        content: `You are the SOYOSOYO SACCO Assistant, a helpful AI assistant for SOYOSOYO Savings and Credit Cooperative Organization (SACCO). 

Your primary knowledge comes from uploaded SOYOSOYO SACCO documents, but you can also provide general SACCO information when helpful. You should:

1. PRIORITIZE information from uploaded SOYOSOYO SACCO documents when available
2. Provide helpful general SACCO guidance when specific information isn't in documents
3. Be knowledgeable about SACCO services, loans, savings, membership requirements, and financial products
4. If you don't have specific SOYOSOYO information, suggest checking soyosoyosacco.com or contacting SOYOSOYO SACCO directly
5. Be friendly, professional, and helpful to SACCO members and potential members

You can assist with:
- Loan applications and requirements
- Savings products and accounts
- Membership information
- SACCO policies and bylaws
- Financial services and products
- General SACCO operations questions`
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

    if (fileContext && fileContext.trim().length > 0) {
      messages.push({
        role: "user",
        content: `Based on the following SOYOSOYO SACCO documents and your knowledge of SACCO operations, please answer this question: ${userMessage}

SOYOSOYO SACCO DOCUMENTS:
${fileContext}

Please use the document information as your primary source, but feel free to provide additional helpful context about SACCO services when relevant.`
      });
    } else {
      messages.push({
        role: "user",
        content: `${userMessage}

Note: I can help with general SACCO information, but for specific SOYOSOYO SACCO details, please visit soyosoyosacco.com or contact SOYOSOYO SACCO directly. If you have SOYOSOYO SACCO documents, please upload them for more specific assistance.`
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages,
      max_tokens: 1000,
      temperature: 0.3,
    });

    return response.choices[0].message.content || "I apologize, but I couldn't generate a response. Please try again.";
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
