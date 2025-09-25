#!/bin/bash

echo "🔧 Starting Render build..."

# Install dependencies
echo "📦 Installing dependencies..."
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

echo "✅ Build completed successfully!"
