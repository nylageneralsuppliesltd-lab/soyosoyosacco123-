#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER v5 - FULLY AUTOMATIC
- Auto-detects monthly files by date in filename
- Keeps only the LATEST monthly file per category
- Deletes old from DB + disk
- Static files: upload once
"""

import pandas as pd
import psycopg
import os
import base64
import json
import glob
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np
from openai import OpenAI

# ===================== CONFIG =====================
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SCAN_DIRECTORIES = ["financials/", "uploads/"]
DELETE_OLD_FROM_DISK = True
SUPPORTED_EXTENSIONS = {'.xlsx', '.xls', '.pdf', '.txt', '.csv'}

SUPPORTED_MIME = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
}

if not DATABASE_URL or not OPENAI_API_KEY:
    raise ValueError("Missing DATABASE_URL or OPENAI_API_KEY")

client = OpenAI(api_key=OPENAI_API_KEY)

# ===================== DATE PARSER =====================
MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
}

def parse_date_from_filename(filename: str) -> Optional[datetime]:
    text = filename.lower().replace('_', ' ').replace('-', ' ')
    # Pattern 1: [Day] Month Year
    m = re.search(r'\b(?:\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|'
                  r'january|february|march|april|may|june|july|august|september|october|november|december)'
                  r'\s+(\d{4})\b', text)
    if m:
        month_str, year = m.groups()
        month = MONTH_MAP.get(month_str[:3])
        if month:
            return datetime(int(year), month, 1)

    # Pattern 2: YYYY-MM
    m = re.search(r'\b(\d{4})[._-](\d{2})\b', text)
    if m:
        year, month = m.groups()
        try:
            return datetime(int(year), int(month), 1)
        except:
            pass

    # Pattern 3: Q1/Q2/Q3/Q4 2025
    m = re.search(r'\bQ([1-4])\s*(\d{4})\b', text, re.IGNORECASE)
    if m:
        q, year = m.groups()
        month = {'1': 1, '2': 4, '3': 7, '4': 10}[q]
        return datetime(int(year), month, 1)

    return None

# ===================== CLASSIFIER =====================
def classify_and_date_file(file_path: str) -> Dict[str, Any]:
    filename = os.path.basename(file_path)
    file_type = "sacco_document"
    lower = filename.lower()

    if any(k in lower for k in ['financial', 'budget', 'income', 'expense']):
        file_type = "financial_report"
    elif any(k in lower for k in ['member', 'dividend', 'payout']):
        file_type = "member_dividend"
    elif any(k in lower for k in ['loan', 'lending']):
        file_type = "loan_document"
    elif any(k in lower for k in ['bylaw', 'policy', 'constitution']):
        file_type = "policy_document"

    return {
        "path": file_path,
        "filename": filename,
        "type": file_type,
        "date": parse_date_from_filename(filename),
        "is_monthly": parse_date_from_filename(filename) is not None
    }

# ===================== CORE =====================
def chunk_text(text: str, max_chunk_size: int = 500, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    current = []
    length = 0
    for word in words:
        current.append(word)
        length += len(word) + 1
        if length >= max_chunk_size:
            chunks.append(" ".join(current))
            current = current[-overlap:] if overlap > 0 else []
            length = sum(len(w) + 1 for w in current)
    if current:
        chunks.append(" ".join(current))
    return chunks

def generate_embeddings(chunks: List[str]) -> List[List[float]]:
    try:
        resp = client.embeddings.create(input=chunks, model="text-embedding-ada-002")
        return [e.embedding for e in resp.data]
    except Exception as e:
        print(f"Embedding error: {e}")
        return [[] for _ in chunks]

def generate_summary_embedding(chunks: List[str]) -> List[float]:
    embs = generate_embeddings(chunks)
    valid = [e for e in embs if e]
    return np.mean(valid, axis=0).tolist() if valid else []

def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    try:
        if ext in ['.xlsx', '.xls']:
            dfs = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            lines = [f"File: {os.path.basename(file_path)}"]
            for sheet, df in dfs.items():
                lines.append(f"\n--- {sheet} ---\n{df.to_string(index=False)}")
            return "\n".join(lines)
        elif ext == '.pdf':
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                return "".join(p.extract_text() or "" for p in pdf.pages)
        elif ext == '.csv':
            return pd.read_csv(file_path).to_string(index=False)
        elif ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
    except Exception as e:
        print(f"Text extraction failed: {e}")
    return "Text extraction failed"

# ===================== MAIN =====================
def main():
    print("SMART UPLOADER v5 - FULLY AUTOMATIC MONTHLY REFRESH")

    files = []
    for dir_path in SCAN_DIRECTORIES:
        if not os.path.exists(dir_path):
            continue
        for ext in SUPPORTED_EXTENSIONS:
            files.extend(glob.glob(f"{dir_path}**/*{ext}", recursive=True))

    if not files:
        print("No files found.")
        return

    classified = [classify_and_date_file(f) for f in files]
    monthly_files = [f for f in classified if f["is_monthly"]]
    static_files = [f for f in classified if not f["is_monthly"]]

    print(f"Found {len(monthly_files)} monthly, {len(static_files)} static files")

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # === 1. FIND LATEST MONTHLY PER TYPE ===
        latest_by_type = {}
        for mf in monthly_files:
            key = mf["type"]
            if key not in latest_by_type or mf["date"] > latest_by_type[key]["date"]:
                latest_by_type[key] = mf

        old_names = [mf["filename"] for mf in monthly_files
                     if latest_by_type.get(mf["type"])["path"] != mf["path"]]

        # === 2. DELETE OLD FROM DB ===
        if old_names:
            print(f"Deleting {len(old_names)} old monthly files from DB...")
            cur.execute("DELETE FROM document_chunks WHERE file_id IN (SELECT id FROM uploaded_files WHERE original_name = ANY(%s))", (old_names,))
            cur.execute("DELETE FROM uploaded_files WHERE original_name = ANY(%s) RETURNING original_name", (old_names,))
            for (name,) in cur.fetchall():
                print(f"   Removed: {name}")

        # === 3. GET EXISTING ===
        cur.execute("SELECT original_name FROM uploaded_files WHERE processed = true")
        existing = {row[0] for row in cur.fetchall()}

        # === 4. UPLOAD NEW ===
        to_upload = []
        for mf in latest_by_type.values():
            if mf["filename"] not in existing:
                to_upload.append(mf["path"])
        for sf in static_files:
            if sf["filename"] not in existing:
                to_upload.append(sf["path"])

        print(f"Uploading {len(to_upload)} new files...")

        for path in to_upload:
            print(f"   Uploading: {os.path.basename(path)}")
            text = extract_text(path)
            chunks = chunk_text(text)
            chunk_embs = generate_embeddings(chunks)
            summary_emb = generate_summary_embedding(chunks)

            with open(path, 'rb') as f:
                content = base64.b64encode(f.read()).decode()

            file_info = classify_and_date_file(path)
            mime = SUPPORTED_MIME.get(Path(path).suffix.lower(), 'application/octet-stream')

            cur.execute("""
                INSERT INTO uploaded_files
                (filename, original_name, mime_type, size, extracted_text, metadata, content, processed, uploaded_at, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, NOW(), %s)
                RETURNING id
            """, (
                file_info["filename"], file_info["filename"], mime,
                os.path.getsize(path), text,
                json.dumps({"file_type": file_info["type"], "upload_method": "v5", "date": datetime.now().isoformat()}),
                content, summary_emb
            ))
            file_id = cur.fetchone()[0]

            for i, (chunk, emb) in enumerate(zip(chunks, chunk_embs)):
                if emb:
                    cur.execute("""
                        INSERT INTO document_chunks (file_id, chunk_text, chunk_index, embedding)
                        VALUES (%s, %s, %s, %s)
                    """, (file_id, chunk, i, emb))

        # === 5. DELETE OLD FROM DISK ===
        if DELETE_OLD_FROM_DISK and old_names:
            for mf in monthly_files:
                if mf["filename"] in old_names:
                    try:
                        os.remove(mf["path"])
                        print(f"   Deleted from disk: {mf['filename']}")
                    except:
                        pass

        conn.commit()
        print(f"\nUPLOAD COMPLETE! {len(to_upload)} uploaded, {len(old_names)} removed.")

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
