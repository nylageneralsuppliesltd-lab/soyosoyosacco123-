#!/usr/bin/env python3
"""
SOYOSOYO SACCO Financials Upload Script
Uploads Excel financial files to Neon PostgreSQL database via Render
"""

import pandas as pd
import psycopg2
import os
import base64
import json
from datetime import datetime

# Use the DATABASE_URL from Render environment
DATABASE_URL = os.getenv("DATABASE_URL")

# Path to Excel file (make sure it's in your repo or uploaded)
FILE_PATH = "financials/21-SEP-2025 SOYOSOYO FINANCIALS (1).xlsx"

def excel_to_readable_text(df_dict):
    """Convert Excel sheets to readable text format for AI chatbot"""
    readable_text = "=== SOYOSOYO SACCO FINANCIAL REPORT ===\n\n"
    
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
                        if isinstance(value, (int, float)) and value > 1000:
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
                    total = df[col].sum()
                    if total != 0:
                        readable_text += f"Total {col}: {total:,.2f}\n"
                readable_text += "\n"
        
        readable_text += "\n" + "=" * 50 + "\n\n"
    
    return readable_text

def main():
    print("🚀 Starting SOYOSOYO SACCO Financials Upload...")
    
    if not os.path.exists(FILE_PATH):
        print(f"❌ Error: File not found at {FILE_PATH}")
        return
    
    if not DATABASE_URL:
        print("❌ Error: DATABASE_URL environment variable not set")
        return
    
    try:
        # Load Excel file with all sheets
        print(f"📖 Reading Excel file: {FILE_PATH}")
        df_dict = pd.read_excel(FILE_PATH, sheet_name=None, engine='openpyxl')
        
        print(f"📊 Found {len(df_dict)} sheets: {list(df_dict.keys())}")
        
        # Convert to readable text for AI
        extracted_text = excel_to_readable_text(df_dict)
        
        # Read file as binary for content storage
        with open(FILE_PATH, 'rb') as file:
            file_content = base64.b64encode(file.read()).decode('utf-8')
        
        # Get file size
        file_size = os.path.getsize(FILE_PATH)
        
        # Connect to Neon DB
        print("🔗 Connecting to Neon PostgreSQL...")
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cur = conn.cursor()
        
        # Delete old financials before inserting new ones
        print("🗑️ Removing old financial records...")
        cur.execute("DELETE FROM uploaded_files WHERE filename LIKE '%FINANCIALS%' OR original_name LIKE '%FINANCIALS%';")
        
        # Prepare metadata
        metadata = {
            "analysis": f"Financial report with {len(df_dict)} sheets uploaded on {datetime.now().isoformat()}",
            "sheets": list(df_dict.keys()),
            "total_rows": sum(len(df) for df in df_dict.values()),
            "upload_method": "python_script"
        }
        
        # Insert new financials record
        print("💾 Inserting new financial record...")
        filename = os.path.basename(FILE_PATH)
        
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
            filename,
            filename,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            file_size,
            extracted_text,
            json.dumps(metadata),
            file_content,
            True  # Mark as processed since we did the extraction
        ))
        
        # Commit changes
        conn.commit()
        print("✅ Financial records uploaded successfully!")
        
        # Display summary
        print(f"\n📈 UPLOAD SUMMARY:")
        print(f"   File: {filename}")
        print(f"   Size: {file_size:,} bytes")
        print(f"   Sheets: {len(df_dict)}")
        print(f"   Text extracted: {len(extracted_text):,} characters")
        print(f"   Total rows: {sum(len(df) for df in df_dict.values())}")
        
    except pd.errors.ExcelFileError as e:
        print(f"❌ Excel file error: {e}")
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
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
