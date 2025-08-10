import fs from "fs/promises";
import path from "path";
import { analyzeFileContent } from "./openai"; // Remove analyzeImage since PDFs are handled by processPdfFile

export async function processUploadedFile(
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    await fs.access(filePath).catch(() => { throw new Error(`File not found: ${filePath}`); });
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return await processTextFile(filePath, fileName, mimeType);
    } else if (mimeType === "application/pdf") {
      return await processPdfFile(filePath, fileName, mimeType);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error) {
    console.error(`File processing error for ${fileName}:`, error);
    return {
      extractedText: "Could not extract text from file",
      analysis: `Error processing file: ${error instanceof Error ? error.message : "Unknown error"}`
    };
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
    const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = pdfjsModule.default || pdfjsModule;
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(dataBuffer),
      verbosity: 0
    });
    const pdfDocument = await loadingTask.promise;
    let extractedText = "";
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) extractedText += `\n\n=== Page ${pageNum} ===\n\n${pageText}`;
    }
    extractedText = extractedText.trim();
    if (!extractedText || extractedText.length < 50) {
      throw new Error("No readable text content found in PDF");
    }
    console.log(`Extracted ${extractedText.length} characters from ${fileName}`);
    const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    return { extractedText, analysis };
  } catch (error) {
    console.error(`PDF processing failed for ${fileName}:`, error);
    return {
      extractedText: `Could not extract readable text from PDF: ${fileName}.`,
      analysis: `Error processing PDF: ${error instanceof Error ? error.message : "Unknown error"}`
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
    const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    return { extractedText: content, analysis };
  } catch (error) {
    throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function cleanupFile(filePath: string): Promise<void> {
  console.log(`Kept file: ${filePath}`); // Skip deletion to persist files
}

export async function readAssetsFiles(fileNames: string[]): Promise<string> {
  const assetsDir = path.join(__dirname, "..", "attached_assets");
  let extractedText = "";
  for (const file of fileNames) {
    const filePath = path.join(assetsDir, file);
    try {
      await fs.access(filePath);
      const mimeType = "application/pdf"; // Both files are PDFs
      const { extractedText: text } = await processUploadedFile(filePath, file, mimeType);
      extractedText += `File: ${file}\n${text}\n\n`;
      console.log(`Read ${file}: ${text.length} chars`);
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }
  return extractedText;
}
