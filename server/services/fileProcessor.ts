import pdfParse from "pdf-parse";
import { analyzeFileContent } from "./openai";

export async function processUploadedFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  console.log(`DEBUG: Processing ${fileName} (${mimeType}), size: ${fileBuffer.length / 1024 / 1024} MB`);
  try {
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const content = fileBuffer.toString("utf-8");
      console.log(`DEBUG: Extracted ${content.length} chars from ${fileName}`);
      const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
      const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
      return { extractedText: content, analysis };
    } else if (mimeType === "application/pdf") {
      if (fileBuffer.length > 4 * 1024 * 1024) {
        console.warn(`⚠️ Large PDF (${fileBuffer.length / 1024 / 1024} MB), partial extraction`);
      }
      const data = await pdfParse(fileBuffer, { max: 4 }); // Limit to 4 pages for memory
      const extractedText = data.text.trim();
      console.log(`DEBUG: Extracted ${extractedText.length} chars from ${fileName}`);
      if (!extractedText || extractedText.length < 50) {
        throw new Error("No readable text in PDF");
      }
      const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
      const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
      return { extractedText, analysis };
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error) {
    console.error(`❌ File processing error for ${fileName}: ${error}`);
    return {
      extractedText: `Could not extract text from ${fileName}.`,
      analysis: `Error processing file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
