// server/services/openai.ts
import OpenAI from "openai";
import { type Message, uploadedFiles } from "@shared/schema"; 
import { db } from "../db"; 

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// helper to fetch extracted texts for a conversation (only uploaded files)
async function getUploadedFileReferences(conversationId: string): Promise<string> {
  try {
    const fileResults = await db
      .select({ text: uploadedFiles.extractedText })
      .from(uploadedFiles)
      .where(uploadedFiles.conversationId.eq(conversationId))
      .orderBy(uploadedFiles.uploadedAt, "desc");

    const refs = fileResults
      .map(r => r.text)
      .filter(Boolean)
      .join("\n\n");

    // Limit size to avoid token overflow
    return refs.length > 5000 ? refs.substring(0, 5000) + "\n\n...[truncated]" : refs;
  } catch (err) {
    console.error("Error fetching uploaded file references:", err);
    return "No reference material available for this conversation.";
  }
}

export async function generateChatResponse(
  userMessage: string, 
  conversationHistory: Message[] = [],
  conversationId?: string
): Promise<string> {
  try {
    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // System prompt forces AI to use ONLY uploaded file content
    messagesToSend.push({
      role: "system",
      content: `You are a SOYOSOYO SACCO assistant. Use ONLY the reference materials from uploaded files for this conversation to answer the user's question. 
Do NOT use prior assistant messages, general knowledge, or the internet. 
If the answer is not in the reference material, respond: "The information is not available."`
    });

    // Include recent user messages for context (optional)
    const recentUserMessages = conversationHistory
      .filter(msg => msg.role === "user")
      .slice(-5);

    for (const msg of recentUserMessages) {
      messagesToSend.push({
        role: "user",
        content: msg.content
      });
    }

    // Fetch uploaded file references
    let referenceMaterial = "";
    if (conversationId) {
      referenceMaterial = await getUploadedFileReferences(conversationId);
    }

    // Add current user question with reference material
    messagesToSend.push({
      role: "user",
      content: `Reference Material:\n${referenceMaterial}\n\nUser Question:\n${userMessage}`
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 800,
      temperature: 0, // deterministic answers
    });

    return response.choices[0].message.content || "I couldn't generate a response.";
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
