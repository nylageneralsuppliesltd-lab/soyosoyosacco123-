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
        content: "You are a helpful AI assistant. You can help users with questions, analyze uploaded files, and provide detailed responses. If file content is provided, use it to enhance your responses."
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

    // Add file context if available
    if (fileContext) {
      messages.push({
        role: "user",
        content: `Here is some file content for context: ${fileContext}\n\nNow, please respond to: ${userMessage}`
      });
    } else {
      messages.push({
        role: "user",
        content: userMessage
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
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

export async function analyzeImage(base64Image: string, fileName: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image (${fileName}) and describe its contents, key elements, and any notable features.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "Could not analyze image.";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
