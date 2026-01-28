# PlexBot - Network Infrastructure Feedback Analyzer

A Cloudflare Workers-based Slack bot that aggregates and analyzes feedback from network infrastructure teams.

**Live Demo:** https://feedback-aggregator.roshnirose.workers.dev

## Features

- **Conversational AI** with natural language processing
- **Advanced Analytics** including sentiment analysis and trend detection
- **Network Visualization** with OSI layer health monitoring
- **Session Memory** using Durable Objects for context awareness
- **Multi-source Feedback** aggregation from 7 different platforms

## Cloudflare Products Used

- **Workers**: Serverless runtime and API endpoints
- **D1 Database**: Structured feedback storage
- **KV Storage**: High-performance caching
- **Workers AI**: Sentiment analysis and conversational responses
- **Durable Objects**: Session management and state persistence

## Quick Start

```bash
# Install dependencies
npm install

# Deploy to Cloudflare
npm run deploy
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/feedback/summary` - Feedback statistics
- `GET /api/feedback/insights` - AI-powered insights
- `GET /api/network/visualization` - Network health visualization
- `POST /slack/events` - Slack webhook handler