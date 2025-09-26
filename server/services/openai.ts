// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db";
import { uploadedFiles } from "../../shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Analyze question complexity for response sizing
// -----------------------------
function analyzeQuestionComplexity(question: string): { isSimple: boolean; maxTokens: number } {
  const lowerQ = question.toLowerCase();
  
  // Simple question patterns (short answers needed)
  const simplePatterns = [
    /^(who is|what is|when|where|how much|what time|is there|do you|can i|what's)/,
    /(chairperson|president|secretary|treasurer|manager)/,
    /(phone|email|address|location|hours|rate|fee)/,
    /(yes|no|true|false)/,
    /^.{1,50}$/ // Very short questions
  ];
  
  // Complex question patterns (detailed answers needed)  
  const complexPatterns = [
    /(how to|process|procedure|steps|requirements|application|compare|difference|explain|describe)/,
    /(loan|credit|savings|investment|account|policy|bylaw)/,
    /(eligibility|qualification|benefits|terms|conditions)/,
    /\b(and|or)\b.*\b(and|or)\b/ // Multiple questions
  ];
  
  const isSimpleQuestion = simplePatterns.some(pattern => pattern.test(lowerQ));
  const isComplexQuestion = complexPatterns.some(pattern => pattern.test(lowerQ));
  
  if (isSimpleQuestion && !isComplexQuestion) {
    return { isSimple: true, maxTokens: 150 }; // Brief response
  } else if (isComplexQuestion) {
    return { isSimple: false, maxTokens: 800 }; // Detailed response
  } else {
    return { isSimple: false, maxTokens: 400 }; // Medium response
  }
}

// -----------------------------
// Fetch extracted texts from DB with connection testing
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    console.log("🔍 Testing database connection...");
    
    const { testDatabaseConnection } = await import("../db");
    const isConnected = await testDatabaseConnection();
    
    if (!isConnected) {
      console.log("❌ Database connection failed");
      return "Database connection is currently unavailable.";
    }
    
    console.log("🔍 Querying database for extracted texts...");
    
    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
        id: uploadedFiles.id
      })
      .from(uploadedFiles);
    
    console.log(`📊 Found ${rows.length} total files, ${rows.filter(r => r.text?.trim()).length} with text`);
    
    const validRows = rows.filter(r => r.text && r.text.trim().length > 0);

    if (validRows.length === 0) {
      return "No documents with extracted text found.";
    }

    const allTexts = validRows
      .map((r, i) => `=== ${r.filename || `Document ${i + 1}`} ===\n${r.text}`)
      .join("\n\n");

    console.log(`📝 Total extracted text: ${allTexts.length} chars`);
    return allTexts;
  } catch (err) {
    console.error("❌ Database query failed:", err);
    return "Unable to retrieve SOYOSOYO SACCO documents.";
  }
}

// -----------------------------
// Generate chat response with smart token management
// -----------------------------
export async function generateChatResponse(userMessage: string): Promise<string> {
  try {
    console.log(`🤖 Processing: "${userMessage}"`);
    
    const extractedTexts = await getAllExtractedTexts();
    const { isSimple, maxTokens } = analyzeQuestionComplexity(userMessage);
    
    console.log(`📊 Question type: ${isSimple ? 'Simple' : 'Complex'}, Max tokens: ${maxTokens}`);

    if (extractedTexts.includes("Database connection") || extractedTexts.includes("Unable to retrieve") || extractedTexts.includes("No documents")) {
      return "I'm currently unable to access the SOYOSOYO SACCO documents. Please try again in a moment.";
    }

    // Smart system prompt based on question complexity
    const systemContent = isSimple 
      ? `You are the SOYOSOYO SACCO Assistant. Provide brief, direct answers using the documents.

RESPONSE RULES:
- Keep answers concise (1-3 sentences for simple questions)
- Include specific names, amounts, or details when asked
- Use **bold** for key information only
- No unnecessary formatting or explanations`
      
      : `You are the SOYOSOYO SACCO Assistant. Provide comprehensive information using the documents.

RESPONSE RULES:
- Detailed responses for complex questions
- Include relevant details like names, amounts, procedures
- Use **bold** for important information
- Use bullet points for lists when helpful
- Be thorough but avoid redundancy`;

    const userContent = isSimple
      ? `Answer briefly using SOYOSOYO SACCO documents:

QUESTION: ${userMessage}
DOCUMENTS: ${extractedTexts}`
      
      : `Answer comprehensively using SOYOSOYO SACCO documents:

QUESTION: ${userMessage}
DOCUMENTS: ${extractedTexts}`;

    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent }
    ];

    console.log(`🚀 Sending to OpenAI (${maxTokens} tokens max)`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: maxTokens,
      temperature: 0.1,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log(`✅ Response: ${aiResponse.length} chars`);

    return aiResponse;
  } catch (error) {
    console.error("❌ OpenAI error:", error);
    return "I'm currently experiencing technical difficulties. Please try again.";
  }
}

// -----------------------------
// File analysis function (optimized)
// -----------------------------
export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Provide a concise summary (50-80 words) highlighting key SACCO information."
        },
        {
          role: "user",
          content: `Summarize key information from: ${fileName}\n\nContent: ${content.substring(0, 2000)}...\n\nFocus on: leadership, policies, procedures, rates, requirements.`
        }
      ],
      max_tokens: 150,
      temperature: 0.1,
    });

    return response.choices[0].message.content || "Could not analyze file.";
  } catch (error) {
    console.error("File analysis error:", error);
    return `Failed to analyze ${fileName}.`;
  }
}

// -----------------------------
// Image generation function (unchanged)
// -----------------------------
export async function generateImage(prompt: string, userId?: string): Promise<string> {
  try {
    console.log("Generating image with prompt:", prompt);
    
    const saccoPrompt = `Professional SACCO themed image: ${prompt}. Style: clean, professional, financial services. Colors: teal (#1e7b85), light green (#7dd3c0), white.`;
    
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
      throw new Error("No image URL returned");
    }

    return imageUrl;
  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
