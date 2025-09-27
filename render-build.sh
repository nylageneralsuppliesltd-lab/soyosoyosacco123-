#!/bin/bash

echo "🔧 Starting Render build..."

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install --no-audit --no-fund

# Build frontend
echo "🎨 Building frontend..."
npx vite build

# Build backend
echo "🏗️ Building backend..."
npx esbuild server/index.ts server/routes.ts server/services/openai.ts server/services/fileProcessor.ts server/db.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Verify build outputs
if [ ! -f "dist/index.js" ]; then
    echo "❌ Backend build failed"
    exit 1
fi

if [ ! -d "dist/public" ]; then
    echo "❌ Frontend build failed"
    exit 1
fi

echo "✅ Node.js build completed successfully!"

# Install Python dependencies (FIXED VERSION)
echo "🐍 Installing Python dependencies..."
pip install --no-cache-dir pandas psycopg2-binary openpyxl python-dotenv

# Check if financial file exists and upload to database
echo "💰 Checking for financial files..."
if find financials -name "*.xlsx" -type f | head -1 | grep -q .; then
    echo "📊 Found financial file, uploading to database..."
    python upload_financials.py
    if [ $? -eq 0 ]; then
        echo "✅ Financial data uploaded successfully!"
    else
        echo "⚠️ Financial upload failed, but continuing deployment..."
    fi
else
    echo "ℹ️ No Excel files found in financials folder..."
fi

echo "🎉 Build and deployment completed successfully!"
