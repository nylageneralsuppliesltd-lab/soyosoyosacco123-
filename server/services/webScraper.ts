import { generateChatResponse } from "./openai";

interface ScrapedContent {
  url: string;
  content: string;
  processedText: string;
  lastUpdated: string;
  contentHash: string;
}

// Simple hash function to detect content changes
function createContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// Clean and process the scraped content
function processScrapedContent(rawContent: string): string {
  return rawContent
    // Remove excess whitespace and normalize line breaks
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    // Remove navigation elements and common website elements
    .replace(/Skip to main content|Skip to navigation|Report abuse|Google Sites/gi, '')
    // Clean up image placeholders
    .replace(/!\[.*?\]\(.*?\)/g, '[Image]')
    // Remove URLs but keep link text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// Store scraped content (in-memory for now, could be moved to database)
let storedContent: ScrapedContent | null = null;

export async function scrapeWebsiteContent(url: string = "https://www.soyosoyosacco.com/"): Promise<{ 
  success: boolean, 
  message: string, 
  contentUpdated: boolean,
  content?: string 
}> {
  try {
    console.log(`🔍 Scraping content from: ${url}`);
    
    // Fetch content with appropriate headers (no timeout in Node.js fetch)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SOYOSOYO-SACCO-Assistant/1.0 (Content-Update-Bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rawContent = await response.text();
    
    // Process the content to extract meaningful text
    const processedText = processScrapedContent(rawContent);
    const contentHash = createContentHash(processedText);
    
    // Check if content has changed
    const contentUpdated = !storedContent || storedContent.contentHash !== contentHash;
    
    if (contentUpdated) {
      console.log(`📝 Content has ${storedContent ? 'changed' : 'been fetched for the first time'}, updating knowledge base...`);
      
      // Store the new content
      storedContent = {
        url,
        content: rawContent,
        processedText,
        lastUpdated: new Date().toISOString(),
        contentHash
      };
      
      return {
        success: true,
        message: `Content updated successfully from ${url}`,
        contentUpdated: true,
        content: processedText
      };
    } else {
      // At this point storedContent is guaranteed to exist
      const lastUpdated = storedContent!.lastUpdated;
      const processedText = storedContent!.processedText;
      
      console.log(`✅ Content unchanged since last check (${lastUpdated})`);
      return {
        success: true,
        message: `Content is up to date (last checked: ${lastUpdated})`,
        contentUpdated: false,
        content: processedText
      };
    }
    
  } catch (error) {
    console.error("❌ Web scraping error:", error);
    return {
      success: false,
      message: `Failed to scrape content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      contentUpdated: false
    };
  }
}

// Get the current stored content for the chatbot to use (optimized for token efficiency)
export function getStoredWebsiteContent(maxLength: number = 5000): string {
  if (!storedContent) {
    return "No website content has been scraped yet. The assistant will rely on uploaded documents and general SACCO knowledge.";
  }
  
  // Extract key sections and limit total length to avoid token limits
  let content = storedContent.processedText;
  
  // If content is too long, extract key sections
  if (content.length > maxLength) {
    const sections = [];
    
    // Extract key information about SOYOSOYO SACCO
    const aboutMatch = content.match(/The Evolution of Soyosoyo SACCO[\s\S]{0,1500}/i);
    if (aboutMatch) sections.push("ABOUT: " + aboutMatch[0]);
    
    // Extract mission and vision
    const missionMatch = content.match(/To continually empower members[\s\S]{0,500}/i);
    if (missionMatch) sections.push("MISSION: " + missionMatch[0]);
    
    // Extract products information
    const productsMatch = content.match(/OUR PRODUCTS[\s\S]{0,2000}/i);
    if (productsMatch) sections.push("PRODUCTS: " + productsMatch[0]);
    
    // Extract loan information
    const loanMatch = content.match(/Members can borrow up to three times their savings[\s\S]{0,300}/i);
    if (loanMatch) sections.push("LOANS: " + loanMatch[0]);
    
    content = sections.join('\n\n');
    
    // If still too long, truncate
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + "... [Content truncated for efficiency]";
    }
  }
  
  return `
SOYOSOYO SACCO Website Content (Last Updated: ${storedContent.lastUpdated}):

${content}

Note: This information is from the official SOYOSOYO SACCO website and is automatically updated.
  `.trim();
}

// Get scraping status and statistics
export function getScrapingStatus(): {
  hasContent: boolean;
  lastUpdated: string | null;
  contentLength: number;
  url: string | null;
} {
  return {
    hasContent: !!storedContent,
    lastUpdated: storedContent?.lastUpdated || null,
    contentLength: storedContent?.processedText.length || 0,
    url: storedContent?.url || null
  };
}

// Initialize scraping on service startup
export async function initializeWebScraping(): Promise<void> {
  console.log("🚀 Initializing web scraping service...");
  try {
    const result = await scrapeWebsiteContent();
    if (result.success) {
      console.log("✅ Initial website content loaded successfully");
    } else {
      console.log("⚠️ Failed to load initial website content:", result.message);
    }
  } catch (error) {
    console.error("❌ Error during web scraping initialization:", error);
  }
}
