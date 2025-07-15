#!/bin/bash

# Netlify build script for Angular with environment variable replacement

echo "🚀 Starting production build with environment variables..."

# Replace environment variables in the production environment file
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set"
    exit 1
fi

echo "📝 Replacing environment variables..."

# Use envsubst to replace environment variables in the production file
envsubst < src/environments/environment.prod.ts > src/environments/environment.prod.tmp.ts
mv src/environments/environment.prod.tmp.ts src/environments/environment.prod.ts

echo "🔧 Building Angular application for production..."

# Build using Angular's production configuration
ng build --configuration production

echo "✅ Build completed successfully!"