// server/services/openai.ts
import OpenAI from "openai";
import { type Message, uploadedFiles } from "@shared/schema"; // use correct export name
import { db } from "../db"; 

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// helper to fetch extracted texts from DB
async function getExtractedTexts(limit = 50): Promise<string> {
  try {
    const results = await db
      .select({ text: uploadedFiles.extractedText }) // use correct column name
      .from(uploadedFiles)
      .limit(limit);

    if (!results || results.length === 0) {
      return "No extracted texts available.";
    }

    let content = results.map(r => r.text).join("\n\n");
    if (content.length > 5000) {
      content = content.substring(0, 5000) + "... [truncated additional extracted text]";
    }
    return content;
  } catch (err) {
    console.error("Error fetching extracted texts:", err);
    return "Error retrieving extracted texts.";
  }
}

export async function generateChatResponse(
  userMessage: string, 
  conversationHistory: Message[] = [],
  fileContext: string = ""
): Promise<string> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are SOYOSOYO SACCO Assistant with access to current website content and uploaded documents.

IMPORTANT: You have access to current SOYOSOYO SACCO website information that is automatically updated. Never claim you cannot access web content - you have the latest website data available.

RESPONSE LENGTH RULES:
- For simple questions (hours, locations, yes/no): Give concise, direct answers (1-2 sentences)
- For complex questions (loan comparisons, processes): Provide detailed information with formatting
- Only use tables when comparing multiple options or rates
- Avoid unnecessary summaries or repetition

FORMATTING (when details are needed):
- Use **bold** for key terms and amounts
- Use tables only for comparisons with proper markdown syntax
- Use bullet points for lists of requirements
- Add relevant emojis sparingly (💰 🏦 📋 ✅)

CONTENT PRIORITY: Use uploaded documents first, then current website content. You have access to up-to-date SOYOSOYO SACCO information and should provide current details confidently.`
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

    // fetch website content (extracted texts from DB)
    const websiteContent = await getExtractedTexts();

    const hasFiles = fileContext && fileContext.trim().length > 0;

    if (hasFiles) {
      // Limit file context if too long
      let limitedFileContext = fileContext;
      if (fileContext.length > 10000) {
        limitedFileContext = fileContext.substring(0, 10000) + "... [Additional content available - ask for more specific details]";
      }
      
      messages.push({
        role: "system",
        content: `REFERENCE MATERIALS:\n\nUPLOADED DOCUMENTS:\n${limitedFileContext}\n\nWEBSITE CONTENT:\n${websiteContent}`
      });

      messages.push({
        role: "user",
        content: userMessage
      });
    } else {
      messages.push({
        role: "system",
        content: `REFERENCE MATERIALS:\n\nWEBSITE CONTENT:\n${websiteContent}`
      });

      messages.push({
        role: "user",
        content: userMessage
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 800,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// unchanged analyzeFileContent
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
      max_tokens: 200,
    });
    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// unchanged generateImage
export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);
    
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
