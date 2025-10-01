#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER FOR SOYOSOYO SACCO
Now supports:
- Extracting text from PDF / Excel / TXT
- Chunking large texts into smaller sections
- Generating embeddings for each chunk (using OpenAI)
- Saving file + chunks into Neon PostgreSQL
- Skips already processed files to save tokens
"""

import os
import psycopg2
import pandas as pd
import PyPDF2
from openai import OpenAI

# ==========================
# CONFIG
# ==========================
DB_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_gKJ0Tx8WMmnp@ep-sparkling-wildflower-ado31mpo-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require")
client = OpenAI()

# ==========================
# HELPERS
# ==========================
def extract_text_from_file(filepath):
    """Extract text depending on file type."""
    if filepath.endswith(".pdf"):
        text = ""
        with open(filepath, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += page.extract_text() or ""
        return text

    elif filepath.endswith(".xlsx"):
        df = pd.read_excel(filepath, dtype=str).fillna("")
        return df.to_csv(index=False, sep=" ")

    elif filepath.endswith(".txt"):
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()

    else:
        return ""

def chunk_text(text, chunk_size=1000, overlap=200):
    """Split long text into overlapping chunks for embeddings."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

def embed_text(text):
    """Generate OpenAI embedding for given text chunk."""
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return resp.data[0].embedding

# ==========================
# CORE PROCESS
# ==========================
def process_file(filepath, conn):
    filename = os.path.basename(filepath)
    cursor = conn.cursor()

    # check if already processed
    cursor.execute("SELECT id FROM uploaded_files WHERE filename = %s", (filename,))
    if cursor.fetchone():
        print(f"Skipping {filename}, already in DB.")
        return

    # extract text
    text = extract_text_from_file(filepath)
    if not text.strip():
        print(f"No text extracted from {filename}.")
        return

    chunks = chunk_text(text)
    print(f"{filename} → {len(chunks)} chunks created.")

    # insert chunks
    for i, chunk in enumerate(chunks):
        embedding = embed_text(chunk)

        cursor.execute("""
            INSERT INTO uploaded_files (
                filename,
                original_name,
                mime_type,
                size,
                extracted_text,
                metadata,
                content,
                processed,
                embedding
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            f"{filename}#chunk{i}",
            filename,
            "application/octet-stream",
            os.path.getsize(filepath),
            chunk,
            None,
            None if i > 0 else open(filepath, "rb").read(),  # only save file once
            True,
            embedding
        ))

    conn.commit()
    cursor.close()
    print(f"Inserted {len(chunks)} rows for {filename}.")

# ==========================
# MAIN
# ==========================
def main():
    conn = psycopg2.connect(DB_URL)
    folder = "./uploads"  # put your files here

    if not os.path.exists(folder):
        print(f"Folder {folder} not found.")
        return

    for file in os.listdir(folder):
        filepath = os.path.join(folder, file)
        if os.path.isfile(filepath):
            process_file(filepath, conn)

    conn.close()

if __name__ == "__main__":
    main()
