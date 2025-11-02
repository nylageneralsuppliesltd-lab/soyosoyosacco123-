#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER FOR SOYOSOYO SACCO
- Monthly files: refreshed every run
- Static files: uploaded once (deduplicated)
- Fast bulk deletes + efficient inserts
"""

import pandas as pd
import psycopg
import os
import base64
import json
import glob
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
import numpy as np
from openai import OpenAI
from time import sleep

# ===================== CONFIG =====================
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

SCAN_DIRECTORIES = ["financials/", "uploads/"]

SUPPORTED_EXTENSIONS = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
}

# ===================== VALIDATE ENV =====================
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable not set")

client = OpenAI(api_key=OPENAI_API_KEY)

# ===================== HELPERS =====================
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


def generate_embeddings(chunks: List[str], retries: int = 3) -> List[List[float]]:
    for attempt in range(retries):
        try:
            response = client.embeddings.create(input=chunks, model="text-embedding-ada-002")
            return [emb.embedding for emb in response.data]
        except Exception as e:
            print(f"Warning: OpenAI API error (attempt {attempt + 1}/{retries}): {e}")
            if attempt < retries - 1:
                sleep(2 ** attempt)
    print("Failed to generate embeddings after retries")
    return [[] for _ in chunks]


def generate_summary_embedding(chunks: List[str]) -> List[float]:
    embeddings = generate_embeddings(chunks)
    valid_embs = [e for e in embeddings if e and len(e) > 0]
    return np.mean(valid_embs, axis=0).tolist() if valid_embs else []


def classify_file_type(file_path: str) -> str:
    filename = os.path.basename(file_path).lower()
    if any(k in filename for k in ['financial', 'finance', 'budget', 'balance', 'income', 'expense', 'profit', 'loss']):
        return "financial_report"
    if any(k in filename for k in ['member', 'dividend', 'distribution', 'payout', 'share', 'contribution']):
        return "member_dividend"
    if any(k in filename for k in ['bylaw', 'policy', 'regulation', 'rule', 'governance', 'constitution']):
        return "policy_document"
    if any(k in filename for k in ['loan', 'lending', 'credit', 'qualification', 'application']):
        return "loan_document"
    return "sacco_document"


def is_monthly_file(filename: str) -> bool:
    keywords = [
        'financial', 'finance', 'budget',
        'member', 'dividend', 'distribution', 'payout',
        'contribution', 'qualification',
        'sep', 'sept', 'september', 'aug', 'august', 'oct', 'october',
        '2025', '2024'
    ]
    return any(k in filename.lower() for k in keywords)


def extract_pdf_text(file_path: str) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            text = "".join(page.extract_text() or "" for page in pdf.pages)
        return text.strip() or "No text extracted from PDF"
    except Exception as e:
        print(f"   Warning: PDF extraction failed: {e}")
        return f"PDF file: {os.path.basename(file_path)}"


def excel_to_readable_text(df_dict: Dict[str, pd.DataFrame], file_type: str, filename: str) -> str:
    lines = [f"=== SOYOSOYO SACCO DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n"]
    for sheet_name, df in df_dict.items():
        lines.append(f"\n=== Sheet: {sheet_name} ===\n")
        lines.append(df.to_string(index=False))
    return "\n".join(lines)


def find_supported_files() -> List[str]:
    files = []
    for dir_path in SCAN_DIRECTORIES:
        if not os.path.exists(dir_path):
            continue
        for ext in SUPPORTED_EXTENSIONS:
            pattern = f"{dir_path}**/*{ext}"
            found = glob.glob(pattern, recursive=True)
            files.extend(found)
            if found:
                print(f"   Folder: {dir_path}: Found {len(found)} {ext} files")
    return files


def process_file(file_path: str) -> Dict[str, Any]:
    try:
        file_ext = Path(file_path).suffix.lower()
        filename = os.path.basename(file_path)
        file_type = classify_file_type(file_path)
        print(f"   Type: {file_type} ({file_ext})")

        # === Extract text ===
        if file_ext in ['.xlsx', '.xls']:
            df_dict = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            text = excel_to_readable_text(df_dict, file_type, filename)
        elif file_ext == '.pdf':
            text = extract_pdf_text(file_path)
        elif file_ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            text = f"=== SOYOSOYO SACCO DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n\n{content}"
        elif file_ext == '.csv':
            df = pd.read_csv(file_path)
            text = excel_to_readable_text({'Sheet1': df}, file_type, filename)
        else:
            print(f"   Warning: Unsupported extension: {file_ext}")
            return None

        # === Read binary content ===
        with open(file_path, 'rb') as f:
            content_b64 = base64.b64encode(f.read()).decode('utf-8')

        # === Metadata ===
        metadata = {
            "file_type": file_type,
            "file_extension": file_ext,
            "analysis": f"{file_type.replace('_', ' ').title()} - SOYOSOYO SACCO",
            "upload_method": "smart_uploader_v3",
            "source_path": file_path,
            "processed_date": datetime.now().isoformat()
        }

        # === Embeddings ===
        chunks = chunk_text(text, max_chunk_size=500, overlap=50)
        chunk_embs = generate_embeddings(chunks)
        summary_emb = generate_summary_embedding(chunks)

        return {
            "filename": filename,
            "original_name": filename,
            "mime_type": SUPPORTED_EXTENSIONS.get(file_ext, 'application/octet-stream'),
            "size": os.path.getsize(file_path),
            "extracted_text": text,
            "metadata": json.dumps(metadata),
            "content": content_b64,
            "chunks": chunks,
            "chunk_embeddings": chunk_embs,
            "summary_embedding": summary_emb
        }
    except Exception as e:
        print(f"   Error: Failed to process {file_path}: {e}")
        return None


# ===================== MAIN =====================
def main():
    print("Starting SMART Document Upload for SOYOSOYO SACCO...")
    print("Monthly files refresh, static files upload once")

    files = find_supported_files()
    if not files:
        print("Info: No supported files found.")
        return

    print(f"Found {len(files)} files to process\n")

    conn = None
    cur = None
    try:
        conn = psycopg.connect(DATABASE_URL)
        cur = conn.cursor()

        # === STEP 1: Delete old monthly files (bulk + fast) ===
        monthly_patterns = [
            '%financial%', '%finance%', '%budget%',
            '%member%', '%dividend%', '%distribution%', '%payout%',
            '%contribution%', '%qualification%',
            '%sep%', '%sept%', '%aug%', '%august%', '%oct%', '%october%',
            '%2025%', '%2024%'
        ]

        print("Refreshing monthly files...")
        cur.execute("""
            DELETE FROM document_chunks
            WHERE file_id IN (
                SELECT id FROM uploaded_files
                WHERE original_name ILIKE ANY(%s)
            )
        """, (monthly_patterns,))

        cur.execute("""
            DELETE FROM uploaded_files
            WHERE original_name ILIKE ANY(%s)
            RETURNING original_name
        """, (monthly_patterns,))
        deleted = cur.fetchall()
        for (name,) in deleted:
            print(f"   Refreshing: {name}")
        print(f"Deleted {len(deleted)} monthly files\n")

        # === STEP 2: Get current static files ===
        cur.execute("SELECT original_name FROM uploaded_files WHERE processed = true")
        existing = {row[0] for row in cur.fetchall()}
        print(f"Database has {len(existing)} static files\n")

        # === STEP 3: Process & upload ===
        uploaded = 0
        skipped = 0

        for file_path in files:
            filename = os.path.basename(file_path)

            # Skip static files that exist
            if filename in existing and not is_monthly_file(filename):
                print(f"Skipping: {filename} (already in DB)")
                skipped += 1
                continue

            print(f"Processing: {filename}")
            data = process_file(file_path)
            if not data:
                continue

            # Insert file + summary embedding
            cur.execute("""
                INSERT INTO uploaded_files
                (filename, original_name, mime_type, size, extracted_text, metadata, content, processed, uploaded_at, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, NOW(), %s)
                RETURNING id
            """, (
                data['filename'], data['original_name'], data['mime_type'],
                data['size'], data['extracted_text'], data['metadata'],
                data['content'], data['summary_embedding']
            ))
            file_id = cur.fetchone()[0]

            # Insert chunks
            chunk_count = 0
            for chunk, emb in zip(data['chunks'], data['chunk_embeddings']):
                if emb:
                    cur.execute("""
                        INSERT INTO document_chunks (file_id, chunk_text, chunk_index, embedding)
                        VALUES (%s, %s, %s, %s)
                    """, (file_id, chunk, data['chunks'].index(chunk), emb))
                    chunk_count += 1

            print(f"   Uploaded: {filename} (ID: {file_id}, {chunk_count} chunks)\n")
            uploaded += 1

        conn.commit()
        print(f"{'='*60}")
        print(f"UPLOAD COMPLETE!")
        print(f"   Uploaded: {uploaded} new files")
        print(f"   Skipped: {skipped} existing")
        print(f"   Total in DB: {uploaded + skipped + len(deleted)} (after refresh)")
        print(f"{'='*60}")

    except psycopg.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()
