#!/bin/bash

echo "🔧 Starting Render build with Universal Excel Processing..."

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

# Install Python dependencies for universal Excel processing
echo "🐍 Installing Python dependencies..."
pip install --no-cache-dir pandas psycopg2-binary openpyxl python-dotenv

# Run Universal Document Uploader (processes ALL supported files)
echo "📊 Running Universal Document Uploader..."
python upload_financials.py

echo "🎉 Build and deployment completed successfully!"
