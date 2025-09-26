import { analyzeFileContent } from "./openai.js";

// Dynamic PDF.js import for Node.js compatibility
async function loadPdfJs() {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
    return pdfjs;
  } catch (error) {
    console.error("❌ Failed to load PDF.js:", error);
    throw new Error("PDF processing not available");
  }
}

export async function processUploadedFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  console.log(`📁 Processing ${fileName} (${mimeType}), size: ${(fileBuffer.length / 1024).toFixed(1)}KB`);
  
  try {
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const content = fileBuffer.toString("utf-8");
      console.log(`✅ Extracted ${content.length} chars from text file`);
      
      const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
      const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
      return { extractedText: content, analysis };
      
    } else if (mimeType === "application/pdf") {
      console.log("🔄 Processing PDF file...");
      
      if (fileBuffer.length > 4 * 1024 * 1024) {
        console.warn(`⚠️ Large PDF (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB), processing first 10 pages only`);
      }
      
      try {
        const pdfjs = await loadPdfJs();
        const loadingTask = pdfjs.getDocument({ 
          data: new Uint8Array(fileBuffer), 
          verbosity: 0,
          standardFontDataUrl: null // Disable font loading for Node.js
        });
        
        const pdfDocument = await loadingTask.promise;
        let extractedText = "";
        const maxPages = Math.min(pdfDocument.numPages, 10);
        
        console.log(`📄 PDF has ${pdfDocument.numPages} pages, processing ${maxPages} pages`);
        
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          try {
            const page = await pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            
            if (pageText && pageText.length > 5) {
              extractedText += `\n\n=== Page ${pageNum} ===\n${pageText}`;
            }
          } catch (pageError) {
            console.warn(`⚠️ Error processing page ${pageNum}:`, pageError);
            // Continue with other pages
          }
        }
        
        extractedText = extractedText.trim();
        console.log(`✅ Extracted ${extractedText.length} chars from PDF (${maxPages} pages)`);
        
        if (!extractedText || extractedText.length < 10) {
          throw new Error("No readable text found in PDF - the PDF might be image-based or corrupted");
        }
        
        const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
        const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
        return { extractedText, analysis };
        
      } catch (pdfError) {
        console.error(`❌ PDF processing error:`, pdfError);
        throw new Error(`Failed to process PDF: ${pdfError instanceof Error ? pdfError.message : "Unknown PDF error"}`);
      }
      
    } else {
      throw new Error(`Unsupported file type: ${mimeType}. Supported types: PDF, text files, JSON.`);
    }
  } catch (error) {
    console.error(`❌ File processing error for ${fileName}:`, error);
    
    // Return error but with some extracted content for debugging
    return {
      extractedText: `Error processing ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      analysis: `File processing failed: ${error instanceof Error ? error.message : "Unknown error"}. File size: ${(fileBuffer.length / 1024).toFixed(1)}KB, Type: ${mimeType}`,
    };
  }
}
