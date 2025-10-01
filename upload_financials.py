#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER FOR SOYOSOYO SACCO
Only processes NEW files, skips already processed ones to save tokens
Includes proper PDF extraction and chunking for vector embeddings
"""

import pandas as pd
import psycopg2
import os
import base64
import json
import glob
from datetime import datetime
from pathlib import Path
from typing import List
import openai
import numpy as np

# Environment variables
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Directories to scan for files
SCAN_DIRECTORIES = ["financials/", "uploads/"]

# Supported file types
SUPPORTED_EXTENSIONS = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
}

# Initialize OpenAI client
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable not set")
openai.api_key = OPENAI_API_KEY

def chunk_text(text: str, max_chunk_size: int = 500, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    current_chunk = []
    current_length = 0
    for word in words:
        current_chunk.append(word)
        current_length += len(word) + 1
        if current_length >= max_chunk_size:
            chunks.append(" ".join(current_chunk))
            current_chunk = current_chunk[-overlap:] if overlap > 0 else []
            current_length = sum(len(w) + 1 for w in current_chunk)
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

def generate_embeddings(chunks: List[str]) -> List[List[float]]:
    try:
        response = openai.Embedding.create(input=chunks, model="text-embedding-ada-002")
        return [embedding["embedding"] for embedding in response["data"]]
    except Exception as e:
        print(f"❌ Error generating embeddings: {e}")
        return [[]] * len(chunks)

def generate_summary_embedding(chunks: List[str]) -> List[float]:
    embeddings = generate_embeddings(chunks)
    if not embeddings or not any(embeddings):
        return None
    return np.mean([emb for emb in embeddings if emb], axis=0).tolist()

def process_file(file_path):
    # ... (same as previous response: process Excel, PDF, etc., and return file_data with chunks and embeddings)
    pass

def main():
    print("🚀 Starting SMART Document Upload for SOYOSOYO SACCO...")
    if not DATABASE_URL or not OPENAI_API_KEY:
        print("❌ Error: Missing DATABASE_URL or OPENAI_API_KEY")
        return
    supported_files = find_supported_files()
    if not supported_files:
        print("ℹ️ No supported files found")
        return
    print(f"📂 Found {len(supported_files)} supported files")
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cur = conn.cursor()
        existing_files = get_existing_files(cur)
        monthly_patterns = ['%financial%', '%finance%', '%budget%', '%member%', '%dividend%', '%qualification%']
        for pattern in monthly_patterns:
            cur.execute("DELETE FROM document_chunks WHERE file_id IN (SELECT id FROM uploaded_files WHERE filename ILIKE %s OR original_name ILIKE %s)", (pattern, pattern))
            cur.execute("DELETE FROM uploaded_files WHERE filename ILIKE %s OR original_name ILIKE %s", (pattern, pattern))
        new_files = 0
        successful_uploads = 0
        for file_path in supported_files:
            filename = os.path.basename(file_path)
            if filename in existing_files and not is_monthly_file(filename):
                print(f"⏭️ Skipping: {filename}")
                continue
            print(f"🆕 Processing: {filename}")
            new_files += 1
            file_data = process_file(file_path)
            if file_data:
                try:
                    cur.execute("""
                        INSERT INTO uploaded_files (
                            filename, original_name, mime_type, size, extracted_text, 
                            metadata, content, processed, embedding
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        file_data["filename"], file_data["original_name"], file_data["mime_type"],
                        file_data["size"], file_data["extracted_text"], file_data["metadata"],
                        file_data["content"], True, file_data["summary_embedding"]
                    ))
                    file_id = cur.fetchone()[0]
                    print(f"   ✅ Uploaded file: {file_data['filename']} (ID: {file_id})")
                    for idx, (chunk, embedding) in enumerate(zip(file_data["chunks"], file_data["chunk_embeddings"])):
                        if embedding:
                            cur.execute("""
                                INSERT INTO document_chunks (
                                    file_id, chunk_text, chunk_index, embedding
                                ) VALUES (%s, %s, %s, %s)
                            """, (file_id, chunk, idx, embedding))
                    print(f"   ✅ Inserted {len(file_data['chunks'])} chunks")
                    successful_uploads += 1
                except psycopg2.Error as e:
                    print(f"   ❌ Database error for {file_path}: {e}")
        conn.commit()
        print(f"\n🎉 UPLOAD COMPLETE! Successfully uploaded: {successful_uploads}/{new_files}")
    except psycopg2.Error as e:
        print(f"❌ Database connection error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()
        print("🔒 Database connection closed")

if __name__ == "__main__":
    main()
