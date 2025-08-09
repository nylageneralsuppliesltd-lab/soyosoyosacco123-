import fs from "fs/promises";
import path from "path";
import { analyzeFileContent, analyzeImage } from "./openai";

export async function processUploadedFile(
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    if (mimeType.startsWith("image/")) {
      return await processImage(filePath, fileName);
    } else if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return await processTextFile(filePath, fileName, mimeType);
    } else if (mimeType === "application/pdf") {
      // For PDFs, we'll read as text (simplified - in production you'd use a PDF parser)
      return await processTextFile(filePath, fileName, mimeType);
    } else {
      // For other file types, try to read as text
      return await processTextFile(filePath, fileName, mimeType);
    }
  } catch (error) {
    console.error("File processing error:", error);
    return {
      extractedText: "Could not extract text from file",
      analysis: `Error processing file: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function processImage(filePath: string, fileName: string): Promise<{ extractedText: string; analysis: string }> {
  try {
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = imageBuffer.toString("base64");
    
    const analysis = await analyzeImage(base64Image, fileName);
    
    return {
      extractedText: `Image file: ${fileName}`,
      analysis
    };
  } catch (error) {
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function processTextFile(
  filePath: string, 
  fileName: string, 
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    
    // Limit content size for analysis (first 4000 characters)
    const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
    
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    
    return {
      extractedText: content,
      analysis
    };
  } catch (error) {
    throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error("Error cleaning up file:", error);
  }
}
