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

# Install Python dependencies for financial upload
echo "🐍 Installing Python dependencies..."
pip install pandas==2.2.2 psycopg2-binary==2.9.10 openpyxl==3.1.4 python-dotenv==1.0.0

# Check if financial file exists and upload to database
echo "💰 Checking for financial files..."
if [ -f "financials/21-SEP-2025 SOYOSOYO FINANCIALS (1).xlsx" ]; then
    echo "📊 Found financial file, uploading to database..."
    python upload_financials.py
    if [ $? -eq 0 ]; then
        echo "✅ Financial data uploaded successfully!"
    else
        echo "⚠️ Financial upload failed, but continuing deployment..."
    fi
else
    echo "ℹ️ No financial file found, skipping upload..."
fi

echo "🎉 Build and deployment completed successfully!"
