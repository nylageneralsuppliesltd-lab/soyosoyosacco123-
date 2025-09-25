// server/services/openai.ts
import OpenAI from "openai";
import { type Message } from "@shared/schema";
import { db } from "../db";  // ✅ correct path to your db.ts
import { eq } from "drizzle-orm";
import { summaries } from "../schema"; // ✅ assumes you have a "summaries" table schema

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// ✅ fetch from cache
async function getCachedSummary(fileHash: string) {
  const result = await db
    .select()
    .from(summaries)
    .where(eq(summaries.hash, fileHash))
    .limit(1);

  return result.length > 0 ? result[0].summary : null;
}

// ✅ save to cache
async function saveSummary(fileHash: string, summary: string, fileName: string) {
  await db.insert(summaries).values({
    hash: fileHash,
    summary,
    fileName,
    createdAt: new Date(),
  });
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: Message[] = [],
  fileContext: string = "",
  fileHash: string = "",
): Promise<string> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are SOYOSOYO SACCO Assistant with access to uploaded documents.

IMPORTANT: ALWAYS use the UPLOADED DOCUMENTS as your PRIMARY SOURCE. 
Search ALL documents and quote/summarize from relevant ones for EVERY answer. 
If the answer is in multiple documents, reference each (e.g., "From By Laws: [quote]; From Loan Policy: [details]"). 
Never say 'not mentioned' if info is in ANY document—scan all. 
Do not use general knowledge if documents are available. 
Do not claim web access or invent details.

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

CONTENT PRIORITY: Uploaded documents first. Scan all for complete answers. 
If details are unavailable in documents, say "Not found in uploaded documents. Please upload more or contact info@soyosoyosacco.com."`
      }
    ];

    // keep only recent 10 exchanges
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    let limitedFileContext = fileContext;
    if (fileContext.length > 4000) {
      limitedFileContext =
        fileContext.substring(0, 4000) +
        "... [More documents available - ask for details]";
    }

    if (fileContext) {
      messages.push({
        role: "user",
        content: `Answer based on SOYOSOYO SACCO documents (priority). Search ALL documents and quote from relevant ones: ${userMessage}

UPLOADED DOCUMENTS (PRIMARY SOURCE - SCAN ALL): ${limitedFileContext}`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Answer based on SOYOSOYO SACCO website content (www.soyosoyosacco.com) and your knowledge: ${userMessage}`,
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 800,
      temperature: 0.1,
    });

    return (
      response.choices[0].message.content ||
      "I couldn’t generate a response. Please try again."
    );
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error(
      `Failed to generate response: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function analyzeFileContent(
  content: string,
  fileName: string,
  mimeType: string,
  fileHash: string,
): Promise<string> {
  try {
    // check cache first
    const cached = await getCachedSummary(fileHash);
    if (cached) {
      return cached;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a file analysis assistant for SOYOSOYO SACCO. Summarize the provided file content using only the information in the content, without adding external knowledge.",
        },
        {
          role: "user",
          content: `Summarize the content of ${fileName} (type: ${mimeType}):\n${content}\nProvide a summary (50-100 words) using only the information in the content.`,
        },
      ],
      max_tokens: 200,
    });

    const summary =
      response.choices[0].message.content ||
      "Could not analyze file content.";

    // save to cache
    await saveSummary(fileHash, summary, fileName);

    return summary;
  } catch (error) {
    console.error("File analysis error:", error);
    throw new Error(
      `Failed to analyze file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function generateImage(
  prompt: string,
  userId?: string,
): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);

    const saccoPrompt = `Professional SACCO (Savings and Credit Cooperative) themed image: ${prompt}. 
Style: clean, professional, financial services, modern, trustworthy. 
Colors: teal (#1e7b85), light green (#7dd3c0), white. 
High quality, suitable for banking/financial website.`;

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
    throw new Error(
      `Failed to generate image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
