import OpenAI from "openai";
import { type Message } from "@shared/schema";
import { db } from "../db"; // Adjust path if needed
import { uploadedFiles, eq } from "../../shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// Static website info (fallback from soyosoyosacco.com—update with latest from site)
const staticWebsiteInfo = `SOYOSOYO SACCO (Soyosoyo Medicare Co-operative Savings & Credit Society Ltd) is based in Kilifi County, Kenya, focused on financial inclusion.

Key Details:
- Mission: Provide affordable financing for essential objectives like medical bills, education, and more.
- Joining: Start with Sh.200 deposit via MPESA Paybill 546448, AC 10027879. Provide name, phone, email for account activation and SMS invite to the app.
- Loan Terms: Returns on investments and loan eligibility proportional to savings. Normal loan up to 3x savings at 12% interest; emergency loan up to KES 50,000.
- Member Engagement: Monthly online meetings via Google Meet; Annual General Meeting after audit. Value days of worship (Sabbath/Sundays for Christians, Fridays for Muslims).
- Working Hours: Monday–Friday 8:30 AM–4:00 PM; Closed weekends & public holidays.
- Social Media: Follow @SoyosoyoSACCO on X (Twitter) for updates on savings, loans, and events.
- Contact: info@soyosoyosacco.com. Operate in Kilifi County, providing low-interest loans and financial education.`;

export async function generateChatResponse(
  userMessage: string, 
  conversationHistory: Message[] = [],
  fileContext: string = ""
): Promise<string> {
  try {
    // Query DB for relevant extracted text (top 3 files)
    let dbContext = "";
    try {
      const relevantFiles = await db.select({
        originalName: uploadedFiles.originalName,
        extractedText: uploadedFiles.extractedText,
      }).from(uploadedFiles)
        .where(eq(uploadedFiles.processed, true))
        .orderBy(uploadedFiles.uploadedAt)
        .limit(3);

      if (relevantFiles.length > 0) {
        dbContext = relevantFiles.map(f => `Document: ${f.originalName}\n${f.extractedText?.slice(0, 1000) || "No text"}...`).join('\n\n');
        console.log(`DEBUG: Retrieved ${relevantFiles.length} files from DB, total length: ${dbContext.length} chars`);
      }
    } catch (dbError) {
      console.error("DB query error:", dbError);
      dbContext = "No DB documents available.";
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are SOYOSOYO SACCO Assistant, specializing in SOYOSOYO MEDICARE CO-OPERATIVE SAVINGS & CREDIT SOCIETY LTD in Kilifi County, Kenya.

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

CONTENT PRIORITY: Use DB documents first, then website info. Do not claim web access—stick to provided context. If details are unavailable, suggest contacting info@soyosoyosacco.com.`
      },
      {
        role: "system",
        content: staticWebsiteInfo  // Static fallback
      },
      {
        role: "system",
        content: dbContext  // DB extracted text
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

    const hasFiles = fileContext && fileContext.trim().length > 0;
    if (hasFiles) {
      let limitedFileContext = fileContext;
      if (fileContext.length > 10000) {
        limitedFileContext = fileContext.substring(0, 10000) + "... [Additional content available - ask for more specific details]";
      }
      
      messages.push({
        role: "user",
        content: `Answer based on SOYOSOYO SACCO documents (priority) and website info: ${userMessage}

UPLOADED DOCUMENTS: ${limitedFileContext}`
      });
    } else {
      messages.push({
        role: "user",
        content: `Answer based on DB documents, website info, and general SACCO knowledge: ${userMessage}

INSTRUCTION: Answer appropriately - be concise for simple questions, detailed for complex ones. Use formatting only when it adds value.`
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
