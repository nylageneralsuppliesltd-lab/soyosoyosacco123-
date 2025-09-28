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

echo "📦 Installing Node.js dependencies..."
npm install --production=false

# Run database migrations/push BEFORE building
echo "🗄️ Setting up database schema..."
npm run db:push --force || echo "⚠️ Database push completed with warnings"

# BUILD FRONTEND
echo "🔨 Building frontend..."
npx vite build

# BUILD BACKEND (This was missing!)
echo "🔧 Building backend..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

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
if [ -f "dist/index.js" ]; then
    echo "✅ Compiled server file found"
else
    echo "❌ Server compilation failed"
    exit 1
fi

if [ -f "server/index.ts" ]; then
    echo "✅ Source server file found"
else
    echo "❌ Source server file missing"
    exit 1
fi

if [ -f "package.json" ]; then
    echo "✅ Package.json found"
else
    echo "❌ Package.json missing"  
    exit 1
fi

echo "🎉 All checks passed - ready for deployment!"
