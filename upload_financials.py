#!/usr/bin/env python3
"""
SMART DOCUMENT UPLOADER FOR SOYOSOYO SACCO
Only processes NEW files, skips already processed ones to save tokens
Includes proper PDF extraction for loan policies and bylaws
"""

import pandas as pd
import psycopg2
import os
import base64
import json
import glob
from datetime import datetime
from pathlib import Path

# Use the DATABASE_URL from Render environment
DATABASE_URL = os.getenv("DATABASE_URL")

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

def classify_file_type(file_path):
    """Classify file based on path and filename"""
    file_path = file_path.lower()
    filename = os.path.basename(file_path).lower()
    
    # Financial files
    if any(x in file_path for x in ['financial', 'finance', 'budget', 'money', 'cash']):
        return "financial"
    elif any(x in filename for x in ['financial', 'finance', 'budget', 'money', 'cash']):
        return "financial"
    
    # Member data
    elif any(x in file_path for x in ['member', 'customer', 'client', 'user']):
        return "member_data"
    elif any(x in filename for x in ['member', 'customer', 'client', 'user']):
        return "member_data"
    
    # Policy and bylaws
    elif any(x in file_path for x in ['policy', 'bylaw', 'by-law', 'constitution', 'regulation']):
        return "policy_document"
    elif any(x in filename for x in ['policy', 'bylaw', 'by-law', 'constitution', 'regulation']):
        return "policy_document"
    
    # Loan documents
    elif any(x in file_path for x in ['loan', 'credit', 'debt']):
        return "loan_data"
    elif any(x in filename for x in ['loan', 'credit', 'debt']):
        return "loan_data"
    
    # Reports
    elif any(x in file_path for x in ['report', 'analysis', 'summary']):
        return "report"
    elif any(x in filename for x in ['report', 'analysis', 'summary']):
        return "report"
    
    # Default to general data
    else:
        return "general_data"

def get_existing_files(cur):
    """Get list of files already processed in database"""
    cur.execute("""
        SELECT filename, original_name, processed 
        FROM uploaded_files 
        WHERE processed = true
    """)
    existing = {}
    for row in cur.fetchall():
        filename, original_name, processed = row
        existing[filename] = True
        existing[original_name] = True
    return existing

def is_monthly_file(filename):
    """Check if file should be updated monthly"""
    filename_lower = filename.lower()
    monthly_keywords = ['financial', 'finance', 'budget', 'member', 'dividend', 'qualification']
    return any(keyword in filename_lower for keyword in monthly_keywords)

def extract_pdf_text(file_path):
    """Extract text from PDF file with proper PDF parsing"""
    filename = os.path.basename(file_path)
    
    # Method 1: Try PyPDF2 (install with: pip install PyPDF2)
    try:
        import PyPDF2
        print(f"   📄 Using PyPDF2 for: {filename}")
        
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            extracted_text = ""
            
            print(f"   📊 PDF has {len(pdf_reader.pages)} pages")
            
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text and len(page_text.strip()) > 10:
                        extracted_text += f"\n=== PAGE {page_num + 1} ===\n{page_text}\n"
                except Exception as e:
                    print(f"   ⚠️ Error extracting page {page_num + 1}: {e}")
            
            if extracted_text and len(extracted_text.strip()) > 50:
                # Clean up the text
                lines = extracted_text.split('\n')
                clean_lines = []
                
                for line in lines:
                    line = line.strip()
                    # Skip very short or empty lines
                    if len(line) > 3:
                        # Remove problematic characters for PostgreSQL
                        line = line.replace('\x00', '').replace('\x01', '').replace('\x02', '')
                        line = ''.join(char for char in line if ord(char) >= 32 or char in '\n\r\t')
                        if line:
                            clean_lines.append(line)
                
                final_text = '\n'.join(clean_lines)
                
                # Add SACCO context header
                header = f"=== SOYOSOYO SACCO DOCUMENT ===\nFile: {filename}\nType: Policy/Bylaws Document\nExtracted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
                final_text = header + final_text
                
                # Limit length for database
                if len(final_text) > 50000:
                    final_text = final_text[:50000] + "\n\n[Document truncated for database storage]"
                
                print(f"   ✅ Successfully extracted {len(final_text)} characters")
                return final_text
            else:
                print(f"   ⚠️ No readable text found in PDF")
                return f"PDF Document: {filename}\nNote: This appears to be a scanned document or image-based PDF. Text extraction was not successful."
                
    except ImportError:
        print(f"   ⚠️ PyPDF2 not available, trying alternative method...")
        
    # Method 2: Try pdfplumber (install with: pip install pdfplumber)
    try:
        import pdfplumber
        print(f"   📄 Using pdfplumber for: {filename}")
        
        extracted_text = ""
        
        with pdfplumber.open(file_path) as pdf:
            print(f"   📊 PDF has {len(pdf.pages)} pages")
            
            for page_num, page in enumerate(pdf.pages):
                try:
                    page_text = page.extract_text()
                    if page_text and len(page_text.strip()) > 10:
                        extracted_text += f"\n=== PAGE {page_num + 1} ===\n{page_text}\n"
                except Exception as e:
                    print(f"   ⚠️ Error extracting page {page_num + 1}: {e}")
        
        if extracted_text and len(extracted_text.strip()) > 50:
            # Clean up similar to PyPDF2 method above
            lines = extracted_text.split('\n')
            clean_lines = [line.strip() for line in lines if len(line.strip()) > 3]
            final_text = '\n'.join(clean_lines)
            
            header = f"=== SOYOSOYO SACCO DOCUMENT ===\nFile: {filename}\nType: Policy/Bylaws Document\nExtracted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            final_text = header + final_text
            
            if len(final_text) > 50000:
                final_text = final_text[:50000] + "\n\n[Document truncated for database storage]"
            
            print(f"   ✅ Successfully extracted {len(final_text)} characters")
            return final_text
            
    except ImportError:
        print(f"   ⚠️ pdfplumber not available, using fallback...")
    
    # Method 3: Fallback for deployment environments without PDF libraries
    try:
        # This is a basic fallback - won't work well but provides something
        print(f"   📄 Using basic fallback for: {filename}")
        
        with open(file_path, 'rb') as file:
            content = file.read()
            
        # Try to find any readable text patterns
        content_str = content.decode('utf-8', errors='ignore')
        
        # Look for common PDF text markers and try to extract
        lines = content_str.split('\n')
        readable_lines = []
        
        for line in lines:
            line = line.strip()
            # Only keep lines that look like readable text
            if (len(line) > 10 and 
                any(char.isalpha() for char in line) and
                not line.startswith('%') and  # Skip PDF metadata
                'obj' not in line.lower() and
                'endobj' not in line.lower()):
                readable_lines.append(line)
        
        if readable_lines:
            extracted_text = '\n'.join(readable_lines[:100])  # Limit to first 100 lines
            header = f"=== SOYOSOYO SACCO DOCUMENT ===\nFile: {filename}\nType: Policy/Bylaws Document\nNote: Basic extraction - may have formatting issues\n\n"
            return header + extracted_text
        
    except Exception as e:
        print(f"   ❌ All extraction methods failed: {e}")
    
    # Final fallback
    return f"""=== SOYOSOYO SACCO DOCUMENT ===
File: {filename}
Type: Policy/Bylaws Document
Status: Text extraction not available

This appears to be a PDF document containing SOYOSOYO SACCO policies or bylaws. 
The document could not be processed for text extraction on this platform.

For best results, consider:
1. Converting the PDF to a text file (.txt)
2. Saving as a Word document (.docx)
3. Manual entry of key policy points

Document uploaded: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""

def excel_to_readable_text(df_dict, file_type, filename):
    """Convert Excel sheets to readable text format for AI chatbot"""
    headers = {
        "financial": "=== SOYOSOYO SACCO FINANCIAL DATA ===",
        "member_data": "=== SOYOSOYO SACCO MEMBER INFORMATION ===", 
        "report": "=== SOYOSOYO SACCO REPORT ===",
        "loan_data": "=== SOYOSOYO SACCO LOAN DATA ===",
        "policy_document": "=== SOYOSOYO SACCO POLICY DOCUMENT ===",
        "general_data": "=== SOYOSOYO SACCO DATA ===",
    }
    
    readable_text = f"{headers.get(file_type, '=== SOYOSOYO SACCO DATA ===')}\n"
    readable_text += f"File: {filename}\n"
    readable_text += f"Type: {file_type.replace('_', ' ').title()}\n"
    readable_text += f"Upload Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    
    for sheet_name, df in df_dict.items():
        readable_text += f"SHEET: {sheet_name}\n"
        readable_text += "=" * 50 + "\n\n"
        
        if not df.empty:
            for index, row in df.iterrows():
                row_text = ""
                for col, value in row.items():
                    if pd.notna(value):
                        if isinstance(value, (int, float)) and abs(value) > 1000:
                            row_text += f"{col}: {value:,.2f} | "
                        else:
                            row_text += f"{col}: {value} | "
                
                if row_text.strip():
                    readable_text += row_text.rstrip(" | ") + "\n"
            
            readable_text += "\n"
            
            numeric_cols = df.select_dtypes(include=['number']).columns
            if len(numeric_cols) > 0:
                readable_text += "SUMMARY STATISTICS:\n"
                for col in numeric_cols:
                    if df[col].notna().any():
                        total = df[col].sum()
                        avg = df[col].mean()
                        if abs(total) > 0.01:
                            readable_text += f"Total {col}: {total:,.2f}\n"
                        if abs(avg) > 0.01:
                            readable_text += f"Average {col}: {avg:,.2f}\n"
                readable_text += "\n"
        
        readable_text += "\n" + "=" * 50 + "\n\n"
    
    return readable_text

def find_supported_files():
    """Find all supported files in the specified directories"""
    supported_files = []
    
    for directory in SCAN_DIRECTORIES:
        if os.path.exists(directory):
            for ext in SUPPORTED_EXTENSIONS.keys():
                patterns = [
                    f"{directory}*{ext}",
                    f"{directory}**/*{ext}"
                ]
                
                for pattern in patterns:
                    files = glob.glob(pattern, recursive=True)
                    supported_files.extend(files)
    
    for ext in SUPPORTED_EXTENSIONS.keys():
        files = glob.glob(f"*{ext}")
        supported_files.extend(files)
    
    return list(set(supported_files))

def process_file(file_path):
    """Process a single file and return data for database insertion"""
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
        
        return {
            "filename": filename,
            "original_name": filename,
            "mime_type": mime_type,
            "size": file_size,
            "extracted_text": extracted_text,
            "metadata": json.dumps(metadata),
            "content": file_content,
            "file_type": file_type
        }
        
    except Exception as e:
        print(f"   ❌ Error processing {file_path}: {e}")
        return None

def main():
    print("🚀 Starting SMART Document Upload for SOYOSOYO SACCO...")
    print("💡 Only processes NEW files to save OpenAI tokens!")
    print("📄 Enhanced PDF extraction for loan policies and bylaws!")
    
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL environment variable not set")
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
        
        # Only delete monthly files that need replacement
        print("🔄 Cleaning up monthly files that need updates...")
        monthly_patterns = ['%financial%', '%finance%', '%budget%', '%member%', '%dividend%', '%qualification%']
        deleted_count = 0
        for pattern in monthly_patterns:
            cur.execute("DELETE FROM uploaded_files WHERE (filename ILIKE %s OR original_name ILIKE %s)", (pattern, pattern))
            deleted_count += cur.rowcount
        
        print(f"✅ {deleted_count} monthly files cleaned up")
        
        # Process files intelligently
        new_files = 0
        skipped_files = 0
        successful_uploads = 0
        
        for file_path in supported_files:
            filename = os.path.basename(file_path)
            
            # Skip if already processed (unless it's a monthly file)
            if filename in existing_files and not is_monthly_file(filename):
                print(f"⏭️ Skipping (already processed): {filename}")
                skipped_files += 1
                continue
            
            print(f"🆕 Processing new/updated file: {filename}")
            new_files += 1
            
            file_data = process_file(file_path)
            
            if file_data:
                try:
                    # Insert new record
                    cur.execute("""
                        INSERT INTO uploaded_files (
                            filename, 
                            original_name, 
                            mime_type, 
                            size, 
                            extracted_text, 
                            metadata, 
                            content,
                            processed
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        file_data["filename"],
                        file_data["original_name"],
                        file_data["mime_type"],
                        file_data["size"],
                        file_data["extracted_text"],
                        file_data["metadata"],
                        file_data["content"],
                        True  # Mark as processed
                    ))
                    
                    successful_uploads += 1
                    print(f"   ✅ Uploaded: {file_data['filename']}")
                    
                except psycopg2.Error as e:
                    print(f"   ❌ Database error for {file_path}: {e}")
        
        conn.commit()
        
        print(f"\n🎉 SMART UPLOAD COMPLETE!")
        print(f"   📊 Total files found: {len(supported_files)}")
        print(f"   🆕 New/updated files processed: {new_files}")
        print(f"   ⏭️ Already processed (skipped): {skipped_files}")
        print(f"   ✅ Successfully uploaded: {successful_uploads}")
        print(f"   💰 Token savings: MASSIVE! (No re-processing of existing files)")
        
        # Show breakdown by file type
        if successful_uploads > 0:
            print(f"\n📋 BREAKDOWN BY TYPE:")
            type_counts = {}
            for file_path in supported_files:
                file_type = classify_file_type(file_path)
                type_counts[file_type] = type_counts.get(file_type, 0) + 1
            
            for file_type, count in type_counts.items():
                print(f"   {file_type.replace('_', ' ').title()}: {count} files")
        
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
