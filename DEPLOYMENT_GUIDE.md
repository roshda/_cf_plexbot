# Deployment Guide: Feedback Aggregator Slack Bot

## Quick Start

1. **Prerequisites**
   ```bash
   npm install -g wrangler
   wrangler auth login
   ```

2. **Deploy Everything**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

3. **Configure Slack App**
   - Go to https://api.slack.com/apps
   - Update "Request URL" to: `https://your-worker.workers.dev/slack/events`
   - Subscribe to events: `app_mention`, `message.im`
   - Add slash commands: `/feedback-summary`, `/network-insights`, `/network-viz`

## Manual Deployment Steps

### 1. Create Cloudflare Resources
```bash
# D1 Database
wrangler d1 create feedback_aggregator

# KV Namespace
wrangler kv:namespace create "CACHE"

# R2 Bucket
wrangler r2 bucket create feedback-aggregator-bucket
```

### 2. Update wrangler.toml
Add the generated IDs to your `wrangler.toml` file:
```toml
[[d1_databases]]
database_id = "your-d1-database-id"

[[kv_namespaces]]
id = "your-kv-namespace-id"

[[r2_buckets]]
bucket_name = "feedback-aggregator-bucket"
```

### 3. Run Migrations
```bash
wrangler d1 execute feedback_aggregator --file=migrations/0001_create_feedback_table.sql
```

### 4. Deploy
```bash
wrangler deploy
```

## Project Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Slack App     │────│ Cloudflare      │
│                 │    │  Workers        │
│ • Slash Commands│    │                 │
│ • @ Mentions    │    │ • Hono Framework│
│ • Conversations │    │ • Request Routing│
└─────────────────┘    └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────┐
│   Feedback      │    │  Processing     │
│   Sources       │    │  Pipeline       │
│                 │    │                 │
│ • GitHub Issues │    │ • Aggregation   │
│ • Slack Messages│    │ • Analysis      │
│ • Jira Tickets  │    │ • AI Insights   │
│ • Email         │    │ • Caching       │
│ • Teams         │    │                 │
└─────────────────┘    └─────────────────┘
         ▲                        │
         └────────────────────────┘
              Storage Layer
         ┌─────────────────┐
         │ Cloudflare      │
         │ Services        │
         │                 │
         │ • D1 Database   │
         │ • KV Cache      │
         │ • R2 Storage    │
         │ • Workers AI    │
         └─────────────────┘
```

## Cloudflare Products Used

### 1. Cloudflare Workers
- **Purpose**: Core serverless runtime for the Slack bot
- **Usage**: Handles all HTTP requests, orchestrates services
- **Free Tier**: 100,000 requests/day

### 2. D1 Database
- **Purpose**: Store processed feedback and analysis results
- **Schema**: feedback table with indexes for efficient queries
- **Free Tier**: 500K reads, 100K writes/month

### 3. KV Storage
- **Purpose**: Cache frequently accessed insights and summaries
- **Keys**: feedback:summary, feedback:insights, network:visualization
- **Free Tier**: 100K reads, 1K writes/day

### 4. Workers AI
- **Purpose**: Sentiment analysis, trend extraction, recommendations
- **Models**: Llama 3.1 8B Instruct (optimized for free tier)
- **Free Tier**: 100K tokens/day

### 5. R2 Storage (Bonus)
- **Purpose**: Store raw feedback JSON files
- **Usage**: Backup and batch processing of feedback data
- **Free Tier**: 10GB storage, 100K operations/month

## Free Tier Optimizations

### AI Usage
- Token estimation before requests
- Conservative sampling (5-10 items instead of all)
- Text truncation (1000 chars max)
- Fallback responses when limits exceeded

### Database Usage
- Indexed queries for performance
- Batch processing in queues
- Efficient caching to reduce reads
- Limited result sets (max 100 items)

### Cache Strategy
- 5-10 minute TTL for different data types
- Smart cache invalidation
- Reduced KV writes through longer TTL

## API Endpoints

```
GET  /health                    # Health check
POST /slack/events              # Slack webhook handler
GET  /api/feedback/summary      # JSON feedback summary
GET  /api/feedback/insights     # JSON AI insights
GET  /api/network/visualization # JSON network visualization
```

## Slack Bot Features

### Slash Commands
- `/feedback-summary` - Overview of all feedback
- `/network-insights` - AI-powered recommendations
- `/network-viz` - Network stack health visualization

### Conversational AI
- Natural language queries about feedback
- Context-aware responses
- Fallback to helpful suggestions

### Persistent Visualization
- ASCII art network topology
- OSI layer status indicators
- Real-time issue distribution

## Monitoring & Debugging

### Check Deployment
```bash
wrangler tail 
curl https://your-worker.workers.dev/health
```

### Monitor Usage
- Dashboard: https://dash.cloudflare.com/
- Workers AI usage in dashboard
- D1 query metrics
- KV operation counts

### Debug Issues
```bash
wrangler dev --local=false
wrangler kv:key list --namespace-id YOUR_KV_ID
wrangler d1 execute feedback_aggregator --command="SELECT COUNT(*) FROM feedback;"
```

## Troubleshooting

### Common Issues

1. **Slack events not working**
   - Check Request URL in Slack app settings
   - Verify signing secret matches .env
   - Check wrangler tail for error logs

2. **AI responses failing**
   - Check token usage in dashboard
   - Verify AI binding in wrangler.toml
   - Confirm free tier limits not exceeded

3. **Database errors**
   - Run migrations: `wrangler d1 execute feedback_aggregator --file=migrations/...`
   - Check D1 database ID in wrangler.toml
   - Verify table exists

4. **KV cache not working**
   - Check namespace ID in wrangler.toml
   - Verify KV binding name matches code
   - Check KV usage limits

## Cost Optimization

### Free Tier Limits
- **Workers**: 100K requests/day
- **AI**: 100K tokens/day
- **D1**: 500K reads, 100K writes/month
- **KV**: 100K reads, 1K writes/day
- **R2**: 10GB storage, 100K operations/month

### Usage Monitoring
The app includes built-in usage tracking to prevent limit overruns and provide visibility into resource consumption.

## Security Considerations

- Slack request verification implemented
- Environment variables for sensitive data
- Input validation on all endpoints
- Rate limiting through free tier management
- No direct database access from external requests

## Next Steps

1. **Test thoroughly** with your Slack workspace
2. **Monitor usage** in Cloudflare dashboard
3. **Customize feedback sources** as needed
4. **Add more AI features** within token limits
5. **Consider upgrading** services as usage grows

## Support

For issues with this deployment:
1. Check wrangler tail logs
2. Verify all IDs in wrangler.toml
3. Test individual services
4. Review free tier usage
5. Check Slack app configuration