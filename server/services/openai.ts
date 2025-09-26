// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db";
import { uploadedFiles } from "../../shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Fetch extracted texts from DB with connection testing
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 Testing database connection...");
    
    // Test connection first
    const { testDatabaseConnection } = await import("../db");
    const isConnected = await testDatabaseConnection();
    
    if (!isConnected) {
      console.log("❌ Database connection failed");
      return "Database connection is currently unavailable. Please try again in a moment.";
    }
    
    console.log("🔍 Querying database for extracted texts...");
    
    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id
      })
      .from(uploadedFiles);
    
    console.log(`📊 Found ${rows.length} total files in database`);
    
    const validRows = rows.filter(r => r.text && r.text.trim().length > 0);
    console.log(`✅ Found ${validRows.length} files with extracted text`);

    if (validRows.length === 0) {
      console.log("⚠️ No files with extracted text found");
      return "No documents with extracted text found in the database.";
    }

    const allTexts = validRows
      .map((r, i) => `=== ${r.filename || `Document ${i + 1}`} ===\n${r.text}`)
      .join("\n\n");

    console.log(`📝 Total extracted text length: ${allTexts.length} characters`);
    console.log(`🔍 Preview: ${allTexts.substring(0, 300)}...`);

    return allTexts;
  } catch (err) {
    console.error("❌ Database query failed:", err);
    console.error("❌ Error details:", {
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : "No stack"
    });
    return "Unable to retrieve SOYOSOYO SACCO documents due to database error.";
  }
}

// -----------------------------
// Generate chat response using DB content with detailed logging
// -----------------------------
export async function generateChatResponse(userMessage: string): Promise<string> {
  try {
    console.log(`🤖 Processing chat request: "${userMessage}"`);
    
    const extractedTexts = await getAllExtractedTexts();
    console.log(`📊 Extracted texts received, length: ${extractedTexts.length}`);

    if (extractedTexts.includes("Database connection") || extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No documents")) {
      console.log("❌ No valid document data available");
      return "I apologize, but I'm currently unable to access the SOYOSOYO SACCO documents due to a technical issue. Please try again in a moment, or contact support if the issue persists.";
    }

    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are the SOYOSOYO SACCO Assistant, a knowledgeable and helpful AI that provides accurate information about SOYOSOYO SACCO services, policies, and procedures.

RESPONSE GUIDELINES:
- Use the uploaded SOYOSOYO SACCO documents as your PRIMARY source
- Provide detailed, helpful responses with specific information (names, amounts, procedures)
- Include relevant details like chairperson names, policy numbers, specific rates, and procedures
- Be conversational but professional
- Always cite specific information from the documents when available
- When mentioning leadership or officials, include their full names and titles as found in the documents

FORMATTING RULES:
- Use **bold** for important names, amounts, and key terms
- Use bullet points for lists and requirements
- Include specific details like names, dates, and amounts when available
- Format information clearly for easy reading

You have access to official SOYOSOYO SACCO documents that contain detailed information including leadership details, policies, procedures, and member information. Always provide comprehensive answers based on the document content.`
      },
      {
        role: "user",
        content: `Based on the SOYOSOYO SACCO documents provided below, please answer this question with specific details:

QUESTION: ${userMessage}

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}

Please provide a detailed, helpful response using the information from these documents. Include specific names, amounts, and details when available. If asking about leadership or officials, provide their full names and titles as mentioned in the documents.`
      }
    ];

    console.log("🚀 Sending request to OpenAI...");
    console.log(`📊 Total prompt length: ${JSON.stringify(messagesToSend).length} characters`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 1200,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ OpenAI response received, length: ${aiResponse.length}`);
    console.log(`📝 Response preview: ${aiResponse.substring(0, 200)}...`);

    return aiResponse;
  } catch (error) {
    console.error("❌ OpenAI API error:", error);
    console.error("❌ Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack"
    });
    return "I apologize, but I'm currently experiencing technical difficulties. Please try your question again in a moment.";
  }
}

// -----------------------------
// File analysis function
// -----------------------------
export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a file analysis assistant for SOYOSOYO SACCO. Create a brief, informative summary highlighting key information that would be useful for SACCO member inquiries."
        },
        {
          role: "user",
          content: `Analyze this SOYOSOYO SACCO document and provide a summary highlighting key information:

File: ${fileName} (${mimeType})
Content: ${content}

Focus on: leadership names, policies, procedures, rates, requirements, and any member-relevant information. Provide a summary in 50-100 words.`
        }
      ],
      max_tokens: 300,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "Could not analyze file content.";
  } catch (error) {
    console.error("File analysis error:", error);
    return `Failed to analyze ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

// -----------------------------
// Image generation function
// -----------------------------
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
