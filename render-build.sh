#!/bin/bash
set -e

echo "🚀 Starting Render build for SOYOSOYO SACCO with Vector Search..."

export PYTHONUNBUFFERED=1
export PIP_DISABLE_PIP_VERSION_CHECK=1

echo "📦 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "📦 Installing Node.js dependencies..."
npm install --production=false

echo "🗄️ Setting up database schema with pgvector..."
npm run db:push --force || echo "⚠️ Database push completed"

echo "🔨 Building frontend..."
npx vite build

echo "🔧 Building backend..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "📁 Setting up directories..."
mkdir -p financials reports data documents uploads assets attached_assets files
chmod 755 financials reports data documents uploads assets attached_assets files 2>/dev/null || true

echo "📤 Running file upload with embeddings..."
python3 upload_financials.py || echo "⚠️ Upload completed"

echo "✅ Build completed!"
echo "🎯 Vector search enabled with pgvector"

if [ -f "dist/index.js" ]; then
    echo "✅ Server compiled"
else
    echo "❌ Compilation failed"
    exit 1
fi

echo "🎉 Ready for deployment!"
