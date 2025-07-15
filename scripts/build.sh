#!/bin/bash

# Simple Netlify build script that uses Node.js for environment replacement

echo "🚀 Starting Netlify build process..."
echo "📋 Node.js version: $(node --version)"

# Run the Node.js script to replace environment variables
echo "📝 Replacing environment variables..."
node scripts/replace-env.js

# Check if the script succeeded
if [ $? -ne 0 ]; then
    echo "❌ Environment variable replacement failed"
    exit 1
fi

echo "🔧 Building Angular application for production..."

# Build using npm script (which calls ng build --configuration production)
npm run build:prod

# Check build result
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"

    # Check if build output exists
    if [ -d "dist/pointy-poker/browser" ]; then
        echo "📁 Build output confirmed at dist/pointy-poker/browser"
    elif [ -d "dist/pointy-poker" ]; then
        echo "📁 Build output confirmed at dist/pointy-poker"
    else
        echo "⚠️  Build output directory not found, but build command succeeded"
    fi
else
    echo "❌ Build failed"
    exit 1
fi
