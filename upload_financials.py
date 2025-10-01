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

# Use the DATABASE_URL from Render environment
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Directories to scan for files
SCAN_DIRECTORIES = [
    "financials/",
    "uploads/",
]

# Supported file types
SUPPORTED_EXTENSIONS = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
}

# Initialize OpenAI client
openai.api_key = OPENAI_API_KEY

def chunk_text(text: str, max_chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into chunks with overlap for better context retention."""
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
    """Generate 1536-dimensional embeddings using OpenAI's text-embedding-ada-002."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    try:
        response = openai.Embedding.create(
            input=chunks,
            model="text-embedding-ada-002"
        )
        return [embedding["embedding"] for embedding in response["data"]]
    except Exception as e:
        print(f"❌ Error generating embeddings: {e}")
        return [[]] * len(chunks)  # Return empty embeddings to avoid crashing

def generate_summary_embedding(chunks: List[str]) -> List[float]:
    """Generate a single embedding for the entire document by averaging chunk embeddings."""
    embeddings = generate_embeddings(chunks)
    if not embeddings or not any(embeddings):
        return None
    return np.mean([emb for emb in embeddings if emb], axis=0).tolist()

def process_file(file_path):
    """Process a single file and return data for database insertion."""
    try:
        print(f"📖 Processing: {file_path}")
        
        file_ext = Path(file_path).suffix.lower()
        file_type = classify_file_type(file_path)
        filename = os.path.basename(file_path)
        
        print(f"   🏷️ Type: {file_type} ({file_ext})")
        
        # Process based on file type
        if file_ext in ['.xlsx', '.xls']:
            df_dict = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            print(f"   📊 Sheets: {list(df_dict.keys())}")
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
            
        elif file_ext == '.pdf':
            extracted_text = extract_pdf_text(file_path)
            print(f"   📄 PDF text extracted: {len(extracted_text)} characters")
            
        elif file_ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            extracted_text = f"=== SOYOSOYO SACCO TEXT DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n\n{content}"
            print(f"   📝 Text file processed: {len(content)} characters")
            
        elif file_ext == '.csv':
            df = pd.read_csv(file_path)
            df_dict = {'Sheet1': df}
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
            print(f"   📋 CSV processed: {len(df)} rows")
            
        else:
            print(f"   ⚠️ Unsupported file type: {file_ext}")
            return None
        
        # Read file as binary for content storage
        with open(file_path, 'rb') as file:
            file_content = base64.b64encode(file.read()).decode('utf-8')
        
        file_size = os.path.getsize(file_path)
        mime_type = SUPPORTED_EXTENSIONS.get(file_ext, 'application/octet-stream')
        
        metadata = {
            "file_type": file_type,
            "file_extension": file_ext,
            "analysis": f"{file_type.replace('_', ' ').title()} document processed automatically",
            "upload_method": "smart_uploader",
            "source_path": file_path,
            "processed_date": datetime.now().isoformat()
        }
        
        if file_ext in ['.xlsx', '.xls']:
            metadata.update({
                "sheets": list(df_dict.keys()),
                "total_rows": sum(len(df) for df in df_dict.values())
            })
        
        # Chunk the extracted text
        text_chunks = chunk_text(extracted_text, max_chunk_size=500, overlap=50)
        print(f"   ✂️ Created {len(text_chunks)} chunks")
        
        # Generate embeddings for chunks
        chunk_embeddings = generate_embeddings(text_chunks)
        print(f"   🧠 Generated {len(chunk_embeddings)} chunk embeddings")
        
        # Generate summary embedding for uploaded_files.embedding
        summary_embedding = generate_summary_embedding(text_chunks)
        print(f"   🧠 Generated summary embedding" if summary_embedding else "   ⚠️ No summary embedding generated")
        
        return {
            "filename": filename,
            "original_name": filename,
            "mime_type": mime_type,
            "size": file_size,
            "extracted_text": extracted_text,
            "metadata": json.dumps(metadata),
            "content": file_content,
            "file_type": file_type,
            "chunks": text_chunks,
            "chunk_embeddings": chunk_embeddings,
            "summary_embedding": summary_embedding
        }
        
    except Exception as e:
        print(f"   ❌ Error processing {file_path}: {e}")
        return None

def main():
    print("🚀 Starting SMART Document Upload for SOYOSOYO SACCO...")
    print("💡 Only processes NEW files to save tokens!")
    print("📄 Enhanced PDF extraction and vector embedding for loan policies and bylaws!")
    
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL environment variable not set")
        return
    if not OPENAI_API_KEY:
        print("❌ Error: OPENAI_API_KEY environment variable not set")
        return
    
    supported_files = find_supported_files()
    
    if not supported_files:
        print("ℹ️ No supported files found in scanned directories")
        return
    
    print(f"📂 Found {len(supported_files)} supported files")
    
    try:
        print("\n🔗 Connecting to Neon PostgreSQL...")
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cur = conn.cursor()
        
        # Get existing processed files
        print("🔍 Checking existing processed files...")
        existing_files = get_existing_files(cur)
        print(f"📚 Found {len(existing_files)} already processed files")
        
        # Clean up monthly files and their chunks
        print("🔄 Cleaning up monthly files that need updates...")
        monthly_patterns = ['%financial%', '%finance%', '%budget%', '%member%', '%dividend%', '%qualification%']
        deleted_count = 0
        for pattern in monthly_patterns:
            cur.execute("""
                DELETE FROM document_chunks WHERE file_id IN (
                    SELECT id FROM uploaded_files WHERE filename ILIKE %s OR original_name ILIKE %s
                )
            """, (pattern, pattern))
            cur.execute("""
                DELETE FROM uploaded_files WHERE filename ILIKE %s OR original_name ILIKE %s
            """, (pattern, pattern))
            deleted_count += cur.rowcount
        
        print(f"✅ {deleted_count} monthly files and their chunks cleaned up")
        
        # Process files intelligently
        new_files = 0
        skipped_files = 0
        successful_uploads = 0
        
        for file_path in supported_files:
            filename = os.path.basename(file_path)
            
            if filename in existing_files and not is_monthly_file(filename):
                print(f"⏭️ Skipping (already processed): {filename}")
                skipped_files += 1
                continue
            
            print(f"🆕 Processing new/updated file: {filename}")
            new_files += 1
            
            file_data = process_file(file_path)
            
            if file_data:
                try:
                    # Insert into uploaded_files
                    cur.execute("""
                        INSERT INTO uploaded_files (
                            filename, original_name, mime_type, size, extracted_text, 
                            metadata, content, processed, embedding
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        file_data["filename"],
                        file_data["original_name"],
                        file_data["mime_type"],
                        file_data["size"],
                        file_data["extracted_text"],
                        file_data["metadata"],
                        file_data["content"],
                        True,
                        file_data["summary_embedding"]
                    ))
                    
                    file_id = cur.fetchone()[0]
                    print(f"   ✅ Uploaded file: {file_data['filename']} (ID: {file_id})")
                    
                    # Insert chunks and embeddings into document_chunks
                    for idx, (chunk, embedding) in enumerate(zip(file_data["chunks"], file_data["chunk_embeddings"])):
                        if embedding:  # Skip empty embeddings
                            cur.execute("""
                                INSERT INTO document_chunks (
                                    file_id, chunk_text, chunk_index, embedding
                                ) VALUES (%s, %s, %s, %s)
                            """, (
                                file_id, chunk, idx, embedding
                            ))
                    
                    print(f"   ✅ Inserted {len(file_data['chunks'])} chunks with embeddings")
                    successful_uploads += 1
                    
                except psycopg2.Error as e:
                    print(f"   ❌ Database error for {file_path}: {e}")
        
        # Commit all changes
        conn.commit()
        
        print(f"\n🎉 UPLOAD COMPLETE!")
        print(f"   📊 Files found: {len(supported_files)}")
        print(f"   ✅ Successfully uploaded: {successful_uploads}")
        print(f"   ❌ Failed uploads: {new_files - successful_uploads}")
        
        # Show breakdown by file type
        print(f"\n📋 BREAKDOWN BY TYPE:")
        type_counts = {}
        ext_counts = {}
        for file_path in supported_files:
            file_type = classify_file_type(file_path)
            file_ext = Path(file_path).suffix.lower()
            type_counts[file_type] = type_counts.get(file_type, 0) + 1
            ext_counts[file_ext] = ext_counts.get(file_ext, 0) + 1
        
        for file_type, count in type_counts.items():
            print(f"   {file_type.replace('_', ' ').title()}: {count} files")
            
        print(f"\n📄 BREAKDOWN BY FORMAT:")
        for ext, count in ext_counts.items():
            print(f"   {ext.upper()}: {count} files")
        
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
