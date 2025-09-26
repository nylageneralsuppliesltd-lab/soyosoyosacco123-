// server/services/openai.ts
import OpenAI from "openai";
import { db } from "../db.js";
import { uploadedFiles } from "../../shared/schema.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "",
});

// -----------------------------
// Fetch extracted texts from DB
// -----------------------------
export async function getAllExtractedTexts(): Promise<string> {
  try {
    const rows = await db
      .select({ 
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName 
      })
      .from(uploadedFiles)
      .where(uploadedFiles.extractedText.isNotNull());

    const allTexts = rows
      .map((r, i) => `=== ${r.filename || `Document ${i + 1}`} ===\n${r.text}`)
      .join("\n\n");

    console.log("Fetched extracted texts length:", allTexts.length);
    console.log("Fetched files count:", rows.length);
    console.log("Extracted texts preview:", allTexts.substring(0, 500));

    return allTexts.length > 0
      ? allTexts
      : "No extracted text available.";
  } catch (err) {
    console.error("Error fetching extracted texts:", err);
    return "No extracted text available due to DB error.";
  }
}

// -----------------------------
// Generate chat response using DB content
// -----------------------------
export async function generateChatResponse(userMessage: string): Promise<string> {
  try {
    const extractedTexts = await getAllExtractedTexts();

    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are the SOYOSOYO SACCO Assistant, a knowledgeable and helpful AI that provides accurate information about SOYOSOYO SACCO services, policies, and procedures.

RESPONSE GUIDELINES:
- Use the uploaded SOYOSOYO SACCO documents as your PRIMARY source
- Provide detailed, helpful responses with specific information (names, amounts, procedures)
- Format complex information clearly with bullet points and headers when appropriate
- Include relevant details like chairperson names, policy numbers, specific rates, and procedures
- Be conversational but professional
- If asked about something not in the documents, explain what information IS available

FORMATTING RULES:
- Use **bold** for important names, amounts, and key terms
- Use bullet points for lists and requirements
- Use headers (##) for organizing complex responses
- Include specific details like names, dates, and amounts when available

TONE: Professional yet friendly, like a knowledgeable SACCO staff member helping a member.`
      },
      {
        role: "user",
        content: `Based on the SOYOSOYO SACCO documents provided below, please answer this question with specific details:

QUESTION: ${userMessage}

SOYOSOYO SACCO DOCUMENTS:
${extractedTexts}

Please provide a detailed, helpful response using the information from these documents.`
      }
    ];

    console.log("Sending to OpenAI. User message:", userMessage);
    console.log("Extracted texts length sent:", extractedTexts.length);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesToSend,
      max_tokens: 1000,
      temperature: 0.1, // Slightly creative but consistent
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    console.log("OpenAI response length:", aiResponse.length);
    
    return aiResponse;
  } catch (error) {
    console.error("OpenAI API error:", error);
    return `I apologize, but I'm currently unable to process your request. Please try again in a moment.`;
  }
}

// -----------------------------
// Keep for fileProcessor.ts
// -----------------------------
export async function analyzeFileContent(content: string, fileName: string, mimeType: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a file analysis assistant for SOYOSOYO SACCO. Create a brief, informative summary of the document content, highlighting key information that would be useful for SACCO member inquiries."
        },
        {
          role: "user",
          content: `Analyze this SOYOSOYO SACCO document and provide a summary highlighting key information:

File: ${fileName} (${mimeType})
Content: ${content}

Focus on: leadership names, policies, procedures, rates, requirements, and any member-relevant information.`
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
