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
      return await processPdfFile(filePath, fileName, mimeType);
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

async function processPdfFile(
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    console.log(`Processing PDF: ${fileName} using pdfjs-dist...`);
    
    const dataBuffer = await fs.readFile(filePath);
    
    // Dynamically import pdfjs-dist with proper path
    const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = pdfjsModule.default || pdfjsModule;
    
    // Use pdfjs-dist to extract text
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(dataBuffer),
      verbosity: 0 // Reduce logging
    });
    
    const pdfDocument = await loadingTask.promise;
    let extractedText = "";
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items with spaces and newlines
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (pageText) {
        extractedText += `\n\n=== Page ${pageNum} ===\n\n${pageText}`;
      }
    }
    
    // Clean up the extracted text
    extractedText = extractedText.trim();
    
    if (!extractedText || extractedText.length < 50) {
      throw new Error("No readable text content found in PDF");
    }
    
    console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
    
    // Limit content for analysis but keep full text for storage
    const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    
    return {
      extractedText,
      analysis
    };
  } catch (error) {
    console.error(`PDF processing failed for ${fileName}:`, error);
    return {
      extractedText: `Could not extract readable text from PDF: ${fileName}. The file may contain images, complex formatting, or be password protected.`,
      analysis: `Error processing PDF file: ${error instanceof Error ? error.message : "Unknown error"}`
    };
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
