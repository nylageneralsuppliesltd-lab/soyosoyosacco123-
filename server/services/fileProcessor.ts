import { analyzeFileContent } from "./openai";
import { fromBuffer } from "pdf2pic";
import Tesseract from "tesseract.js";

export async function processUploadedFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  console.log(`DEBUG: Processing file ${fileName} (${mimeType})`);
  try {
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      return await processTextFile(fileBuffer, fileName, mimeType);
    } else if (mimeType === "application/pdf") {
      return await processPdfFile(fileBuffer, fileName, mimeType);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  } catch (error) {
    console.error(`File processing error for ${fileName}:`, error);
    return {
      extractedText: "Could not extract text from file",
      analysis: `Error processing file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function processPdfFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    console.log(`DEBUG: Processing PDF: ${fileName} using pdfjs-dist...`);
    const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = pdfjsModule.default || pdfjsModule;
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fileBuffer),
      verbosity: 0,
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
      console.log(`DEBUG: No text found in ${fileName}, attempting OCR...`);
      const output = await fromBuffer(fileBuffer, { format: "png", density: 100 }).bulk(-1);
      let ocrText = "";
      for (const page of output) {
        const imageBuffer = page.buffer;
        const { data: { text } } = await Tesseract.recognize(imageBuffer, "eng");
        ocrText += `\n\n=== Page ${page.page} ===\n\n${text}`;
      }
      extractedText = ocrText.trim();
      if (!extractedText || extractedText.length < 50) {
        throw new Error("No readable text content found in PDF, even with OCR");
      }
    }
    console.log(`DEBUG: Extracted ${extractedText.length} characters from ${fileName}`);
    const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    return { extractedText, analysis };
  } catch (error) {
    console.error(`PDF processing failed for ${fileName}:`, error);
    return {
      extractedText: `Could not extract readable text from PDF: ${fileName}.`,
      analysis: `Error processing PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function processTextFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  try {
    const content = fileBuffer.toString("utf-8");
    console.log(`DEBUG: Extracted ${content.length} characters from ${fileName}`);
    const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
    const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
    return { extractedText: content, analysis };
  } catch (error) {
    throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function cleanupFile(_filePath: string): Promise<void> {
  console.log(`DEBUG: No file cleanup needed (stored in PostgreSQL)`);
}

export async function readAssetsFiles(fileNames: string[]): Promise<string> {
  console.log(`DEBUG: Reading asset files from database`);
  let extractedText = "";
  for (const file of fileNames) {
    console.log(`DEBUG: Accessing file metadata for ${file}`);
    try {
      const [dbFile] = await db
        .select({ extractedText: uploadedFiles.extractedText })
        .from(uploadedFiles)
        .where(eq(uploadedFiles.filename, file))
        .limit(1);
      if (dbFile?.extractedText) {
        extractedText += `File: ${file}\n${dbFile.extractedText}\n\n`;
        console.log(`DEBUG: Read ${file}: ${dbFile.extractedText.length} chars`);
      } else {
        console.error(`No extracted text found for ${file}`);
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }
  return extractedText;
}
