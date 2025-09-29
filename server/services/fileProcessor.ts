import { analyzeFileContent } from "./openai.js";
import xlsx from "xlsx";

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

// ✅ NEW: Process Excel files (XLSX, XLS, CSV)
function processExcelFile(fileBuffer: Buffer, fileName: string): string {
  try {
    console.log(`📊 [EXCEL] Processing Excel file: ${fileName}`);
    
    // Read the Excel file
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    let extractedText = `=== Excel File: ${fileName} ===\n\n`;
    
    // Process each sheet
    workbook.SheetNames.forEach((sheetName, index) => {
      console.log(`📄 [EXCEL] Processing sheet ${index + 1}: ${sheetName}`);
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to CSV format (preserves structure)
      const csvData = xlsx.utils.sheet_to_csv(worksheet, { FS: '|' }); // Use | as delimiter
      
      // Also get JSON format for better data extraction
      const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      
      extractedText += `\n=== Sheet: ${sheetName} ===\n`;
      extractedText += `Rows: ${jsonData.length}\n\n`;
      
      // Add the data in a readable format
      if (csvData && csvData.length > 0) {
        extractedText += csvData + '\n\n';
      }
      
      console.log(`✅ [EXCEL] Extracted ${csvData.length} chars from sheet: ${sheetName}`);
    });
    
    console.log(`✅ [EXCEL] Total extracted: ${extractedText.length} characters from ${workbook.SheetNames.length} sheets`);
    return extractedText;
    
  } catch (error) {
    console.error(`❌ [EXCEL] Processing error:`, error);
    throw new Error(`Excel processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ✅ NEW: Process CSV files
function processCsvFile(fileBuffer: Buffer, fileName: string): string {
  try {
    console.log(`📊 [CSV] Processing CSV file: ${fileName}`);
    
    const csvText = fileBuffer.toString('utf-8');
    
    // Parse CSV to make it more readable
    const lines = csvText.split('\n').filter(line => line.trim());
    const extractedText = `=== CSV File: ${fileName} ===\n\nTotal Rows: ${lines.length}\n\n${csvText}`;
    
    console.log(`✅ [CSV] Extracted ${extractedText.length} characters`);
    return extractedText;
    
  } catch (error) {
    console.error(`❌ [CSV] Processing error:`, error);
    throw new Error(`CSV processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function processUploadedFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ extractedText: string; analysis: string }> {
  console.log(`📁 [PRODUCTION] Processing ${fileName} (${mimeType}), size: ${(fileBuffer.length / 1024).toFixed(1)}KB`);

  try {
    // ✅ HANDLE TEXT FILES
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const content = fileBuffer.toString("utf-8");
      console.log(`✅ [TEXT] Extracted ${content.length} chars from text file`);

      const limitedContent = content.length > 4000 ? content.substring(0, 4000) + "..." : content;
      const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
      return { extractedText: content, analysis };
    }
    
    // ✅ HANDLE CSV FILES (CRITICAL FOR FINANCIAL DATA)
    else if (
      fileName.toLowerCase().endsWith('.csv') || 
      mimeType === 'text/csv' || 
      mimeType === 'application/csv'
    ) {
      const extractedText = processCsvFile(fileBuffer, fileName);
      const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
      const analysis = await analyzeFileContent(limitedContent, fileName, 'text/csv');
      return { extractedText, analysis };
    }
    
    // ✅ HANDLE EXCEL FILES (CRITICAL FOR FINANCIAL DATA)
    else if (
      fileName.toLowerCase().endsWith('.xlsx') || 
      fileName.toLowerCase().endsWith('.xls') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      const extractedText = processExcelFile(fileBuffer, fileName);
      const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
      const analysis = await analyzeFileContent(limitedContent, fileName, 'application/vnd.ms-excel');
      return { extractedText, analysis };
    }
    
    // ✅ HANDLE PDF FILES
    else if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith('.pdf')) {
      console.log("🔄 [PDF] Processing PDF file...");

      if (fileBuffer.length > 4 * 1024 * 1024) {
        console.warn(`⚠️ [PDF] Large PDF (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB), processing first 10 pages only`);
      }

      try {
        const pdfjs = await loadPdfJs();
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(fileBuffer),
          verbosity: 0,
          standardFontDataUrl: null
        });

        const pdfDocument = await loadingTask.promise;
        let extractedText = "";
        const maxPages = Math.min(pdfDocument.numPages, 10);

        console.log(`📄 [PDF] PDF has ${pdfDocument.numPages} pages, processing ${maxPages} pages`);

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
            console.warn(`⚠️ [PDF] Error processing page ${pageNum}:`, pageError);
          }
        }

        extractedText = extractedText.trim();
        console.log(`✅ [PDF] Extracted ${extractedText.length} chars from PDF (${maxPages} pages)`);

        if (!extractedText || extractedText.length < 10) {
          throw new Error("No readable text found in PDF - the PDF might be image-based or corrupted");
        }

        const limitedContent = extractedText.length > 4000 ? extractedText.substring(0, 4000) + "..." : extractedText;
        const analysis = await analyzeFileContent(limitedContent, fileName, mimeType);
        return { extractedText, analysis };

      } catch (pdfError) {
        console.error(`❌ [PDF] Processing error:`, pdfError);
        throw new Error(`Failed to process PDF: ${pdfError instanceof Error ? pdfError.message : "Unknown PDF error"}`);
      }
    }
    
    // ❌ UNSUPPORTED FILE TYPE
    else {
      const supportedTypes = 'PDF (.pdf), Excel (.xlsx, .xls), CSV (.csv), Text files (.txt), JSON (.json)';
      throw new Error(`Unsupported file type: ${mimeType}. Supported types: ${supportedTypes}`);
    }
    
  } catch (error) {
    console.error(`❌ [PRODUCTION] File processing error for ${fileName}:`, error);

    return {
      extractedText: `Error processing ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      analysis: `File processing failed: ${error instanceof Error ? error.message : "Unknown error"}. File size: ${(fileBuffer.length / 1024).toFixed(1)}KB, Type: ${mimeType}`,
    };
  }
}
