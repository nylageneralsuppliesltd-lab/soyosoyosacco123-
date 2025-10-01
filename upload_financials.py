#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER + CHUNKER + EMBEDDER FOR SOYOSOYO SACCO
- Handles overwrite for monthly files (financial/member)
- Skips already processed files
- Extracts & cleans text
- Splits into chunks
- Embeds chunks into Postgres for vector search
"""

import os
import glob
import base64
import json
import pandas as pd
import psycopg2
from pathlib import Path
from datetime import datetime
from openai import OpenAI

# === CONFIG ===
DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

SCAN_DIRECTORIES = ["financials/", "uploads/"]

SUPPORTED_EXTENSIONS = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
}

client = OpenAI(api_key=OPENAI_API_KEY)


# === HELPERS ===
def chunk_text(text, chunk_size=1500, overlap=200):
    """Split text into chunks with overlap for better context."""
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        end = min(len(words), start + chunk_size)
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


def clean_text(text):
    """Remove extra whitespace, separators, and page markers."""
    import re
    text = re.sub(r"[_\-=]{3,}", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"Page \d+ of \d+", "", text, flags=re.I)
    return text.strip()


def ensure_tables(cur):
    """Create tables if not exists."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            filename TEXT UNIQUE,
            original_name TEXT,
            mime_type TEXT,
            size BIGINT,
            extracted_text TEXT,
            metadata JSONB,
            content TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW(),
            processed BOOLEAN DEFAULT TRUE
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS file_chunks (
            id SERIAL PRIMARY KEY,
            file_id UUID REFERENCES uploaded_files(id) ON DELETE CASCADE,
            chunk_index INT,
            chunk_text TEXT,
            embedding vector(1536), -- OpenAI embeddings
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)


def classify_file_type(file_path):
    path = file_path.lower()
    name = os.path.basename(file_path).lower()
    if any(k in path for k in ["financial", "finance", "budget"]):
        return "financial"
    if any(k in path for k in ["member", "dividend", "qualification"]):
        return "member_data"
    if any(k in path for k in ["policy", "bylaw"]):
        return "policy_document"
    if "loan" in path:
        return "loan_data"
    return "general_data"


def is_monthly_file(filename):
    return any(
        kw in filename.lower()
        for kw in ["financial", "finance", "budget", "member", "dividend", "qualification"]
    )


def find_supported_files():
    files = []
    for directory in SCAN_DIRECTORIES:
        if os.path.exists(directory):
            for ext in SUPPORTED_EXTENSIONS.keys():
                files.extend(glob.glob(f"{directory}**/*{ext}", recursive=True))
    for ext in SUPPORTED_EXTENSIONS.keys():
        files.extend(glob.glob(f"*{ext}"))
    return list(set(files))


# === FILE EXTRACTORS ===
def extract_pdf_text(file_path):
    try:
        import PyPDF2
        text = ""
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                content = page.extract_text()
                if content:
                    text += content + "\n"
        return text.strip()
    except Exception:
        return f"PDF Document: {file_path}\n(Note: extraction failed)"


def excel_to_text(file_path):
    df_dict = pd.read_excel(file_path, sheet_name=None, engine="openpyxl")
    text = ""
    for sheet, df in df_dict.items():
        text += f"\n=== SHEET: {sheet} ===\n"
        text += df.to_csv(index=False)
    return text.strip()


def process_file(file_path):
    ext = Path(file_path).suffix.lower()
    filename = os.path.basename(file_path)

    if ext in [".xlsx", ".xls"]:
        text = excel_to_text(file_path)
    elif ext == ".pdf":
        text = extract_pdf_text(file_path)
    elif ext == ".txt":
        text = open(file_path, "r", encoding="utf-8", errors="ignore").read()
    elif ext == ".csv":
        df = pd.read_csv(file_path)
        text = df.to_csv(index=False)
    else:
        return None

    text = clean_text(text)

    with open(file_path, "rb") as f:
        file_content = base64.b64encode(f.read()).decode("utf-8")

    return {
        "filename": filename,
        "original_name": filename,
        "mime_type": SUPPORTED_EXTENSIONS.get(ext, "application/octet-stream"),
        "size": os.path.getsize(file_path),
        "extracted_text": text,
        "metadata": json.dumps(
            {"file_type": classify_file_type(file_path), "processed_date": datetime.now().isoformat()}
        ),
        "content": file_content,
    }


def embed_texts(chunks):
    """Batch embed text chunks."""
    if not chunks:
        return []
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=chunks
    )
    return [d.embedding for d in response.data]


# === MAIN ===
def main():
    print("🚀 Smart Uploader + Chunker + Embedder Started")

    if not DATABASE_URL:
        print("❌ DATABASE_URL missing")
        return
    if not OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY missing")
        return

    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cur = conn.cursor()
    ensure_tables(cur)

    supported_files = find_supported_files()
    print(f"📂 Found {len(supported_files)} supported files")

    processed, skipped, total_chunks = 0, 0, 0

    for file_path in supported_files:
        filename = os.path.basename(file_path)

        # overwrite monthly files
        if is_monthly_file(filename):
            cur.execute("DELETE FROM uploaded_files WHERE filename = %s", (filename,))

        # skip if already exists
        cur.execute("SELECT id FROM uploaded_files WHERE filename = %s", (filename,))
        if cur.fetchone():
            print(f"⏭️ Skipping (already in DB): {filename}")
            skipped += 1
            continue

        file_data = process_file(file_path)
        if not file_data:
            continue

        # insert file metadata + text
        cur.execute(
            """
            INSERT INTO uploaded_files 
                (filename, original_name, mime_type, size, extracted_text, metadata, content, processed)
            VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE)
            RETURNING id
            """,
            (
                file_data["filename"],
                file_data["original_name"],
                file_data["mime_type"],
                file_data["size"],
                file_data["extracted_text"],
                file_data["metadata"],
                file_data["content"],
            ),
        )
        file_id = cur.fetchone()[0]

        # chunk + embed
        chunks = chunk_text(file_data["extracted_text"])
        embeddings = embed_texts(chunks)

        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            cur.execute(
                "INSERT INTO file_chunks (file_id, chunk_index, chunk_text, embedding) VALUES (%s,%s,%s,%s)",
                (file_id, idx, chunk, emb),
            )

        print(f"✅ Uploaded, chunked & embedded: {filename} ({len(chunks)} chunks)")
        processed += 1
        total_chunks += len(chunks)

    conn.commit()
    cur.close()
    conn.close()

    print("\n🎉 Upload Complete")
    print(f"   ✅ Files processed: {processed}")
    print(f"   ⏭️ Files skipped: {skipped}")
    print(f"   🧩 Total chunks embedded: {total_chunks}")


if __name__ == "__main__":
    main()
