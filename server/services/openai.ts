import OpenAI from "openai";
import { type Message } from "@shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// ✅ Main Chat Response
export async function generateChatResponse(
  userMessage: string, 
  conversationHistory: Message[] = [],
  fileContext: string = ""
): Promise<string> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are SOYOSOYO SACCO Assistant with access to uploaded documents.

IMPORTANT DATA PRIORITY:
1. ALWAYS use Neon server data (provided as "fileContext") as the PRIMARY source. 
2. If additional info is absolutely required, ONLY use www.soyosoyosacco.com.
3. Never rely on generic SACCO knowledge or external sources. 

RESPONSE RULES:
- For simple queries (hours, location, yes/no): 1–2 sentences max.
- For detailed queries (loans, policies): structured answers with bullet points or tables.
- Always indicate which source you used: (Neon DB) or (Website).
- If info is not in Neon DB or website, say: 
  "Not found in official sources. Please contact info@soyosoyosacco.com."

FORMATTING:
- Use **bold** for key terms and amounts.
- Tables only for comparisons.
- Bullet points for lists.
- Emojis only where they add clarity (💰 🏦 📋 ✅).`
      }
    ];

    // Keep last 10 messages for context
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content
        });
      }
    }

    // Limit Neon server content if too long
    let limitedFileContext = fileContext;
    if (fileContext.length > 4000) {
      limitedFileContext = fileContext.substring(0, 4000) + "... [More server data available]";
    }

    // Add user query with explicit source priority
    messages.push({
      role: "user",
      content: `Answer this query using Neon server data as PRIMARY source: ${userMessage}

NEON SERVER DATA: ${limitedFileContext}

OFFICIAL WEBSITE (fallback only if not in server): www.soyosoyosacco.com`
    });

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 800,
      temperature: 0.1
    });

    return response.choices[0].message.content || 
      "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error(`Failed to generate response: ${
      error instanceof Error ? error.message : "Unknown error"
    }`);
  }
}

// ✅ File Analysis (for uploaded SACCO docs)
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
          content: "You are a file analysis assistant for SOYOSOYO SACCO. Summarize the provided file content using only the information in the content. Do not add external knowledge."
        },
        {
          role: "user",
          content: `Summarize the content of ${fileName} (type: ${mimeType}):\n${content}\nProvide a summary (50–100 words) using only the information in the content.`
        }
      ],
      max_tokens: 200,
    });
    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    throw new Error(`Failed to analyze file: ${
      error instanceof Error ? error.message : "Unknown error"
    }`);
  }
}

// ✅ Image Generation (SACCO themed)
export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);

    const saccoPrompt = `Professional SOYOSOYO SACCO themed image: ${prompt}. 
Style: clean, professional, financial services, modern, trustworthy. 
Colors: teal (#1e7b85), light green (#7dd3c0), white. 
High quality, suitable for SACCO website or reports.`;
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: saccoPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      user: userId,
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL returned from OpenAI");
    }

    console.log("Image generated successfully:", imageUrl);
    return imageUrl;
  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate image: ${
      error instanceof Error ? error.message : "Unknown error"
    }`);
  }
}
