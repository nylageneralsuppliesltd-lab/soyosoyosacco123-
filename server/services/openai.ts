import OpenAI from "openai";
import { type Message } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

    // Add conversation history (last 10 messages for context)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content
        });
      }
    }

    // Add file context if available - this is your ONLY knowledge source
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
      temperature: 0.1, // Lower temperature for more consistent, document-focused responses
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
          content: "You are a file analysis assistant. Analyze the provided file content and extract key information, summarize the content, and provide insights."
        },
        {
          role: "user",
          content: `Please analyze this file content:
File name: ${fileName}
File type: ${mimeType}
Content: ${content}

Provide a summary and key insights from this file.`
        }
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function analyzeImage(base64Image: string, promptOrFileName: string): Promise<string> {
  try {
    // If it's a specific OCR extraction request, use that prompt directly
    const isOCRRequest = promptOrFileName.includes("Extract all text content");
    const prompt = isOCRRequest 
      ? promptOrFileName 
      : `Analyze this image (${promptOrFileName}) and describe its contents, key elements, and any notable features.`;
      
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: isOCRRequest ? 2000 : 500,
    });

    return response.choices[0].message.content || "Could not analyze image.";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
