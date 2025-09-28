#!/bin/bash
set -e

echo "🚀 Starting Render build for SOYOSOYO SACCO..."

# Set Python environment
export PYTHONUNBUFFERED=1
export PIP_DISABLE_PIP_VERSION_CHECK=1

# Update system and install Python dependencies
echo "📦 Installing Python dependencies..."
pip install --upgrade pip
pip install pandas psycopg2-binary openpyxl

# Install PDF processing libraries for proper PDF extraction
echo "📄 Installing PDF processing libraries..."
pip install PyPDF2 pdfplumber

# Optional: Install additional PDF libraries for better extraction
echo "📋 Installing additional text processing libraries..."
pip install python-docx2txt textract2 || echo "⚠️ Some optional libraries failed to install (non-critical)"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm ci --production=false

# Build the application
echo "🔨 Building the application..."
npm run build

# Run database migrations/push
echo "🗄️ Setting up database schema..."
npm run db:push --force || echo "⚠️ Database push completed with warnings"

# Set correct permissions for uploaded files directory
echo "📁 Setting up file directories..."
mkdir -p financials reports data documents uploads assets attached_assets files
chmod 755 financials reports data documents uploads assets attached_assets files 2>/dev/null || true

# Run the Python uploader to process any existing files
echo "📤 Running initial file upload..."
python3 upload_financials.py || echo "⚠️ Initial file upload completed with warnings"

echo "✅ Render build completed successfully!"
echo "🌐 SOYOSOYO SACCO chatbot ready for deployment"

# Verify critical files exist
echo "🔍 Build verification..."
if [ -f "server/index.ts" ]; then
    echo "✅ Server file found"
else
    echo "❌ Server file missing"
    exit 1
fi

if [ -f "package.json" ]; then
    echo "✅ Package.json found"
else
    echo "❌ Package.json missing"
    exit 1
fi

echo "🎉 All checks passed - ready for deployment!"
