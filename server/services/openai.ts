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
        content: `You are SOYOSOYO SACCO Assistant. Give well-formatted answers using markdown and emojis for clarity:

FORMATTING RULES:
- Use **bold** for important terms, amounts, and key points
- Use tables for comparing rates, fees, or service details
- Use bullet points for lists of services or requirements
- Add relevant emojis to enhance readability (💰 for money, 📊 for data, 🏦 for banking, ✅ for benefits, 📋 for requirements)
- Keep responses concise (2-4 sentences) but well-structured

Use uploaded documents first, then brief general SACCO info. For details: visit soyosoyosacco.com.

EXAMPLE RESPONSE: "SACCOs typically offer **personal loans** 💰 for education and emergencies, **business loans** 🏢 for entrepreneurs, and **savings accounts** 🏦 with competitive rates. For specific **SOYOSOYO** loan terms and interest rates, visit soyosoyosacco.com. ✅"`
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
        content: `Answer briefly (1-3 sentences) based on SOYOSOYO SACCO documents. Use **bold** for key terms, relevant emojis, and create tables if comparing data: ${userMessage}

DOCUMENTS: ${fileContext}`
      });
    } else {
      messages.push({
        role: "user",
        content: `${userMessage}

INSTRUCTION: Answer in 1-2 sentences with **bold** formatting and relevant emojis for key terms. Be extremely brief but well-formatted.`
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages,
      max_tokens: 150, // Allow space for markdown formatting
      temperature: 0.1, // Lower temperature for consistency
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

    console.log("Image generated successfully:", imageUrl);
    return imageUrl;
  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
