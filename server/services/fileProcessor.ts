import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
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
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileBuffer), verbosity: 0 });
      const pdfDocument = await loadingTask.promise;
      let extractedText = "";
      const maxPages = Math.min(pdfDocument.numPages, 10); // Limit to 10 pages for memory
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (pageText) extractedText += `\n\n=== Page ${pageNum} ===\n${pageText}`;
      }
      extractedText = extractedText.trim();
      console.log(`DEBUG: Extracted ${extractedText.length} chars from ${fileName} (${maxPages} pages)`);
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
