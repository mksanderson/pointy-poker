#!/bin/bash

# Netlify build script for Angular with environment variable replacement

echo "🚀 Starting production build with environment variables..."

# Check Node.js version
echo "📋 Node.js version: $(node --version)"

# Replace environment variables in the production environment file
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set"
    exit 1
fi

echo "📝 Replacing environment variables..."
echo "   SUPABASE_URL: $SUPABASE_URL"
echo "   SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY:0:20}..."

# Use envsubst to replace environment variables in the production file
envsubst < src/environments/environment.prod.ts > src/environments/environment.prod.tmp.ts
mv src/environments/environment.prod.tmp.ts src/environments/environment.prod.ts

echo "🔧 Building Angular application for production..."

# Build using Angular's production configuration
npm run build:prod

echo "📁 Checking build output..."
if [ -d "dist/pointy-poker/browser" ]; then
    echo "✅ Build output found at dist/pointy-poker/browser"
    ls -la dist/pointy-poker/browser
elif [ -d "dist/pointy-poker" ]; then
    echo "✅ Build output found at dist/pointy-poker"
    ls -la dist/pointy-poker
else
    echo "❌ No build output found in dist/"
    ls -la dist/ || echo "dist/ directory doesn't exist"
    exit 1
fi

echo "✅ Build completed successfully!"
