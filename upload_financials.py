#!/usr/bin/env python3
"""
UNIVERSAL DOCUMENT UPLOADER FOR SOYOSOYO SACCO
Uploads Excel files, PDF files, and other documents to Neon PostgreSQL database
Supports multiple directories and automatic file type detection
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
    "reports/", 
    "data/",
    "documents/",
    "uploads/",
      "files/"
]

# Supported file types
SUPPORTED_EXTENSIONS = {
    # Excel files
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    # PDF files  
    '.pdf': 'application/pdf',
    # Text files
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
    
    # Reports
    elif any(x in file_path for x in ['report', 'analysis', 'summary']):
        return "report"
    elif any(x in filename for x in ['report', 'analysis', 'summary']):
        return "report"
    
    # Loan data
    elif any(x in file_path for x in ['loan', 'credit', 'debt']):
        return "loan_data"
    elif any(x in filename for x in ['loan', 'credit', 'debt']):
        return "loan_data"
    
    # Default to general data
    else:
        return "general_data"

def extract_pdf_text(file_path):
    """Extract text from PDF file using simple text extraction"""
    try:
        # Try to read PDF as text (for text-based PDFs)
        with open(file_path, 'rb') as file:
            content = file.read()
            # Simple text extraction for basic PDFs
            text = content.decode('utf-8', errors='ignore')
            
            # Remove null characters and other problematic characters for PostgreSQL
            text = text.replace('\x00', '').replace('\x01', '').replace('\x02', '')
            text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\r\t')
            
            # Clean up the text
            lines = text.split('\n')
            clean_lines = []
            for line in lines:
                line = line.strip()
                if line and len(line) > 3:  # Skip very short lines
                    # Additional cleaning for database safety
                    line = line.encode('utf-8', errors='ignore').decode('utf-8')
                    if line:  # Only add if still has content after cleaning
                        clean_lines.append(line)
            
            if clean_lines:
                extracted_text = '\n'.join(clean_lines)
                # Limit text length to prevent database issues
                if len(extracted_text) > 50000:
                    extracted_text = extracted_text[:50000] + "\n\n[Content truncated for database storage]"
                return extracted_text
            else:
                return f"PDF document: {os.path.basename(file_path)} (binary content - text extraction not available on this platform)"
                
    except Exception as e:
        return f"PDF document: {os.path.basename(file_path)} (text extraction failed: {str(e)})"

def excel_to_readable_text(df_dict, file_type, filename):
    """Convert Excel sheets to readable text format for AI chatbot"""
    
    # Create header based on file type
    headers = {
        "financial": "=== SOYOSOYO SACCO FINANCIAL DATA ===",
        "member_data": "=== SOYOSOYO SACCO MEMBER INFORMATION ===", 
        "report": "=== SOYOSOYO SACCO REPORT ===",
        "loan_data": "=== SOYOSOYO SACCO LOAN DATA ===",
        "general_data": "=== SOYOSOYO SACCO DATA ===",
    }
    
    readable_text = f"{headers.get(file_type, '=== SOYOSOYO SACCO DATA ===')}\n"
    readable_text += f"File: {filename}\n"
    readable_text += f"Type: {file_type.replace('_', ' ').title()}\n"
    readable_text += f"Upload Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    
    for sheet_name, df in df_dict.items():
        readable_text += f"SHEET: {sheet_name}\n"
        readable_text += "=" * 50 + "\n\n"
        
        # Convert DataFrame to readable format
        if not df.empty:
            # Handle different data types and format properly
            for index, row in df.iterrows():
                row_text = ""
                for col, value in row.items():
                    if pd.notna(value):  # Skip empty cells
                        # Format currency/numbers nicely
                        if isinstance(value, (int, float)) and abs(value) > 1000:
                            row_text += f"{col}: {value:,.2f} | "
                        else:
                            row_text += f"{col}: {value} | "
                
                if row_text.strip():
                    readable_text += row_text.rstrip(" | ") + "\n"
            
            readable_text += "\n"
            
            # Add summary statistics if numeric data exists
            numeric_cols = df.select_dtypes(include=['number']).columns
            if len(numeric_cols) > 0:
                readable_text += "SUMMARY STATISTICS:\n"
                for col in numeric_cols:
                    if df[col].notna().any():  # Only if column has data
                        total = df[col].sum()
                        avg = df[col].mean()
                        if abs(total) > 0.01:  # Only show meaningful totals
                            readable_text += f"Total {col}: {total:,.2f}\n"
                        if abs(avg) > 0.01:  # Only show meaningful averages
                            readable_text += f"Average {col}: {avg:,.2f}\n"
                readable_text += "\n"
        
        readable_text += "\n" + "=" * 50 + "\n\n"
    
    return readable_text

def find_supported_files():
    """Find all supported files in the specified directories"""
    supported_files = []
    
    # Scan each directory
    for directory in SCAN_DIRECTORIES:
        if os.path.exists(directory):
            # Find all supported files
            for ext in SUPPORTED_EXTENSIONS.keys():
                patterns = [
                    f"{directory}*{ext}",
                    f"{directory}**/*{ext}"
                ]
                
                for pattern in patterns:
                    files = glob.glob(pattern, recursive=True)
                    supported_files.extend(files)
    
    # Also check root directory
    for ext in SUPPORTED_EXTENSIONS.keys():
        files = glob.glob(f"*{ext}")
        supported_files.extend(files)
    
    # Remove duplicates and return
    return list(set(supported_files))

def process_file(file_path):
    """Process a single file and return data for database insertion"""
    try:
        print(f"📖 Processing: {file_path}")
        
        # Get file extension and classify
        file_ext = Path(file_path).suffix.lower()
        file_type = classify_file_type(file_path)
        filename = os.path.basename(file_path)
        
        print(f"   🏷️ Type: {file_type} ({file_ext})")
        
        # Process based on file type
        if file_ext in ['.xlsx', '.xls']:
            # Excel processing
            df_dict = pd.read_excel(file_path, sheet_name=None, engine='openpyxl')
            print(f"   📊 Sheets: {list(df_dict.keys())}")
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
            
        elif file_ext == '.pdf':
            # PDF processing
            extracted_text = extract_pdf_text(file_path)
            print(f"   📄 PDF text extracted: {len(extracted_text)} characters")
            
        elif file_ext == '.txt':
            # Text file processing
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            extracted_text = f"=== SOYOSOYO SACCO TEXT DOCUMENT ===\nFile: {filename}\nType: {file_type.replace('_', ' ').title()}\n\n{content}"
            print(f"   📝 Text file processed: {len(content)} characters")
            
        elif file_ext == '.csv':
            # CSV processing  
            df = pd.read_csv(file_path)
            df_dict = {'Sheet1': df}  # Treat CSV as single sheet
            extracted_text = excel_to_readable_text(df_dict, file_type, filename)
            print(f"   📋 CSV processed: {len(df)} rows")
            
        else:
            print(f"   ⚠️ Unsupported file type: {file_ext}")
            return None
        
        # Read file as binary for content storage
        with open(file_path, 'rb') as file:
            file_content = base64.b64encode(file.read()).decode('utf-8')
        
        # Get file size and MIME type
        file_size = os.path.getsize(file_path)
        mime_type = SUPPORTED_EXTENSIONS.get(file_ext, 'application/octet-stream')
        
        # Prepare metadata
        metadata = {
            "file_type": file_type,
            "file_extension": file_ext,
            "analysis": f"{file_type.replace('_', ' ').title()} document processed automatically",
            "upload_method": "universal_uploader",
            "source_path": file_path,
            "processed_date": datetime.now().isoformat()
        }
        
        # Add specific metadata for Excel files
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
    print("🚀 Starting Universal Document Upload for SOYOSOYO SACCO...")
    print("📁 Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Text (.txt), CSV (.csv)")
    
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL environment variable not set")
        return
    
    # Find all supported files
    supported_files = find_supported_files()
    
    if not supported_files:
        print("ℹ️ No supported files found in scanned directories")
        return
    
    print(f"📂 Found {len(supported_files)} supported files:")
    for file in supported_files:
        file_ext = Path(file).suffix.lower()
        print(f"   • {file} ({file_ext})")
    
    try:
        # Connect to Neon DB
        print("\n🔗 Connecting to Neon PostgreSQL...")
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cur = conn.cursor()
        
        # First, handle monthly file replacements (only for dynamic files)
        print("🔄 Checking for monthly file updates...")
        
        # Delete old financials files (to be replaced with new ones)
        financials_patterns = ['%FINANCIAL%', '%financial%', '%FINANCE%', '%finance%', '%budget%', '%BUDGET%']
        for pattern in financials_patterns:
            cur.execute("DELETE FROM uploaded_files WHERE (filename LIKE %s OR original_name LIKE %s)", (pattern, pattern))
        
        # Delete old member files (to be replaced with new ones) 
        member_patterns = ['%member%', '%MEMBER%', '%dividend%', '%DIVIDEND%', '%qualification%', '%QUALIFICATION%']
        for pattern in member_patterns:
            cur.execute("DELETE FROM uploaded_files WHERE (filename LIKE %s OR original_name LIKE %s)", (pattern, pattern))
            
        print("✅ Old monthly files cleaned up")
        
        # Process each file
        successful_uploads = 0
        
        for file_path in supported_files:
            file_data = process_file(file_path)
            
            if file_data:
                try:
                    # For non-monthly files, still check for exact filename duplicates
                    is_monthly_file = any(keyword in file_data["filename"].lower() 
                                        for keyword in ['financial', 'finance', 'budget', 'member', 'dividend', 'qualification'])
                    
                    if not is_monthly_file:
                        cur.execute(
                            "DELETE FROM uploaded_files WHERE filename = %s", 
                            (file_data["filename"],)
                        )
                    
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
        
        # Commit all changes
        conn.commit()
        
        print(f"\n🎉 UPLOAD COMPLETE!")
        print(f"   📊 Files found: {len(supported_files)}")
        print(f"   ✅ Successfully uploaded: {successful_uploads}")
        print(f"   ❌ Failed uploads: {len(supported_files) - successful_uploads}")
        
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
