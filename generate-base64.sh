#!/bin/bash

# Script to generate base64 encoded Firebase service account for Railway

if [ ! -f "firebase-service-account.json" ]; then
    echo "❌ Error: firebase-service-account.json not found!"
    exit 1
fi

echo "📦 Generating base64 encoded service account..."
echo ""

# Detect OS and use appropriate base64 command
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    base64 -i firebase-service-account.json | tr -d '\n' | pbcopy
    echo "✅ Base64 encoded service account copied to clipboard!"
    echo ""
    echo "📋 Paste this in Railway as FIREBASE_SERVICE_ACCOUNT_BASE64:"
    base64 -i firebase-service-account.json | tr -d '\n' | head -c 50
    echo "..."
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    base64 firebase-service-account.json | tr -d '\n' | xclip -selection clipboard
    echo "✅ Base64 encoded service account copied to clipboard!"
    echo ""
    echo "📋 Paste this in Railway as FIREBASE_SERVICE_ACCOUNT_BASE64:"
    base64 firebase-service-account.json | tr -d '\n' | head -c 50
    echo "..."
else
    # Fallback - just output to console
    echo "⚠️  Could not auto-copy. Here's the base64 string:"
    base64 firebase-service-account.json | tr -d '\n'
fi

echo ""
echo "💡 Tip: The full string is in your clipboard. Paste it in Railway dashboard!"

