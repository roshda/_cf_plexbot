import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SlackBot } from './slack-bot'
import { FeedbackAggregator } from './feedback-aggregator'
import { NetworkVisualizer } from './network-visualizer'

// Cloudflare Workers types
export interface Env {
  FEEDBACK_DB: D1Database
  CACHE: KVNamespace
  AI: Ai
  SESSION_MANAGER: DurableObjectNamespace
  SLACK_BOT_TOKEN: string
  SLACK_SIGNING_SECRET: string
  SLACK_APP_LEVEL_TOKEN: string
  SLACK_BOT_USER_ID: string
  SLACK_REPORT_CHANNELS: string
  SLACK_VISUALIZATION_CHANNELS: string
}

const app = new Hono<{ Bindings: Env }>()

// Enable CORS for web interface
app.use('/api/*', cors())

// Initialize services
const slackBot = new SlackBot()
const feedbackAggregator = new FeedbackAggregator()
const networkVisualizer = new NetworkVisualizer()

// Slack events endpoint
app.post('/slack/events', async (c) => {
  let body: any

  // Handle different content types
  const contentType = c.req.header('content-type') || ''

  if (contentType.includes('application/json')) {
    body = await c.req.json()
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.text()
    // Parse form data - Slack sends payload as URL-encoded JSON string
    const params = new URLSearchParams(formData)
    const payload = params.get('payload')
    if (payload) {
      body = JSON.parse(payload)
    } else {
      // Direct form data for slash commands
      body = {}
      for (const [key, value] of params.entries()) {
        body[key] = value
      }
    }
  } else {
    return c.json({ error: 'Unsupported content type' }, 400)
  }

  const signature = c.req.header('X-Slack-Signature')
  const timestamp = c.req.header('X-Slack-Request-Timestamp')

  // Verify Slack request - skip for testing
  // if (!slackBot.verifyRequest(body, signature, timestamp, c.env.SLACK_SIGNING_SECRET)) {
  //   return c.json({ error: 'Invalid signature' }, 401)
  // }

  // Handle Slack events
  const response = await slackBot.handleEvent(body, c.env)
  return c.json(response)
})

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Demo website
app.get('/', async (c) => {
  // Get sample data for demo
  const summary = await feedbackAggregator.getSummary(c.env)
  const insights = await feedbackAggregator.getInsights(c.env)
  const visualization = await networkVisualizer.generateVisualization(c.env)

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Network Infrastructure Feedback Analyzer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
        }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .demo-section {
            background: white;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .metric-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .slack-demo {
            background: #4a154b;
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Slack-Lato', 'appleLogo', 'Slack Text', sans-serif;
        }
        .slack-message {
            background: white;
            color: #1d1c1d;
            padding: 12px 16px;
            border-radius: 8px;
            margin: 10px 0;
            position: relative;
        }
        .bot-avatar {
            width: 36px;
            height: 36px;
            background: #667eea;
            border-radius: 4px;
            display: inline-block;
            margin-right: 10px;
            vertical-align: top;
        }
        .code-block {
            background: #f6f8fa;
            border: 1px solid #d1d9e0;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
            font-family: 'SFMono-Regular', Consolas, monospace;
            font-size: 14px;
        }
        .feature-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .feature-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .cloudflare-products {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 15px 0;
        }
        .product-badge {
            background: #f1f3f4;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            color: #202124;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 PlexBot - Network Infrastructure Feedback Analyzer</h1>
        <p><An AI-powered Slack bot that aggregates and analyzes feedback from network infrastructure teams using 5 Cloudflare products.</p>

        <div style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="margin-bottom: 15px; color: white;">Join our Slack workspace to interact with the bot in real-time:</p>
            <a href="https://join.slack.com/t/plexspaceworkspace/shared_invite/zt-3ogjweumr-Dn5Q4bxYasDo7kvpL69_7w"
               style="background: white; color: #4a154b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
                Join Slack Workspace
            </a>
            <p style="margin-top: 15px; font-size: 14px; color: white; opacity: 0.9;">
                Once joined, try commands like <code style="background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 3px;">@PlexBot what are the main performance issues?</code>
            </p>
        </div>

        <div class="cloudflare-products">
            <span class="product-badge">⚡ Cloudflare Workers</span>
            <span class="product-badge">🗄️ D1 Database</span>
            <span class="product-badge">🔑 KV Storage</span>
            <span class="product-badge">🤖 Workers AI</span>
            <span class="product-badge">🏗️ Durable Objects</span>
        </div>
    </div>

    <div class="demo-section">
        <h2>📊 Live Feedback Analytics</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-value">${summary.totalItems}</div>
                <div>Total Feedback Items</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.sources.length}</div>
                <div>Data Sources</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.criticalIssues}</div>
                <div>Critical Issues</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.featureRequests}</div>
                <div>Feature Requests</div>
            </div>
        </div>
    </div>

    <div class="demo-section">
        <h2>💬 Slack Integration Demo</h2>
        <div class="slack-demo">
            <div style="margin-bottom: 20px;">
                <strong>@PlexBot</strong> what are the main performance issues?
            </div>

            <div class="slack-message">
                <div class="bot-avatar">🤖</div>
                <strong>PlexBot</strong> <span style="color: #616061;">9:42 AM</span><br>
                Based on the Jira ticket, you're experiencing network monitoring performance degradation. Issues include high CPU usage, slow SNMP polling, and memory leaks. The system requires restarts every 24 hours.
                <br><br>
                <strong>Priority Actions:</strong><br>
                • Optimize SNMP polling algorithms<br>
                • Implement connection pooling<br>
                • Fix memory leaks in poller process
            </div>

            <div style="margin-top: 20px;">
                <strong>@PlexBot</strong> tell me about security concerns
            </div>

            <div class="slack-message">
                <div class="bot-avatar">🤖</div>
                <strong>PlexBot</strong> <span style="color: #616061;">9:43 AM</span><br>
                Critical security vulnerability identified: SQL injection in device search API endpoint. Affects all versions prior to 2.3.2. Query parameters aren't sanitized before SQL execution.
                <br><br>
                <strong>Immediate Action Required:</strong><br>
                🚨 Address SQL injection vulnerability immediately<br>
                🔒 Implement OAuth 2.0 authentication<br>
                🛡️ Add input validation and prepared statements
            </div>
        </div>
    </div>

    <div class="demo-section">
        <h2>Key Features</h2>
        <div class="feature-list">
            <div class="feature-card">
                <h3>🤖 Conversational AI</h3>
                <p>Natural language processing with context awareness. Ask questions like "What are the performance issues?" or "Tell me about security concerns."</p>
            </div>
            <div class="feature-card">
                <h3>📊 Advanced Analytics</h3>
                <p>Sentiment analysis, priority matrix, user journey insights, and pain point detection across multiple data sources.</p>
            </div>
            <div class="feature-card">
                <h3>🏗️ Network Visualization</h3>
                <p>Embedded OSI layer health dashboard with real-time status indicators and comprehensive issue tracking.</p>
            </div>
            <div class="feature-card">
                <h3>💾 Session Management</h3>
                <p>Persistent conversation context using Durable Objects. Remembers your preferences and conversation history.</p>
            </div>
        </div>
    </div>

    <div class="demo-section">
        <h2>🔧 Technical Architecture</h2>
        <p>This prototype uses <strong>5 Cloudflare products</strong> to deliver enterprise-grade feedback analysis:</p>
        <ul>
            <li><strong>Cloudflare Workers:</strong> Serverless runtime for instant responses</li>
            <li><strong>D1 Database:</strong> Structured storage for feedback data</li>
            <li><strong>KV Storage:</strong> High-performance caching for insights</li>
            <li><strong>Workers AI:</strong> Llama 3.1 models for intelligent analysis</li>
            <li><strong>Durable Objects:</strong> Session management and conversation context</li>
        </ul>
    </div>

    <div class="demo-section">
        <h2>📝 Try It Yourself</h2>
        <p><strong>Add to Slack:</strong> Use the slash commands below in the Slack workspace:</p>
        <div class="code-block">
/feedback-summary     # Get overall feedback statistics
/network-insights     # AI-powered analysis with recommendations
/network-viz         # Network stack health visualization
        </div>
        <p><strong>Or chat naturally:</strong> @PlexBot what are the main performance issues?</p>
    </div>

    <div style="text-align: center; margin-top: 40px; color: #666;">
        <p>Built for Cloudflare PM Internship Assignment • <a href="https://github.com/your-repo" style="color: #667eea;">View Source Code</a></p>
    </div>
</body>
</html>`

  return c.html(html)
})

// Test conversational endpoint
app.post('/test-chat', async (c) => {
  const { message, userId } = await c.req.json()

  const slackBot = new SlackBot()
  const sessionId = `test_${userId || 'user123'}`
  const sessionManagerId = c.env.SESSION_MANAGER.idFromName(sessionId)
  const sessionManagerStub = c.env.SESSION_MANAGER.get(sessionManagerId)

  try {
    const response = await slackBot.testConversationalChat(message, userId || 'user123', sessionManagerStub, c.env)
    return c.json({ response, success: true })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error), success: false }, 500)
  }
})

// API endpoints for feedback management
app.get('/api/feedback/summary', async (c) => {
  try {
    const summary = await feedbackAggregator.getSummary(c.env)
    return c.json(summary)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

app.get('/api/feedback/insights', async (c) => {
  try {
    const insights = await feedbackAggregator.getInsights(c.env)
    return c.json(insights)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

app.get('/api/network/visualization', async (c) => {
  try {
    const visualization = await networkVisualizer.generateVisualization(c.env)
    return c.json(visualization)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx)
  }
} satisfies ExportedHandler<Env>

// Durable Object for session management
import { SessionManager } from './session-manager'

export { SessionManager }