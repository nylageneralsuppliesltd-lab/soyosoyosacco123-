import { db } from "../db.js";
import { uploadedFiles, documentChunks } from "../../shared/schema.js";
import { sql, isNotNull, desc } from "drizzle-orm";
import { getEmbedding } from "../utils/embeddings.js";

// Vector similarity search using pgvector
export async function searchSimilarChunks(
  query: string,
  limit = 15
): Promise<Array<{ text: string; filename: string; similarity: number }>> {
  try {
    console.log(`🔍 [VECTOR] Searching: "${query.substring(0, 100)}..."`);

    // Generate embedding for query
    const queryEmbedding = await getEmbedding(query);
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.log("⚠️ [VECTOR] No embedding generated, using fallback");
      return await fallbackTextSearch(query, limit);
    }

    // Perform vector similarity search with Neon serverless
    // Using cosine distance operator <=> which works with Neon HTTP
    const results = await db.execute(sql`
      SELECT 
        dc.chunk_text,
        uf.original_name as filename,
        1 - (dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM document_chunks dc
      JOIN uploaded_files uf ON dc.file_id = uf.id
      WHERE dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    const chunks = results.rows.map((row: any) => ({
      text: row.chunk_text,
      filename: row.filename,
      similarity: parseFloat(row.similarity),
    }));

    console.log(`✅ [VECTOR] Found ${chunks.length} relevant chunks`);
    
    if (chunks.length === 0) {
      console.log("⚠️ [VECTOR] No chunks found, using fallback");
      return await fallbackTextSearch(query, limit);
    }

    return chunks;
  } catch (error) {
    console.error("❌ [VECTOR] Search error:", error);
    console.log("⚠️ [VECTOR] Falling back to text search");
    return await fallbackTextSearch(query, limit);
  }
}

// Fallback to text-based search if vector search fails
async function fallbackTextSearch(
  query: string,
  limit: number
): Promise<Array<{ text: string; filename: string; similarity: number }>> {
  try {
    console.log("🔄 [FALLBACK] Using text-based retrieval");
    
    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(limit);

    return rows.map(row => ({
      text: row.text || "",
      filename: row.filename,
      similarity: 0.5,
    }));
  } catch (error) {
    console.error("❌ [FALLBACK] Error:", error);
    return [];
  }
}

// Get full file text (for when vector search isn't needed)
export async function getAllDocumentTexts(): Promise<string> {
  try {
    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(10);

    if (rows.length === 0) {
      return "No documents found in SOYOSOYO SACCO database.";
    }

    const texts = rows.map(row => `=== ${row.filename} ===\n${row.text}`);
    return texts.join("\n\n");
  } catch (error) {
    console.error("❌ [VECTOR] Document retrieval error:", error);
    return "Unable to retrieve documents.";
  }
}
