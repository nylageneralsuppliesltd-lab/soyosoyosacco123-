import { db } from "../db.js";
import { uploadedFiles, documentChunks } from "../../shared/schema.js";
import { sql, isNotNull, desc } from "drizzle-orm";
import { getEmbedding } from "../utils/embeddings.js";

/**
 * Perform semantic vector search with fallback to text-based retrieval
 * Includes grouping by file, summary embeddings, and similarity threshold
 */
export async function searchSimilarChunks(
  query,
  limit = 15,
  similarityThreshold = 0.75
) {
  try {
    console.log(`🔍 [VECTOR] Searching: "${query.substring(0, 100)}..."`);

    // === 1. Generate embedding for the query ===
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn("⚠️ [VECTOR] No embedding generated — using fallback search");
      return await fallbackTextSearch(query, limit);
    }

    // === 2. Perform vector similarity search ===
    // Combine chunk-level and summary embeddings (uploaded_files.embedding)
    const vectorLiteral = JSON.stringify(queryEmbedding);

    const results = await db.execute(sql`
      (
        SELECT
          dc.chunk_text AS text,
          uf.original_name AS filename,
          1 - (dc.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM document_chunks dc
        JOIN uploaded_files uf ON dc.file_id = uf.id
        WHERE dc.embedding IS NOT NULL
      )
      UNION ALL
      (
        SELECT
          uf.extracted_text AS text,
          uf.original_name AS filename,
          1 - (uf.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM uploaded_files uf
        WHERE uf.embedding IS NOT NULL
      )
      ORDER BY similarity DESC
      LIMIT ${limit * 3}  -- fetch extra before filtering/grouping
    `);

    if (!results?.rows?.length) {
      console.warn("⚠️ [VECTOR] No vector matches found, using fallback search");
      return await fallbackTextSearch(query, limit);
    }

    // === 3. Filter by similarity threshold ===
    let chunks = results.rows
      .map((row) => ({
        text: row.text || "",
        filename: row.filename || "unknown",
        similarity: parseFloat(row.similarity || 0),
      }))
      .filter((r) => r.similarity >= similarityThreshold);

    console.log(
      `✅ [VECTOR] Found ${chunks.length} chunks >= ${similarityThreshold} similarity`
    );

    if (chunks.length === 0) {
      console.warn("⚠️ [VECTOR] All matches below threshold — using fallback");
      return await fallbackTextSearch(query, limit);
    }

    // === 4. Group by filename ===
    const grouped = {};
    for (const c of chunks) {
      if (!grouped[c.filename]) grouped[c.filename] = [];
      grouped[c.filename].push(c);
    }

    // Sort and slice top results per file
    const groupedResults = Object.entries(grouped).map(([filename, items]) => {
      const topChunks = items
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);
      const joinedText = topChunks.map((x) => x.text).join("\n\n");
      const avgSim =
        topChunks.reduce((acc, x) => acc + x.similarity, 0) / topChunks.length;
      return { filename, text: joinedText, similarity: avgSim };
    });

    // Sort overall and limit final count
    groupedResults.sort((a, b) => b.similarity - a.similarity);
    return groupedResults.slice(0, limit);
  } catch (error) {
    console.error("❌ [VECTOR] Search error:", error);
    return await fallbackTextSearch(query, limit);
  }
}

/**
 * Fallback to basic text-based search if vector search fails
 * Returns trimmed text for performance
 */
async function fallbackTextSearch(query, limit) {
  try {
    console.log("🔄 [FALLBACK] Using text-based retrieval...");

    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(limit);

    const results = rows.map((r) => ({
      text: (r.text || "").substring(0, 1000), // trim to 1000 chars
      filename: r.filename || "unknown",
      similarity: 0.5,
    }));

    console.log(`✅ [FALLBACK] Returned ${results.length} files`);
    return results;
  } catch (error) {
    console.error("❌ [FALLBACK] Retrieval error:", error);
    return [];
  }
}

/**
 * Retrieve all stored document texts for diagnostic or offline mode
 */
export async function getAllDocumentTexts(limit = 10) {
  try {
    const rows = await db
      .select({
        text: uploadedFiles.extractedText,
        filename: uploadedFiles.originalName,
      })
      .from(uploadedFiles)
      .where(isNotNull(uploadedFiles.extractedText))
      .orderBy(desc(uploadedFiles.uploadedAt))
      .limit(limit);

    if (rows.length === 0) {
      return "No documents found in the SOYOSOYO SACCO database.";
    }

    return rows
      .map(
        (row) =>
          `=== ${row.filename} ===\n${(row.text || "").substring(0, 1500)}`
      )
      .join("\n\n");
  } catch (error) {
    console.error("❌ [VECTOR] Document retrieval error:", error);
    return "Unable to retrieve document texts.";
  }
}
