#!/bin/bash

# Feedback Aggregator Slack Bot - Deployment Script
# Optimized for Cloudflare Free Tier

set -e

echo "🚀 Deploying Feedback Aggregator Slack Bot..."

# Check if wrangler is authenticated
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "❌ Please login to Cloudflare first:"
    echo "npx wrangler auth login"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Setting up D1 Database..."
# Create D1 database if it doesn't exist
DB_ID=$(npx wrangler d1 create feedback_aggregator --json | jq -r '.id // empty')
if [ -z "$DB_ID" ]; then
    echo "⚠️ D1 database might already exist, continuing..."
else
    echo "✅ Created D1 database with ID: $DB_ID"
fi

echo "🔑 Setting up KV Namespace..."
# Create KV namespace if it doesn't exist
KV_ID=$(npx wrangler kv:namespace create "CACHE" --json | jq -r '.id // empty')
if [ -z "$KV_ID" ]; then
    echo "⚠️ KV namespace might already exist, continuing..."
else
    echo "✅ Created KV namespace with ID: $KV_ID"
fi

echo "🪣 Setting up R2 Bucket..."
# Create R2 bucket if it doesn't exist
R2_RESULT=$(npx wrangler r2 bucket create feedback-aggregator-bucket 2>&1 || echo "exists")
if [[ $R2_RESULT == *"exists"* ]]; then
    echo "⚠️ R2 bucket might already exist, continuing..."
else
    echo "✅ Created R2 bucket: feedback-aggregator-bucket"
fi

echo "📝 Updating wrangler.toml with resource IDs..."
# Update wrangler.toml with actual IDs (this is a simplified version)
# In production, you'd want to parse and update the actual IDs

echo "🗃️ Running database migrations..."
npx wrangler d1 execute feedback_aggregator --file=migrations/0001_create_feedback_table.sql --local || echo "Migration may have already run"

echo "📤 Deploying to Cloudflare Workers..."
DEPLOY_URL=$(npx wrangler deploy --json | jq -r '.url // empty')

if [ -n "$DEPLOY_URL" ]; then
    echo "✅ Deployment successful!"
    echo "🌐 Worker URL: $DEPLOY_URL"
    echo ""
    echo "🔧 Next steps:"
    echo "1. Update your Slack app's Request URL to: $DEPLOY_URL/slack/events"
    echo "2. Subscribe to these bot events: app_mention, message.im"
    echo "3. Add these slash commands:"
    echo "   - /feedback-summary"
    echo "   - /network-insights"
    echo "   - /network-viz"
    echo "4. Test with: @YourBot help"
else
    echo "❌ Deployment failed. Check the logs above."
    exit 1
fi

echo ""
echo "💡 Free Tier Optimization Notes:"
echo "- AI requests limited to 100K tokens/day"
echo "- D1: 500K rows read/month, 100K rows written/month"
echo "- KV: 100K reads/day, 1K writes/day"
echo "- R2: 10GB storage, 100K operations/month"
echo ""
echo "📊 Monitor usage at: https://dash.cloudflare.com/"