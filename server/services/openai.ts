import OpenAI from "openai";
import { type Message } from "@shared/schema";
// Removed direct import to prevent deployment issues - using dynamic import instead

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
        content: `You are SOYOSOYO SACCO Assistant with access to uploaded documents.

IMPORTANT: SEARCH ALL UPLOADED DOCUMENTS below and quote/summarize from relevant ones for EVERY answer. If the answer is in multiple documents, reference each (e.g., "From By Laws: [quote]; From Loan Policy: [details]"). Never say 'not mentioned' if info is in any document—scan all. Use general knowledge only if no documents match. Do not claim web access.

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

CONTENT PRIORITY: Uploaded documents first. Scan all for complete answers. If details are unavailable in documents, suggest contacting info@soyosoyosacco.com.`
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

    // Get website content with appropriate length limits based on file context (with error handling)
    const hasFiles = fileContext && fileContext.trim().length > 0;
    const websiteContentLimit = hasFiles ? 3000 : 5000; // Smaller limit when files are present
    // Web scraping temporarily removed to fix deployment issues
    let websiteContent = "Using uploaded documents and general SACCO knowledge.";
    
    if (hasFiles) {
      // Limit file context if too long to avoid token limits
      let limitedFileContext = fileContext;
      if (fileContext.length > 10000) {
        limitedFileContext = fileContext.substring(0, 10000) + "... [Additional content available - ask for more specific details]";
      }
      
      messages.push({
        role: "user",
        content: `Answer based on SOYOSOYO SACCO documents (priority) and website content. Use formatting only when needed for complex information: ${userMessage}

UPLOADED DOCUMENTS (SEARCH ALL): ${limitedFileContext}

WEBSITE CONTENT: ${websiteContent}`
      });
    } else {
      messages.push({
        role: "user",
        content: `Answer based on SOYOSOYO SACCO website content and your knowledge: ${userMessage}

WEBSITE CONTENT: ${websiteContent}

INSTRUCTION: Answer appropriately - be concise for simple questions, detailed for complex ones. Use formatting only when it adds value.`
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages,
      max_tokens: 800, // Increased significantly for complete responses without truncation
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
      max_tokens: 200,
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
