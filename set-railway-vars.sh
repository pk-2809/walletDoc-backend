#!/bin/bash

# Automated script to set Railway environment variables
# This uses Railway API to set variables directly

set -e

echo "🔐 Setting Railway Environment Variables..."
echo "==========================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run: railway login"
    exit 1
fi

# Get base64 string
if [ ! -f "service-account-base64.txt" ]; then
    echo "❌ Error: service-account-base64.txt not found!"
    exit 1
fi

BASE64_STRING=$(cat service-account-base64.txt)

echo "📦 Found base64 service account"
echo ""

# Get project info
PROJECT_ID="e0a33535-477b-47c0-b974-e76ecb3e7479"
SERVICE_ID="b90dbf00-c6f9-45cc-be35-54584aeba081"

echo "🔗 Linking to service..."
railway service link "$SERVICE_ID" 2>&1 || {
    echo "⚠️  Could not auto-link service. You may need to link manually:"
    echo "   railway service link"
    echo ""
    echo "Then run this script again."
    exit 1
}

echo "✅ Service linked"
echo ""

# Set variables
echo "🔐 Setting environment variables..."

railway variables --set "FIREBASE_SERVICE_ACCOUNT_BASE64=$BASE64_STRING" --service "$SERVICE_ID" 2>&1 && echo "✅ FIREBASE_SERVICE_ACCOUNT_BASE64 set" || echo "⚠️  Failed to set FIREBASE_SERVICE_ACCOUNT_BASE64"

railway variables --set "FIREBASE_STORAGE_BUCKET=walletdoc-1f052.firebasestorage.app" --service "$SERVICE_ID" 2>&1 && echo "✅ FIREBASE_STORAGE_BUCKET set" || echo "⚠️  Failed to set FIREBASE_STORAGE_BUCKET"

railway variables --set "FIREBASE_API_KEY=AIzaSyAs927yoJpUmMEa_e8eGhxNpE0G9KG6MI8" --service "$SERVICE_ID" 2>&1 && echo "✅ FIREBASE_API_KEY set" || echo "⚠️  Failed to set FIREBASE_API_KEY"

railway variables --set "NODE_ENV=production" --service "$SERVICE_ID" 2>&1 && echo "✅ NODE_ENV set" || echo "⚠️  Failed to set NODE_ENV"

echo ""
echo "✅ Variables set! Railway will auto-redeploy."
echo ""
echo "📋 Verify variables:"
echo "   railway variables"
echo ""
echo "📊 View logs:"
echo "   railway logs"
echo ""

