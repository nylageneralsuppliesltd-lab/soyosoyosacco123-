#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER FOR SOYOSOYO SACCO
Only processes NEW files, skips already processed ones to save tokens
Includes proper PDF extraction and chunking for vector embeddings
"""

import pandas as pd
import psycopg  # Updated import
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

def classify_file_type(file_path: str) -> str:
    return "financial_document"

def get_existing_files(cur) -> set:
    cur.execute("SELECT filename FROM uploaded_files WHERE processed = true")
    return {row[0] for row in cur.fetchall()}

def is_monthly_file(filename: str) -> bool:
    monthly_keywords = ['financial', 'finance', 'budget', 'member', 'dividend', 'qualification']
    return any(keyword in filename.lower() for keyword in monthly_keywords)

def extract_pdf_text(file_path: str) -> str:
    import pdfplumber
    try:
        with pdfplumber.open(file_path) as pdf:
            text = "".join(page.extract_text() or "" for page in pdf.pages)
        return text if text.strip() else "No text extracted from PDF"
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
        return ""

def excel_to_readable_text(df_dict: dict, file_type: str, filename: str) -> str:
    result = [f"=== SOYOSOYO SACCO EXCEL DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n"]
    for sheet_name, df in df_dict.items():
        result.append(f"\nSheet: {sheet_name}\n")
        result.append(df.to_string(index=False))
    return "\n".join(result)

def find_supported_files() -> List[str]:
    supported_files = []
    for directory in SCAN_DIRECTORIES:
        for ext in SUPPORTED_EXTENSIONS.keys():
            supported_files.extend(glob.glob(f"{directory}**/*{ext}", recursive=True))
    return supported_files

def process_file(file_path):
    try:
        file_ext = Path(file_path).suffix.lower()
        file_type = classify_file_type(file_path)
        filename = os.path.basename(file_path)
        print(f"   🏷️ Type: {file_type} ({file_ext})")
        
        if file_ext in ['.xlsx', '.xls']:
            df_dict = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
        elif file_ext == '.pdf':
            extracted_text = extract_pdf_text(file_path)
        elif file_ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            extracted_text = f"=== SOYOSOYO SACCO TEXT DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n\n{content}"
        elif file_ext == '.csv':
            df = pd.read_csv(file_path)
            df_dict = {'Sheet1': df}
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
        else:
            print(f"   ⚠️ Unsupported file type: {file_ext}")
            return None
        
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
        
        text_chunks = chunk_text(extracted_text, max_chunk_size=500, overlap=50)
        chunk_embeddings = generate_embeddings(text_chunks)
        summary_embedding = generate_summary_embedding(text_chunks)
        
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
    if not DATABASE_URL or not OPENAI_API_KEY:
        print("❌ Error: Missing DATABASE_URL or OPENAI_API_KEY")
        return
    supported_files = find_supported_files()
    if not supported_files:
        print("ℹ️ No supported files found")
        return
    print(f"📂 Found {len(supported_files)} supported files")
    try:
        conn = psycopg.connect(DATABASE_URL)  # Updated connection
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
                except psycopg.Error as e:  # Updated exception
                    print(f"   ❌ Database error for {file_path}: {e}")
        conn.commit()
        print(f"\n🎉 UPLOAD COMPLETE! Successfully uploaded: {successful_uploads}/{new_files}")
    except psycopg.Error as e:
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
