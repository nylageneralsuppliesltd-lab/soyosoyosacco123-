#!/usr/bin/env python3
"""
SOYOSOYO SACCO CHATBOT + UPLOADER v14 – FERRARI EDITION (MERGED IMPROVEMENTS)
- Merged: My v13 RAG + Provided script's smart extraction (is_mostly_numeric, fitz PDFs, safe_float w/ regex)
- ENHANCED: Header detection in financials, numeric col picking, robust filtering
- FIXED: Better dirty data handling (e.g., "KES 1,000" → 1000)
- Chunking: 1200 chars + 300 overlap for max context
- Hybrid search: Vector + keyword, bilingual responses
- Ready to run: python3 app.py (install: pip install pymupdf)
- Performance: Efficient SQL batches, validation, logging
"""

import os
import re
import json
import glob
import base64
import psycopg
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import pandas as pd
import numpy as np
from openai import OpenAI
import warnings
import sys
import fitz  # PyMuPDF for PDF extraction

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

warnings.filterwarnings("ignore", message=r".*chunkSizeWarningLimit.*", category=UserWarning, module=r"openpyxl")

if not DATABASE_URL or not OPENAI_API_KEY:
    raise ValueError("Missing DATABASE_URL or OPENAI_API_KEY")

client = OpenAI(api_key=OPENAI_API_KEY)

# ===================== UTILITIES (MERGED) =====================
def safe_float(value):
    """Safely convert to float or return 0 (merged: handles dirty strings like 'KES 1,000')."""
    if pd.isna(value):
        return 0.0
    try:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            clean = re.sub(r"[^\d.\-]", "", value)  # Remove non-digits except . -
            return float(clean) if clean else 0.0
        return 0.0
    except (ValueError, TypeError):
        return 0.0

def is_mostly_numeric(series):
    """Return True if at least 50% of the column is numeric (from provided)."""
    try:
        return pd.to_numeric(series, errors="coerce").notna().mean() > 0.5
    except Exception:
        return False

# ===================== DATE PARSER =====================
MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
}

def parse_date_from_filename(filename: str) -> Optional[datetime]:
    text = filename.lower().replace('_', ' ').replace('-', ' ')
    m = re.search(r'\b(?:\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|'
                  r'january|february|march|april|may|june|july|august|september|october|november|december)'
                  r'\s+(\d{4})\b', text)
    if m:
        month_str, year = m.groups()
        month = MONTH_MAP.get(month_str[:3])
        if month:
            return datetime(int(year), month, 1)
    m = re.search(r'\b(\d{4})[._-](\d{2})\b', text)
    if m:
        year, month = m.groups()
        try:
            return datetime(int(year), int(month), 1)
        except:
            pass
    m = re.search(r'\bQ([1-4])\s*(\d{4})\b', text, re.IGNORECASE)
    if m:
        q, year = m.groups()
        month = {'1': 1, '2': 4, '3': 7, '4': 10}[q]
        return datetime(int(year), month, 1)
    return None

# ===================== CLASSIFIER =====================
def classify_and_date_file(file_path: str) -> Dict[str, Any]:
    filename = os.path.basename(file_path)
    lower = filename.lower()
    file_type = "sacco_document"

    if any(k in lower for k in ['financial', 'budget', 'income', 'expense', 'profit', 'balance']):
        file_type = "financial_report"
    elif any(k in lower for k in ['member', 'dividend', 'payout', 'share']):
        file_type = "member_dividend"
    elif any(k in lower for k in ['loan', 'lending']):
        file_type = "loan_document"
    elif any(k in lower for k in ['bylaw', 'policy']):
        file_type = "policy_document"

    return {
        "path": file_path,
        "filename": filename,
        "type": file_type,
        "date": parse_date_from_filename(filename),
        "is_monthly": parse_date_from_filename(filename) is not None
    }

# ===================== CORE =====================
def chunk_text(text: str, max_chunk_size: int = 1200, overlap: int = 300) -> List[str]:
    """1200 chars + 300 overlap → preserves names, dates, context"""
    words = text.split()
    chunks, current, length = [], [], 0
    for word in words:
        current.append(word)
        length += len(word) + 1
        if length >= max_chunk_size:
            chunk = " ".join(current)
            chunks.append(chunk)
            # Keep last ~300 chars
            current = current[-(overlap // 5):]  # ~5 chars per word
            length = sum(len(w) + 1 for w in current)
    if current:
        chunks.append(" ".join(current))
    return [c.strip() for c in chunks if len(c.strip()) > 100]  # filter tiny

def generate_embeddings(chunks: List[str]) -> List[List[float]]:
    if not chunks:
        return []
    try:
        resp = client.embeddings.create(input=chunks, model="text-embedding-ada-002")
        return [e.embedding for e in resp.data]
    except Exception as e:
        print(f"Embedding error: {e}")
        return [[] for _ in chunks]

def generate_summary_embedding(chunks: List[str]) -> List[float]:
    embs = generate_embeddings(chunks)
    valid = [e for e in embs if e and len(e) == 1536]
    return np.mean(valid, axis=0).tolist() if valid else []

def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    try:
        if ext in ['.xlsx', '.xls']:
            dfs = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            lines = [f"File: {os.path.basename(file_path)}"]
            for sheet, df in dfs.items():
                lines.append(f"\n--- {sheet} ---\n{df.to_string(index=False)}")
            return re.sub(r'\s+', ' ', "\n".join(lines))
        elif ext == '.pdf':
            # Merged: Use fitz for robust PDF extraction
            print(f"📄 Extracting text from: {os.path.basename(file_path)}")
            try:
                text = ""
                with fitz.open(file_path) as doc:
                    for page in doc:
                        text += page.get_text()
                return re.sub(r'\s+', ' ', text.strip())
            except Exception as e:
                print(f"⚠️ PDF extraction failed: {e}")
                return ""
        elif ext == '.csv':
            return re.sub(r'\s+', ' ', pd.read_csv(file_path).to_string(index=False))
        elif ext == '.txt':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return re.sub(r'\s+', ' ', f.read())
    except Exception as e:
        print(f"Text extraction failed: {e}")
    return ""

# ===================== STRUCTURED EXTRACTORS (ENHANCED MERGE) =====================
def extract_member_dividends(file_path: str, file_id: int, cur):
    ext = Path(file_path).suffix.lower()
    if ext not in {'.xlsx', '.xls', '.csv'}:
        return
    try:
        df = pd.read_excel(file_path, engine='openpyxl') if ext in {'.xlsx', '.xls'} else pd.read_csv(file_path)
        if df.empty:
            print(f"   Empty DataFrame - skipping")
            return
        df.columns = [str(c).strip().lower().replace(' ', '_').replace('#', 'num') for c in df.columns]
        print(f"📘 Extracting member dividends from: {os.path.basename(file_path)}")
        print(f"   Member columns: {list(df.columns)}")

        col_name = next((c for c in df.columns if 'name' in c or 'member' in c), None)  # Merged: Broader match
        col_id   = next((c for c in df.columns if any(x in c for x in ['member', 'id', 'num'])), None)
        col_shares = next((c for c in df.columns if any(x in c for x in ['share', 'contrib'])), None)
        col_div_candidates = [c for c in df.columns if any(x in c for x in ['dividend', 'paid', 'payout'])]
        col_div = None
        for c in col_div_candidates:
            if is_mostly_numeric(df[c]):  # Merged: Pick mostly numeric col
                col_div = c
                break
        col_qual = next((c for c in df.columns if any(x in c for x in ['qualif', 'status', 'remark', 'qualification'])), None)

        if not col_name or not col_div:
            print("⚠️ No suitable name/dividend columns found - skipping structured extraction")
            return

        payout_date = parse_date_from_filename(os.path.basename(file_path))
        if payout_date:
            payout_date = payout_date.date()

        inserted = 0
        skipped = 0
        for idx, row in df.iterrows():
            try:
                name = str(row[col_name]).strip()
                if not name or name.lower() in ['nan', 'none', '']:
                    skipped += 1
                    continue

                member_id = str(row[col_id]).strip() if col_id else None
                shares = round(safe_float(row[col_shares])) if col_shares else 0  # Merged safe_float
                dividends = round(safe_float(row[col_div]))  # Always apply
                if dividends == 0:  # Merged: Skip zero divs
                    skipped += 1
                    continue
                qualification = str(row[col_qual]).strip() if col_qual else None

                cur.execute("""
                    INSERT INTO member_dividends
                    (file_id, name, member_id, shares, dividends, qualification, payout_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    file_id, name, member_id, shares, dividends, qualification, payout_date
                ))
                inserted += 1
                if inserted <= 3:
                    print(f"   Member row {inserted}: {name} | Shares: {shares} | Div: {dividends} | Qual: {qualification[:50]}...")
            except Exception as row_e:
                print(f"   Skipped row {idx}: {row_e}")
                skipped += 1
                continue

        print(f"✅ Extracted/Inserted {inserted} valid member records (skipped {skipped})")
    except Exception as e:
        print(f"   Member extraction failed: {e}")

def extract_financial_lines(file_path: str, file_id: int, cur):
    ext = Path(file_path).suffix.lower()
    if ext not in {'.xlsx', '.xls', '.csv'}:
        return
    try:
        dfs = pd.read_excel(file_path, sheet_name=None, engine='openpyxl') if ext in {'.xlsx', '.xls'} else {'Sheet1': pd.read_csv(file_path)}
        if not dfs:
            print(f"   No sheets/DataFrame - skipping")
            return

        # Process each sheet
        total_inserted = 0
        for sheet_name, sheet_df in dfs.items():
            if sheet_df.empty:
                continue
            print(f"📊 Extracting financial lines from sheet '{sheet_name}': {os.path.basename(file_path)}")

            # Merged: Header detection (check if row 0 mostly strings)
            if sheet_df.iloc[0].apply(lambda x: isinstance(x, str)).mean() > 0.6:
                sheet_df.columns = sheet_df.iloc[0].astype(str).str.lower().str.strip().str.replace(" ", "_")
                sheet_df = sheet_df[1:].reset_index(drop=True)
            else:
                sheet_df.columns = [f"col_{i}" for i in range(sheet_df.shape[1])]

            print(f"   Financial sheet '{sheet_name}' columns: {list(sheet_df.columns)}")

            # Merged: Better col detection
            col_account = next((c for c in sheet_df.columns if any(x in c for x in ["account", "description", "name", "line"])), None)
            potential_amounts = [c for c in sheet_df.columns if any(x in c for x in ["amount", "total", "value", "balance"])]
            col_amount = None
            for c in potential_amounts:
                if is_mostly_numeric(sheet_df[c]):  # Pick mostly numeric
                    col_amount = c
                    break
            if not col_amount:
                # Fallback: Max variance numeric col
                numeric_cols = [c for c in sheet_df.columns if pd.api.types.is_numeric_dtype(sheet_df[c])]
                if numeric_cols:
                    col_amount = max(numeric_cols, key=lambda c: sheet_df[c].var() or 0)

            potential_types = [c for c in sheet_df.columns if any(k in c for k in ['type', 'category'])]
            col_type = potential_types[0] if potential_types else None

            potential_dates = [c for c in sheet_df.columns if 'date' in c]
            col_date = potential_dates[0] if potential_dates else None

            if not col_account or not col_amount:
                print(f"⚠️ No suitable account/amount columns in '{sheet_name}' - skipping sheet")
                continue

            print(f"   Using: Account={col_account}, Amount={col_amount}, Type={col_type}, Date={col_date}")

            inserted = 0
            skipped = 0
            for idx, row in sheet_df.iterrows():
                try:
                    account = str(row[col_account]).strip()
                    if not account or account.lower() in ['nan', 'none', '', 'total', 'grand total']:
                        skipped += 1
                        continue

                    amount = round(safe_float(row[col_amount]))  # Merged safe_float
                    if amount == 0:
                        skipped += 1
                        continue

                    line_type = str(row[col_type]).strip() if col_type and pd.notna(row[col_type]) else None
                    line_date = pd.to_datetime(row[col_date]).date() if col_date and pd.notna(row[col_date]) else None

                    cur.execute("""
                        INSERT INTO financial_report_lines
                        (file_id, account, line_type, amount, line_date)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (file_id, account, line_type, amount, line_date))
                    inserted += 1
                    if inserted <= 3:
                        print(f"   Financial row {inserted} ({sheet_name}): Account={account[:30]}..., Type={line_type}, Amount={amount}")
                except Exception as row_e:
                    print(f"   Skipped financial row {idx} ({sheet_name}): {row_e}")
                    skipped += 1
                    continue

            print(f"   Sheet '{sheet_name}': Inserted {inserted} rows (skipped {skipped})")
            total_inserted += inserted

        print(f"✅ Extracted/Inserted {total_inserted} valid financial records across sheets")
    except Exception as e:
        print(f"   Financial extraction failed: {e}")

# ===================== HYBRID SEARCH (UNCHANGED) =====================
def get_structured_context(question: str, cur) -> str:
    """Query structured tables for comprehensive data (e.g., full member lists)"""
    q_lower = question.lower()
    structured_ctx = ""

    # Member/Dividends queries
    if any(kw in q_lower for kw in ['list all', 'all names', 'members', 'dividends file', 'who is in', 'see in the file']):
        cur.execute("""
            SELECT DISTINCT ON (name) name, shares, dividends, qualification, payout_date
            FROM member_dividends md JOIN uploaded_files uf ON md.file_id = uf.id
            WHERE uf.processed = true
            ORDER BY name, payout_date DESC NULLS LAST
        """)
        members = cur.fetchall()
        if members:
            structured_ctx += "\n\nSTRUCTURED DATA: Full Member Dividends List\n"
            for m in members:
                structured_ctx += f"- {m[0]}: Shares={m[1]}, Dividends={m[2]}, Qual={m[3]}, Date={m[4]}\n"
            structured_ctx += f"(Total: {len(members)} members)"

    # Specific member check
    elif any(kw in q_lower for kw in ['is', 'there', 'ngari', 'chai', 'jeff']):
        name_match = re.search(r'([A-Z][a-z]+ [A-Z][a-z]+)', question)
        if name_match:
            name = name_match.group(1)
            cur.execute("""
                SELECT name, shares, dividends, qualification, payout_date
                FROM member_dividends md JOIN uploaded_files uf ON md.file_id = uf.id
                WHERE uf.processed = true AND name ILIKE %s
                ORDER BY payout_date DESC LIMIT 5
            """, (f"%{name}%",))
            members = cur.fetchall()
            if members:
                structured_ctx += "\n\nSTRUCTURED DATA: Matching Members\n"
                for m in members:
                    structured_ctx += f"- {m[0]}: Shares={m[1]}, Dividends={m[2]}, Qual={m[3]}, Date={m[4]}\n"

    # Financial/audit queries
    if any(kw in q_lower for kw in ['audit', 'financial', 'tools']):
        cur.execute("""
            SELECT account, line_type, amount, line_date
            FROM financial_report_lines frl JOIN uploaded_files uf ON frl.file_id = uf.id
            WHERE uf.processed = true AND account IS NOT NULL AND amount != 0
            ORDER BY line_date DESC, amount DESC LIMIT 10
        """)
        lines = cur.fetchall()
        if lines:
            structured_ctx += "\n\nSTRUCTURED DATA: Recent Financial Lines\n"
            for l in lines:
                structured_ctx += f"- {l[0]} ({l[1]}): KES {l[2]} on {l[3]}\n"

    # Join/how to join
    if 'join' in q_lower:
        structured_ctx += "\n\nSTRUCTURED DATA: Membership Info\nTo join SOYOSOYO SACCO, contact the secretary with ID, shares contribution, and application form. Policies in uploaded bylaws."

    return structured_ctx

def ask(question: str, cur, top_k: int = 10) -> str:
    # Get structured context first
    structured_ctx = get_structured_context(question, cur)

    # Embed question for RAG
    try:
        emb = client.embeddings.create(input=question, model="text-embedding-ada-002").data[0].embedding
        vec = '[' + ','.join(map(str, emb)) + ']'
        kws = [f"%{w}%" for w in re.findall(r'\b\w+\b', question.lower()) if len(w)>2]

        sql = """
        WITH q AS (SELECT %s::vector AS vec),
        vec_res AS (
            SELECT dc.chunk_text, uf.original_name, 1 - (dc.embedding <=> (SELECT vec FROM q)) AS sim
            FROM document_chunks dc JOIN uploaded_files uf ON dc.file_id = uf.id
            WHERE uf.processed = true
            ORDER BY dc.embedding <=> (SELECT vec FROM q) LIMIT %s
        ),
        kw_res AS (
            SELECT dc.chunk_text, uf.original_name, 0.95 AS sim
            FROM document_chunks dc JOIN uploaded_files uf ON dc.file_id = uf.id
            WHERE uf.processed = true AND dc.chunk_text ILIKE ANY(%s)
        )
        (SELECT chunk_text, original_name, sim FROM vec_res WHERE sim > 0.5)
        UNION ALL (SELECT chunk_text, original_name, sim FROM kw_res)
        ORDER BY sim DESC LIMIT %s;
        """
        cur.execute(sql, (vec, top_k*2, kws, top_k))
        results = cur.fetchall()
        if not results:
            rag_ctx = "No relevant text chunks found."
        else:
            rag_ctx = "\n\n".join([f"[{r[2]:.3f}] {r[1]}:\n{r[0]}" for r in results])

        full_context = f"{rag_ctx}{structured_ctx}"

        prompt = f"""You are a SOYOSOYO SACCO assistant. Use the context and structured data below to answer comprehensively.

Context (RAG):
{full_context}

Question: {question}
Answer in Swahili or English, comprehensive and detailed, list all relevant info:"""

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"Query error: {e}")
        return "Sorry, there was an error processing your question."

# ===================== MAIN =====================
def main():
    print("SOYOSOYO SACCO CHATBOT + UPLOADER v14 – FERRARI EDITION (MERGED IMPROVEMENTS)")

    conn = psycopg.connect(DATABASE_URL)
    cur = conn.cursor()

    # STEP 1: ENSURE SCHEMA
    print("Dropping existing tables for clean schema (data loss expected)...")
    cur.execute("DROP TABLE IF EXISTS member_dividends CASCADE;")
    cur.execute("DROP TABLE IF EXISTS financial_report_lines CASCADE;")
    cur.execute("DROP TABLE IF EXISTS document_chunks CASCADE;")
    cur.execute("DROP TABLE IF EXISTS uploaded_files CASCADE;")
    print("Tables dropped. Recreating schema...")

    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL UNIQUE,
            mime_type TEXT,
            size BIGINT,
            extracted_text TEXT,
            metadata JSONB,
            content TEXT,  -- base64 encoded
            processed BOOLEAN DEFAULT FALSE,
            uploaded_at TIMESTAMP DEFAULT NOW(),
            embedding VECTOR(1536)
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id SERIAL PRIMARY KEY,
            file_id INTEGER REFERENCES uploaded_files(id) ON DELETE CASCADE,
            chunk_text TEXT NOT NULL,
            chunk_index INTEGER,
            embedding VECTOR(1536)
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS member_dividends (
            id SERIAL PRIMARY KEY,
            file_id INTEGER REFERENCES uploaded_files(id) ON DELETE CASCADE,
            name TEXT,
            member_id TEXT,
            shares INTEGER DEFAULT 0,
            dividends DECIMAL(10,2) DEFAULT 0,
            qualification TEXT,
            payout_date DATE
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS financial_report_lines (
            id SERIAL PRIMARY KEY,
            file_id INTEGER REFERENCES uploaded_files(id) ON DELETE CASCADE,
            account TEXT,
            line_type TEXT,
            amount DECIMAL(15,2) DEFAULT 0,
            line_date DATE
        );
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_files_processed ON uploaded_files (processed);
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        CREATE INDEX IF NOT EXISTS idx_chunks_file ON document_chunks (file_id);
        CREATE INDEX IF NOT EXISTS idx_members_name ON member_dividends (name);
        CREATE INDEX IF NOT EXISTS idx_financial_account ON financial_report_lines (account);
    """)
    conn.commit()
    print("✅ Database schema verified and ready.")

    # STEP 2: UPLOAD LOGIC
    files = []
    for d in SCAN_DIRECTORIES:
        if not os.path.exists(d):
            continue
        for e in SUPPORTED_EXTENSIONS:
            files.extend(glob.glob(f"{d}**/*{e}", recursive=True))

    if not files:
        print("No files found.")
    else:
        classified = [classify_and_date_file(f) for f in files]
        monthly_files = [f for f in classified if f["is_monthly"]]
        static_files = [f for f in classified if not f["is_monthly"]]

        print(f"Found {len(monthly_files)} monthly, {len(static_files)} static files")

        # Monthly cleanup: Keep latest by type
        latest_by_type = {}
        for mf in monthly_files:
            key = mf["type"]
            if key not in latest_by_type or mf["date"] > latest_by_type[key]["date"]:
                latest_by_type[key] = mf

        old_names = [mf["filename"] for mf in monthly_files
                     if latest_by_type.get(mf["type"])["path"] != mf["path"]]

        if old_names:
            print(f"Deleting {len(old_names)} old monthly files from DB...")
            cur.execute("DELETE FROM document_chunks WHERE file_id IN (SELECT id FROM uploaded_files WHERE original_name = ANY(%s))", (old_names,))
            cur.execute("DELETE FROM uploaded_files WHERE original_name = ANY(%s) RETURNING original_name", (old_names,))
            for (name,) in cur.fetchall():
                print(f"   Removed: {name}")

        # Check existing processed files
        cur.execute("SELECT original_name FROM uploaded_files WHERE processed = true")
        existing = {row[0] for row in cur.fetchall()}

        to_upload = []
        for mf in latest_by_type.values():
            if mf["filename"] not in existing:
                to_upload.append(mf["path"])
        for sf in static_files:
            if sf["filename"] not in existing:
                to_upload.append(sf["path"])

        print(f"Uploading {len(to_upload)} new files...")

        for path in to_upload:
            print(f"\nUploading: {os.path.basename(path)}")
            text = extract_text(path)
            if not text.strip():
                print("   Empty text — skipping")
                continue

            chunks = chunk_text(text)
            if not chunks:
                print("   No chunks — skipping")
                continue

            chunk_embs = generate_embeddings(chunks)
            summary_emb = generate_summary_embedding(chunks)

            with open(path, 'rb') as f:
                content = base64.b64encode(f.read()).decode()

            file_info = classify_and_date_file(path)
            mime = SUPPORTED_MIME.get(Path(path).suffix.lower(), 'application/octet-stream')

            try:
                # INSERT FILE (processed = FALSE initially)
                cur.execute("""
                    INSERT INTO uploaded_files
                    (filename, original_name, mime_type, size, extracted_text, metadata, content, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    file_info["filename"], file_info["filename"], mime,
                    os.path.getsize(path),
                    text[:15000],  # Merged: Trim like provided
                    json.dumps({"file_type": file_info["type"], "upload_method": "v14"}),
                    content, summary_emb
                ))
                file_id = cur.fetchone()[0]

                # INSERT CHUNKS (only valid 1536-dim)
                valid_chunks = 0
                for i, (chunk, emb) in enumerate(zip(chunks, chunk_embs)):
                    if emb and len(emb) == 1536:
                        cur.execute("""
                            INSERT INTO document_chunks (file_id, chunk_text, chunk_index, embedding)
                            VALUES (%s, %s, %s, %s)
                        """, (file_id, chunk, i, emb))
                        valid_chunks += 1

                if valid_chunks == 0:
                    raise ValueError("No valid embeddings")

                # STRUCTURED DATA
                if file_info["type"] == "member_dividend":
                    extract_member_dividends(path, file_id, cur)
                elif file_info["type"] == "financial_report":
                    extract_financial_lines(path, file_id, cur)

                # MARK PROCESSED
                cur.execute("UPDATE uploaded_files SET processed = TRUE WHERE id = %s", (file_id,))
                print(f"   Success: {valid_chunks} chunks")

                conn.commit()  # Commit per file for safety

            except Exception as e:
                print(f"   Failed: {e}")
                conn.rollback()
                continue

        # Disk cleanup
        if DELETE_OLD_FROM_DISK and old_names:
            for mf in monthly_files:
                if mf["filename"] in old_names:
                    try:
                        os.remove(mf["path"])
                        print(f"   Deleted from disk: {mf['filename']}")
                    except:
                        pass

        # Merged: Enhanced summary (counts + bad rows)
        print("\n📊 DATABASE SUMMARY")
        cur.execute("""
            SELECT
                (SELECT COUNT(*) FROM uploaded_files WHERE processed = true) AS total_files,
                (SELECT COALESCE(SUM(LENGTH(extracted_text)),0) FROM uploaded_files) AS total_characters,
                ROUND(
                    (SELECT COALESCE(SUM(LENGTH(extracted_text)),0) / NULLIF(COUNT(*),0) FROM uploaded_files WHERE processed = true),
                    2
                ) AS avg_chars_per_file
        """)
        summary = cur.fetchone()
        print(f"Total Processed Files: {summary[0]}")
        print(f"Total Characters: {summary[1]}")
        print(f"Average per File: {summary[2]}")

        bad_financials = cur.execute(
            "SELECT COUNT(*) FROM financial_report_lines WHERE account IS NULL OR amount = 0"
        ).scalar()
        bad_dividends = cur.execute(
            "SELECT COUNT(*) FROM member_dividends WHERE dividends = 0 OR name IS NULL"
        ).scalar()
        print(f"⚠️ Incomplete Financial Lines: {bad_financials}")
        print(f"⚠️ Invalid Dividend Entries: {bad_dividends}")

        print("\nUPLOAD COMPLETE")

    # STEP 3: INTERACTIVE CHATBOT (SKIP IF NON-INTERACTIVE ENV)
    if sys.stdin.isatty():  # Check if interactive (not in Render/CI)
        print("\n💬 CHATBOT READY. Type 'quit' to exit.")
        while True:
            try:
                q = input("\nYou: ").strip()
                if q.lower() in {'quit','exit'}: break
                print("Bot:", ask(q, cur))
            except EOFError:
                print("\nExiting chatbot (non-interactive mode).")
                break
    else:
        print("\nNon-interactive mode (e.g., deployment) - skipping chatbot loop.")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
