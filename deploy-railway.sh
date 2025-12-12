#!/bin/bash

# Automated Railway Deployment Script
# This script helps you deploy to Railway with all necessary environment variables

set -e

echo "🚀 Railway Deployment Script"
echo "============================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
    echo "✅ Railway CLI installed"
    echo ""
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway..."
    railway login
    echo ""
fi

# Generate base64 service account
if [ ! -f "firebase-service-account.json" ]; then
    echo "❌ Error: firebase-service-account.json not found!"
    exit 1
fi

echo "📦 Generating base64 encoded service account..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    BASE64_STRING=$(base64 -i firebase-service-account.json | tr -d '\n')
else
    BASE64_STRING=$(base64 firebase-service-account.json | tr -d '\n')
fi

echo "✅ Base64 string generated"
echo ""

# Initialize Railway project if not already done
if [ ! -f ".railway" ] && [ ! -d ".railway" ]; then
    echo "🔧 Initializing Railway project..."
    echo "⚠️  Note: You'll need to run 'railway init' manually in your terminal"
    echo "   Or create a new project in Railway dashboard and link it with:"
    echo "   railway link"
    echo ""
    echo "Press Enter to continue with setting variables (if project already exists)..."
    read -r
    echo ""
fi

# Set environment variables
echo "🔐 Setting environment variables..."

railway variables --set "FIREBASE_SERVICE_ACCOUNT_BASE64=$BASE64_STRING"
railway variables --set "FIREBASE_STORAGE_BUCKET=walletdoc-1f052.firebasestorage.app"
railway variables --set "FIREBASE_API_KEY=AIzaSyAs927yoJpUmMEa_e8eGhxNpE0G9KG6MI8"
railway variables --set "NODE_ENV=production"

echo "✅ Environment variables set"
echo ""

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 To get your deployment URL, run:"
echo "   railway domain"
echo ""
echo "📊 To view logs, run:"
echo "   railway logs"
echo ""

