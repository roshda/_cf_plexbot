import { FreeTierManager, conservativeAI, conservativeDB, conservativeCache } from './free-tier-optimizations'

interface FeedbackItem {
  id: string
  source_type: string
  source_id: string
  title: string
  content: string
  author: string
  created_at: string
  metadata: any
}

interface FeedbackSummary {
  totalItems: number
  sources: string[]
  dateRange: string
  topCategories: string[]
  averageSentiment: string
  criticalIssues: number
  featureRequests: number
}

interface FeedbackInsights {
  criticalIssues: string[]
  trendingTopics: string[]
  recommendations: string[]
  priorityActions: string[]
}

export class FeedbackAggregator {
  private freeTierManager = FreeTierManager.getInstance()

  async getSummary(env: any): Promise<FeedbackSummary> {
    // Check cache first
    const cacheKey = 'feedback:summary'
    const cached = await env.CACHE.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    // Aggregate data from all sources
    const allFeedback = await this.aggregateAllFeedback(env)

    // Analyze feedback
    const summary = await this.analyzeFeedbackSummary(allFeedback, env)

    // Cache result
    await env.CACHE.put(cacheKey, JSON.stringify(summary), { expirationTtl: conservativeCache.summaryTTL })

    return summary
  }

  async getInsights(env: any): Promise<FeedbackInsights> {
    // Check cache first
    const cacheKey = 'feedback:insights:v2' // Updated cache key to force refresh
    const cached = await env.CACHE.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    const allFeedback = await this.aggregateAllFeedback(env)
    const insights = await this.generateInsights(allFeedback, env)

    // Cache result
    await env.CACHE.put(cacheKey, JSON.stringify(insights), { expirationTtl: conservativeCache.insightsTTL })

    return insights
  }

  async processFeedbackDirectly(feedbackBatch: FeedbackItem[], env: any): Promise<void> {
    // Store feedback in D1 directly (no queue)
    const stmt = env.FEEDBACK_DB.prepare(`
      INSERT OR REPLACE INTO feedback (
        id, source_type, source_id, title, content, author, created_at, metadata, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const processedAt = new Date().toISOString()

    for (const item of feedbackBatch) {
      await stmt.bind(
        item.id,
        item.source_type,
        item.source_id,
        item.title,
        item.content,
        item.author,
        item.created_at,
        JSON.stringify(item.metadata),
        processedAt
      ).run()
    }

    // Invalidate caches
    await env.CACHE.delete('feedback:summary')
    await env.CACHE.delete('feedback:insights')
  }

  async aggregateAllFeedback(env: any): Promise<FeedbackItem[]> {
    // Check if we have data in D1 first
    const dbFeedback = await this.getFeedbackFromDB(env)
    if (dbFeedback.length > 0) {
      return dbFeedback
    }

    // If DB is not ready, use mock data and try to store it
    try {

    // If no data in DB, load from local mock data files (simulated)
    // In production, this would come from actual APIs or webhooks
    const mockFeedback: FeedbackItem[] = [
      // GitHub Issues - Technical bugs and features
      {
        id: "github_001",
        source_type: "github",
        source_id: "issues/456",
        title: "Docker container fails to start on ARM64 architecture",
        content: "When trying to run PlexNet in a Docker container on ARM64 systems, the container fails to start with exec format error. This is blocking deployment on modern Apple Silicon Macs and ARM-based servers.",
        author: "dev-arm64-user",
        created_at: "2024-11-25T13:20:00Z",
        metadata: { labels: ["bug", "docker", "arm64", "critical"], comments_count: 8 }
      },
      {
        id: "github_002",
        source_type: "github",
        source_id: "issues/457",
        title: "Feature request: Prometheus metrics export",
        content: "Add native Prometheus metrics export capability for integration with existing monitoring stacks. Need /metrics endpoint with proper exposition format and configurable collection intervals.",
        author: "k8s-monitoring",
        created_at: "2024-11-26T16:45:00Z",
        metadata: { labels: ["enhancement", "prometheus", "kubernetes"], comments_count: 12 }
      },
      {
        id: "github_003",
        source_type: "github",
        source_id: "issues/458",
        title: "High CPU usage when monitoring large networks (>1000 devices)",
        content: "Server process consumes excessive CPU resources when monitoring networks with more than 1000 devices. Performance degrades significantly with SNMP polling becoming slow and unreliable.",
        author: "enterprise-user",
        created_at: "2024-11-27T11:10:00Z",
        metadata: { labels: ["performance", "scalability", "snmp"], comments_count: 6 }
      },
      {
        id: "github_004",
        source_type: "github",
        source_id: "pull/234",
        title: "Add IPv6 support for network discovery",
        content: "Implement comprehensive IPv6 support including ICMPv6 neighbor discovery, IPv6 subnet scanning, and dual-stack device detection. Closes IPv6 compatibility issues.",
        author: "ipv6-contributor",
        created_at: "2024-11-28T15:30:00Z",
        metadata: { labels: ["enhancement", "ipv6", "network-discovery"] }
      },
      {
        id: "github_005",
        source_type: "github",
        source_id: "issues/459",
        title: "Security vulnerability: SQL injection in device search API",
        content: "Critical SQL injection vulnerability in /api/devices/search endpoint. Query parameters are not properly sanitized before SQL execution. Affects all versions prior to 2.3.2.",
        author: "security-researcher",
        created_at: "2024-11-29T08:00:00Z",
        metadata: { labels: ["security", "vulnerability", "sql-injection", "critical"] }
      },

      // Slack Messages - Customer and internal communication
      {
        id: "slack_001",
        source_type: "slack",
        source_id: "C1234567890_1643723400.001",
        title: "Customer reporting dashboard login issues",
        content: "@support-team We just got a call from a customer at MegaCorp reporting 'Invalid token' errors when logging into the dashboard after the latest update. They're using SSO with Azure AD.",
        author: "customer-success",
        created_at: "2024-12-01T09:30:00Z",
        metadata: { channel: "support", replies: 2 }
      },
      {
        id: "slack_002",
        source_type: "slack",
        source_id: "C2345678901_1643724000.001",
        title: "New feature idea: Network topology visualization",
        content: "@product-team What if we added an interactive network topology map showing devices, connections, and traffic flows in real-time? Could help with troubleshooting connectivity issues.",
        author: "network-engineer",
        created_at: "2024-12-01T10:45:00Z",
        metadata: { channel: "product-feedback", replies: 3 }
      },
      {
        id: "slack_003",
        source_type: "slack",
        source_id: "C3456789012_1643725000.001",
        title: "Performance issue with large network scans",
        content: "@engineering-team Network scans are taking 15+ minutes for networks with 500+ devices. Customers are complaining about slow discovery times. Need optimization for large-scale deployments.",
        author: "field-engineer",
        created_at: "2024-12-01T11:30:00Z",
        metadata: { channel: "engineering", replies: 5 }
      },

      // Jira Issues - Structured project management
      {
        id: "jira_001",
        source_type: "jira",
        source_id: "NET-123",
        title: "Network monitoring performance degradation",
        content: "Users reporting slow response times when accessing network monitoring dashboard during peak hours. Memory usage spikes to 2-3GB during high load periods.",
        author: "network-team",
        created_at: "2024-11-28T10:15:00Z",
        metadata: { priority: "high", status: "open", assignee: "backend-team" }
      },
      {
        id: "jira_002",
        source_type: "jira",
        source_id: "SEC-456",
        title: "Implement OAuth 2.0 authentication",
        content: "Replace basic authentication with OAuth 2.0 for improved security and integration capabilities with enterprise identity providers like Okta and Azure AD.",
        author: "security-team",
        created_at: "2024-11-30T14:20:00Z",
        metadata: { priority: "medium", status: "in-progress", assignee: "auth-team" }
      },

      // Email Support Tickets - Customer support
      {
        id: "email_001",
        source_type: "email",
        source_id: "ticket_789",
        title: "Cannot access historical data after upgrade",
        content: "After upgrading to v2.3.0, users cannot access historical monitoring data from before the upgrade. Database migration issue suspected. Critical for compliance reporting.",
        author: "support@enterprise-customer.com",
        created_at: "2024-12-02T08:45:00Z",
        metadata: { priority: "high", category: "data-loss" }
      },

      // Bug Reports - QA and testing feedback
      {
        id: "bug_001",
        source_type: "bug-report",
        source_id: "BR-101",
        title: "Memory leak in SNMP polling process",
        content: "Memory usage continuously increases during SNMP polling operations. Process must be restarted every 24 hours to prevent system crashes. Affects reliability in production.",
        author: "qa-team",
        created_at: "2024-12-03T13:15:00Z",
        metadata: { severity: "critical", component: "snmp-poller" }
      },

      // Teams Messages - Microsoft Teams integration
      {
        id: "teams_001",
        source_type: "teams",
        source_id: "thread_abc123",
        title: "Integration with ServiceNow requested",
        content: "Customer is asking for bidirectional integration with ServiceNow for automated incident creation and resolution tracking. This would streamline IT operations workflows.",
        author: "sales-engineer",
        created_at: "2024-12-04T09:00:00Z",
        metadata: { channel: "integrations", urgent: false }
      },

      // Dashboard Forms - User feedback forms
      {
        id: "form_001",
        source_type: "dashboard-form",
        source_id: "feedback_001",
        title: "Dashboard usability feedback",
        content: "The new dashboard layout is confusing. Users can't find the device list easily. Navigation needs improvement. The search functionality is also slow with large device counts.",
        author: "power-user",
        created_at: "2024-12-05T16:30:00Z",
        metadata: { rating: 2, category: "usability" }
      },

      // Additional diverse feedback for better analysis
      {
        id: "github_006",
        source_type: "github",
        source_id: "issues/460",
        title: "Add support for NetFlow v9 export",
        content: "Implement NetFlow v9 export capability for integration with network traffic analysis tools like SolarWinds and PRTG. This is a common enterprise requirement.",
        author: "netflow-user",
        created_at: "2024-12-06T10:00:00Z",
        metadata: { labels: ["enhancement", "netflow", "export"] }
      },
      {
        id: "slack_004",
        source_type: "slack",
        source_id: "C4567890123_1643726000.001",
        title: "Mobile app feature request",
        content: "@product-team Can we get a mobile app for on-the-go network monitoring? Critical alerts and basic device status would be very useful for network admins.",
        author: "mobile-user",
        created_at: "2024-12-06T14:15:00Z",
        metadata: { channel: "product-feedback", replies: 7 }
      }
    ]

    // Try to process feedback directly, but don't fail if DB isn't ready
    if (mockFeedback.length > 0) {
      try {
        await this.processFeedbackDirectly(mockFeedback, env)
      } catch (dbError: unknown) {
        console.log('Database not ready for writing, using mock data only:', dbError instanceof Error ? dbError.message : String(dbError))
      }
    }

    return mockFeedback
    } catch (error: unknown) {
      console.error('Error loading mock data:', error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error))
      return []
    }
  }

  private async getFeedbackFromDB(env: any): Promise<FeedbackItem[]> {
    try {
      const result = await env.FEEDBACK_DB.prepare(`
        SELECT id, source_type, source_id, title, content, author, created_at, metadata
        FROM feedback
        ORDER BY created_at DESC
      `).all()

      return result.results.map((row: any) => ({
        id: row.id,
        source_type: row.source_type,
        source_id: row.source_id,
        title: row.title,
        content: row.content,
        author: row.author,
        created_at: row.created_at,
        metadata: JSON.parse(row.metadata || '{}')
      }))
    } catch (error: unknown) {
      console.log('Database table not ready, using mock data:', error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error))
      // Return mock data if table doesn't exist yet
      return []
    }
  }

  private async analyzeFeedbackSummary(feedback: FeedbackItem[], env: any): Promise<FeedbackSummary> {
    const sources = [...new Set(feedback.map(f => f.source_type))]
    const dates = feedback.map(f => new Date(f.created_at)).sort((a, b) => a.getTime() - b.getTime())
    const dateRange = dates.length > 0 ?
      `${dates[0].toISOString().split('T')[0]} to ${dates[dates.length-1].toISOString().split('T')[0]}` :
      'No data'

    // Categorize feedback
    const categories = this.categorizeFeedback(feedback)

    // Sentiment analysis using Workers AI
    const averageSentiment = await this.analyzeSentiment(feedback, env)

    // Count critical issues and feature requests
    const criticalIssues = feedback.filter(f =>
      f.metadata.labels?.includes('security') ||
      f.metadata.labels?.includes('critical') ||
      f.content.toLowerCase().includes('vulnerability') ||
      f.content.toLowerCase().includes('crash')
    ).length

    const featureRequests = feedback.filter(f =>
      f.source_type === 'github' && f.metadata.state === 'open' && f.metadata.labels?.includes('enhancement') ||
      f.content.toLowerCase().includes('feature request') ||
      f.content.toLowerCase().includes('would be great')
    ).length

    return {
      totalItems: feedback.length,
      sources,
      dateRange,
      topCategories: categories.slice(0, 5).map(([cat, count]) => `${cat} (${count})`),
      averageSentiment,
      criticalIssues,
      featureRequests
    }
  }

  private async generateInsights(feedback: FeedbackItem[], env: any): Promise<FeedbackInsights> {
    // Extract critical issues with enhanced filtering
    const criticalIssues = this.extractCriticalIssues(feedback)

    // Advanced AI-powered analysis (with fallbacks)
    let sentimentAnalysis = { overall: 'neutral', key_concerns: [], positive_signals: [], urgency_level: 'medium' }
    let priorityMatrix = { urgent: [], high: [], medium: [], low: [] }
    let userJourneyInsights = { journeyStages: [], painPoints: [], featureAdoption: [] }

    try {
      sentimentAnalysis = await this.analyzeSentimentTrends(feedback, env)
    } catch (error: unknown) {
      console.log('Sentiment analysis failed, using defaults:', error instanceof Error ? error.message : String(error))
    }

    try {
      priorityMatrix = await this.generatePriorityMatrix(feedback, env)
    } catch (error: unknown) {
      console.log('Priority matrix failed, using defaults:', error instanceof Error ? error.message : String(error))
    }

    try {
      userJourneyInsights = await this.analyzeUserJourneys(feedback, env)
    } catch (error: unknown) {
      console.log('User journey analysis failed, using defaults:', error instanceof Error ? error.message : String(error))
    }

    // Find trending topics using enhanced AI (with fallback)
    let trendingTopics: string[] = []
    try {
      trendingTopics = await this.extractAdvancedTrendingTopics(feedback, env)
    } catch (error: unknown) {
      console.log('Trending topics failed, using defaults:', error instanceof Error ? error.message : String(error))
      trendingTopics = ['Performance & Scalability Issues', 'Security Vulnerabilities', 'Multi-Platform Compatibility']
    }

    // Generate sophisticated recommendations (with fallback)
    let recommendations: string[] = []
    try {
      recommendations = await this.generateAdvancedRecommendations(feedback, sentimentAnalysis, env)
    } catch (error: unknown) {
      console.log('Recommendations failed, using defaults:', error instanceof Error ? error.message : String(error))
      recommendations = [
        'Address critical security vulnerabilities immediately',
        'Implement performance optimizations for large-scale deployments',
        'Add comprehensive multi-platform support (ARM64, IPv6)'
      ]
    }

    // Dynamic priority actions based on analysis (with fallback)
    let priorityActions: string[] = []
    try {
      priorityActions = await this.generateDynamicPriorityActions(feedback, priorityMatrix, env)
    } catch (error: unknown) {
      console.log('Priority actions failed, using defaults:', error instanceof Error ? error.message : String(error))
      priorityActions = [
        'Address SQL injection vulnerability immediately',
        'Implement multi-arch Docker support for ARM64',
        'Optimize performance for large network monitoring'
      ]
    }

    return {
      criticalIssues,
      trendingTopics,
      recommendations,
      priorityActions,
      sentimentAnalysis,
      priorityMatrix,
      userJourneyInsights
    } as any
  }

  private categorizeFeedback(feedback: FeedbackItem[]): [string, number][] {
    const categories: Record<string, number> = {}

    feedback.forEach(f => {
      // Categorize by labels first
      if (f.metadata.labels) {
        f.metadata.labels.forEach((label: string) => {
          categories[label] = (categories[label] || 0) + 1
        })
      }

      // Categorize by content keywords
      const content = f.content.toLowerCase()
      if (content.includes('docker') || content.includes('container')) categories['docker'] = (categories['docker'] || 0) + 1
      if (content.includes('performance') || content.includes('cpu') || content.includes('memory')) categories['performance'] = (categories['performance'] || 0) + 1
      if (content.includes('security') || content.includes('vulnerability')) categories['security'] = (categories['security'] || 0) + 1
      if (content.includes('feature') || content.includes('enhancement')) categories['features'] = (categories['features'] || 0) + 1
      if (content.includes('network') || content.includes('connectivity')) categories['network'] = (categories['network'] || 0) + 1
    })

    return Object.entries(categories).sort(([,a], [,b]) => b - a)
  }

  private async analyzeSentiment(feedback: FeedbackItem[], env: any): Promise<string> {
    // Check free tier limits before making AI request
    const sample = feedback.slice(0, 5) // Reduced sample size
    const titles = sample.map(f => f.title).join('. ')
    const truncatedTitles = conservativeAI.truncateForAI(titles, 1000)
    const estimatedTokens = conservativeAI.estimateTokens(truncatedTitles)

    if (!this.freeTierManager.canMakeAIRequest(env, estimatedTokens)) {
      console.log('AI request blocked due to free tier limits')
      return 'Neutral' // Fallback when limits exceeded
    }

    try {
      const model = conservativeAI.getModelForTask('sentiment')

      const aiResponse = await env.AI.run(model, {
        messages: [
          {
            role: 'system',
            content: 'Analyze the sentiment of these feedback titles. Return only: positive, negative, or neutral.'
          },
          {
            role: 'user',
            content: `Analyze sentiment: ${truncatedTitles}`
          }
        ],
        max_tokens: 10
      })

      // Record token usage
      this.freeTierManager.recordAITokensUsed(estimatedTokens)

      return aiResponse.response?.toLowerCase().includes('positive') ? 'Positive' :
             aiResponse.response?.toLowerCase().includes('negative') ? 'Negative' : 'Neutral'
    } catch (error: unknown) {
      console.error('Sentiment analysis error:', error)
      return 'Neutral'
    }
  }

  private extractCriticalIssues(feedback: FeedbackItem[]): string[] {
    const criticalKeywords = [
      'security', 'vulnerability', 'sql-injection', 'crash', 'data loss',
      'memory leak', 'performance degradation', 'blocking', 'critical',
      'emergency', 'breach', 'exploit'
    ]

    return feedback
      .filter(f => {
        const content = f.content.toLowerCase()
        const title = f.title.toLowerCase()
        const labels = f.metadata.labels || []

        return criticalKeywords.some(keyword =>
          content.includes(keyword) ||
          title.includes(keyword) ||
          labels.some((label: string) => label.toLowerCase().includes(keyword))
        )
      })
      .sort((a, b) => {
        // Sort by severity and recency
        const aSeverity = this.calculateSeverity(a)
        const bSeverity = this.calculateSeverity(b)
        if (aSeverity !== bSeverity) return bSeverity - aSeverity

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      .slice(0, 8)
      .map(f => `${f.title} (${f.source_type})`)
  }

  private calculateSeverity(feedback: FeedbackItem): number {
    let severity = 1
    const content = (feedback.content + feedback.title).toLowerCase()
    const labels = feedback.metadata.labels || []

    // Critical indicators
    if (labels.includes('critical') || content.includes('security') || content.includes('vulnerability')) severity += 3
    if (content.includes('crash') || content.includes('data loss')) severity += 2
    if (labels.includes('blocking') || content.includes('blocking')) severity += 2
    if (feedback.metadata.priority === 'high' || labels.includes('high')) severity += 1

    // Source-based weighting
    if (feedback.source_type === 'bug-report') severity += 1
    if (feedback.source_type === 'security-researcher') severity += 2

    return Math.min(severity, 5) // Max severity of 5
  }

  private async extractAdvancedTrendingTopics(feedback: FeedbackItem[], env: any): Promise<string[]> {
    const recentFeedback = feedback.slice(-15) // More recent feedback
    const content = recentFeedback.map(f => `${f.source_type}: ${f.title} - ${f.content.substring(0, 100)}`).join(' | ')
    const truncatedContent = conservativeAI.truncateForAI(content, 1200)
    const estimatedTokens = conservativeAI.estimateTokens(truncatedContent)

    if (!this.freeTierManager.canMakeAIRequest(env, estimatedTokens)) {
      return ['Performance & Scalability Issues', 'Security Vulnerabilities', 'Multi-Platform Compatibility', 'Integration Capabilities', 'User Experience Improvements']
    }

    try {
      const model = conservativeAI.getModelForTask('summary')

      const aiResponse = await env.AI.run(model, {
        messages: [
          {
            role: 'system',
            content: 'Extract 5 key trending topics from network infrastructure feedback. Focus on themes, patterns, and emerging issues. Return as concise bullet points.'
          },
          {
            role: 'user',
            content: `Extract trending topics from this feedback data: ${truncatedContent}`
          }
        ],
        max_tokens: 100
      })

      this.freeTierManager.recordAITokensUsed(estimatedTokens)

      const response = aiResponse.response || ''
      const topics = response.split('\n').filter((line: string) => line.trim().startsWith('•') || line.trim().startsWith('-')).slice(0, 5)
      return topics.length > 0 ? topics : ['Performance & Scalability Issues', 'Security Vulnerabilities', 'Multi-Platform Compatibility', 'Integration Capabilities', 'User Experience Improvements']
    } catch (error: unknown) {
      return ['Performance & Scalability Issues', 'Security Vulnerabilities', 'Multi-Platform Compatibility', 'Integration Capabilities', 'User Experience Improvements']
    }
  }

  private async analyzeSentimentTrends(feedback: FeedbackItem[], env: any): Promise<any> {
    if (!this.freeTierManager.canMakeAIRequest(env, 2000)) {
      return { overall: 'neutral', trends: [] }
    }

    try {
      const recentFeedback = feedback.slice(-12)
      const contentSample = recentFeedback.map(f => `${f.source_type}: ${f.title}`).join('; ')

      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{
          role: 'system',
          content: 'Analyze sentiment trends in network infrastructure feedback. Return JSON with: overall_sentiment (positive/negative/neutral), key_concerns (array), positive_signals (array), urgency_level (high/medium/low).'
        }, {
          role: 'user',
          content: `Analyze sentiment in: ${contentSample}`
        }],
        max_tokens: 150
      })

      this.freeTierManager.recordAITokensUsed(2000)

      try {
        return JSON.parse(aiResponse.response || '{"overall":"neutral","key_concerns":[],"positive_signals":[],"urgency_level":"medium"}')
      } catch {
        return { overall: 'neutral', key_concerns: [], positive_signals: [], urgency_level: 'medium' }
      }
    } catch (error: unknown) {
      return { overall: 'neutral', key_concerns: [], positive_signals: [], urgency_level: 'medium' }
    }
  }

  private async generatePriorityMatrix(feedback: FeedbackItem[], env: any): Promise<any> {
    const categories = this.categorizeFeedbackAdvanced(feedback)

    return {
      urgent: categories.filter(c => c.priority === 'urgent'),
      high: categories.filter(c => c.priority === 'high'),
      medium: categories.filter(c => c.priority === 'medium'),
      low: categories.filter(c => c.priority === 'low')
    }
  }

  private categorizeFeedbackAdvanced(feedback: FeedbackItem[]): any[] {
    const categories: Record<string, any> = {}

    feedback.forEach(f => {
      const content = f.content.toLowerCase()
      const labels = f.metadata.labels || []

      // Security category
      if (content.includes('security') || content.includes('vulnerability') || labels.includes('security')) {
        this.addToCategory(categories, 'security', f, 'urgent')
      }

      // Performance category
      if (content.includes('performance') || content.includes('slow') || content.includes('cpu') || labels.includes('performance')) {
        this.addToCategory(categories, 'performance', f, 'high')
      }

      // Compatibility category
      if (content.includes('docker') || content.includes('arm64') || content.includes('ipv6') || labels.includes('compatibility')) {
        this.addToCategory(categories, 'compatibility', f, 'medium')
      }

      // Features category
      if (content.includes('feature') || content.includes('enhancement') || labels.includes('enhancement')) {
        this.addToCategory(categories, 'features', f, 'medium')
      }

      // Usability category
      if (content.includes('usability') || content.includes('ui') || content.includes('dashboard') || labels.includes('usability')) {
        this.addToCategory(categories, 'usability', f, 'low')
      }
    })

    return Object.values(categories)
  }

  private addToCategory(categories: Record<string, any>, category: string, feedback: FeedbackItem, priority: string) {
    if (!categories[category]) {
      categories[category] = {
        name: category,
        priority,
        count: 0,
        items: [],
        latestUpdate: feedback.created_at
      }
    }

    categories[category].count++
    categories[category].items.push(feedback.title)
    if (new Date(feedback.created_at) > new Date(categories[category].latestUpdate)) {
      categories[category].latestUpdate = feedback.created_at
    }
  }

  private async analyzeUserJourneys(feedback: FeedbackItem[], env: any): Promise<any> {
    const journeyMap = {
      'First Time Setup': feedback.filter(f => f.content.toLowerCase().includes('setup') || f.content.toLowerCase().includes('install') || f.content.toLowerCase().includes('deploy')),
      'Daily Usage': feedback.filter(f => f.content.toLowerCase().includes('dashboard') || f.content.toLowerCase().includes('monitoring') || f.content.toLowerCase().includes('daily')),
      'Troubleshooting': feedback.filter(f => f.content.toLowerCase().includes('error') || f.content.toLowerCase().includes('issue') || f.content.toLowerCase().includes('problem')),
      'Advanced Features': feedback.filter(f => f.content.toLowerCase().includes('prometheus') || f.content.toLowerCase().includes('integration') || f.content.toLowerCase().includes('api'))
    }

    return {
      journeyStages: Object.entries(journeyMap).map(([stage, items]) => ({
        stage,
        feedbackCount: items.length,
        satisfaction: this.calculateJourneySatisfaction(items)
      })),
      painPoints: this.identifyPainPoints(feedback),
      featureAdoption: this.analyzeFeatureAdoption(feedback)
    }
  }

  private calculateJourneySatisfaction(feedback: FeedbackItem[]): string {
    const positiveWords = ['great', 'excellent', 'love', 'amazing', 'perfect', 'smooth', 'easy']
    const negativeWords = ['frustrating', 'slow', 'confusing', 'broken', 'terrible', 'difficult', 'complex']

    const positive = feedback.filter(f =>
      positiveWords.some(word => f.content.toLowerCase().includes(word))
    ).length

    const negative = feedback.filter(f =>
      negativeWords.some(word => f.content.toLowerCase().includes(word))
    ).length

    if (positive > negative * 2) return 'high'
    if (negative > positive * 2) return 'low'
    return 'medium'
  }

  private identifyPainPoints(feedback: FeedbackItem[]): string[] {
    const painPointPatterns = [
      'slow', 'crashing', 'confusing', 'broken', 'missing', 'inconsistent',
      'unreliable', 'complex', 'difficult', 'frustrating', 'blocking', 'error'
    ]

    const painPoints: Record<string, number> = {}

    feedback.forEach(f => {
      const content = f.content.toLowerCase()
      painPointPatterns.forEach(pattern => {
        if (content.includes(pattern)) {
          painPoints[pattern] = (painPoints[pattern] || 0) + 1
        }
      })
    })

    return Object.entries(painPoints)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6)
      .map(([point, count]) => `${point} (${count} mentions)`)
  }

  private analyzeFeatureAdoption(feedback: FeedbackItem[]): any {
    const features = ['prometheus', 'snmp', 'dashboard', 'api', 'alerting', 'reporting', 'docker', 'kubernetes']

    return features.map(feature => ({
      feature,
      mentions: feedback.filter(f =>
        f.content.toLowerCase().includes(feature)
      ).length,
      sentiment: this.calculateFeatureSentiment(feedback, feature)
    })).filter(f => f.mentions > 0).sort((a, b) => b.mentions - a.mentions)
  }

  private calculateFeatureSentiment(feedback: FeedbackItem[], feature: string): string {
    const featureFeedback = feedback.filter(f =>
      f.content.toLowerCase().includes(feature)
    )

    const positive = featureFeedback.filter(f =>
      f.content.toLowerCase().includes('love') ||
      f.content.toLowerCase().includes('great') ||
      f.content.toLowerCase().includes('excellent') ||
      f.content.toLowerCase().includes('perfect')
    ).length

    const negative = featureFeedback.filter(f =>
      f.content.toLowerCase().includes('broken') ||
      f.content.toLowerCase().includes('slow') ||
      f.content.toLowerCase().includes('confusing') ||
      f.content.toLowerCase().includes('missing')
    ).length

    if (positive > negative) return 'positive'
    if (negative > positive) return 'negative'
    return 'neutral'
  }

  private async extractTrendingTopics(feedback: FeedbackItem[], env: any): Promise<string[]> {
    // Legacy method - keeping for backward compatibility
    return await this.extractAdvancedTrendingTopics(feedback, env)
  }

  private async generateAdvancedRecommendations(feedback: FeedbackItem[], sentimentAnalysis: any, env: any): Promise<string[]> {
    const feedbackSummary = feedback.slice(0, 10).map(f => `${f.source_type}: ${f.title} (${f.metadata.priority || 'medium'})`).join('; ')
    const context = `Sentiment: ${sentimentAnalysis.overall || 'neutral'}, Urgency: ${sentimentAnalysis.urgency_level || 'medium'}`
    const combinedInput = `${context}. Feedback: ${feedbackSummary}`

    const truncatedInput = conservativeAI.truncateForAI(combinedInput, 800)
    const estimatedTokens = conservativeAI.estimateTokens(truncatedInput)

    if (!this.freeTierManager.canMakeAIRequest(env, estimatedTokens)) {
      return [
        'Address critical security vulnerabilities immediately',
        'Implement performance optimizations for large-scale deployments',
        'Add comprehensive multi-platform support (ARM64, IPv6)',
        'Enhance user experience with improved dashboard usability',
        'Develop native integrations with popular monitoring platforms'
      ]
    }

    try {
      const model = conservativeAI.getModelForTask('summary')

      const aiResponse = await env.AI.run(model, {
        messages: [
          {
            role: 'system',
            content: 'Generate 5 strategic recommendations for network infrastructure improvements based on user feedback, sentiment, and priority analysis. Focus on actionable, high-impact changes. Return as concise bullet points.'
          },
          {
            role: 'user',
            content: `Generate strategic recommendations from: ${truncatedInput}`
          }
        ],
        max_tokens: 120
      })

      this.freeTierManager.recordAITokensUsed(estimatedTokens)

      const response = aiResponse.response || ''
      const recommendations = response.split('\n').filter((line: string) => line.trim().startsWith('•') || line.trim().startsWith('-')).slice(0, 5)
      return recommendations.length >= 3 ? recommendations : [
        'Address critical security vulnerabilities immediately',
        'Implement performance optimizations for large-scale deployments',
        'Add comprehensive multi-platform support (ARM64, IPv6)',
        'Enhance user experience with improved dashboard usability',
        'Develop native integrations with popular monitoring platforms'
      ]
    } catch (error: unknown) {
      return [
        'Address critical security vulnerabilities immediately',
        'Implement performance optimizations for large-scale deployments',
        'Add comprehensive multi-platform support (ARM64, IPv6)',
        'Enhance user experience with improved dashboard usability',
        'Develop native integrations with popular monitoring platforms'
      ]
    }
  }

  private async generateDynamicPriorityActions(feedback: FeedbackItem[], priorityMatrix: any, env: any): Promise<string[]> {
    const urgentCount = priorityMatrix.urgent?.length || 0
    const highCount = priorityMatrix.high?.length || 0
    const securityIssues = feedback.filter(f => f.content.toLowerCase().includes('security') || f.content.toLowerCase().includes('vulnerability')).length

    const actions = []

    // Critical security actions
    if (securityIssues > 0) {
      actions.push('🚨 CRITICAL: Address SQL injection and security vulnerabilities immediately')
      actions.push('🔒 Implement OAuth 2.0 authentication and authorization')
    }

    // Performance actions
    if (highCount > 2) {
      actions.push('⚡ Optimize performance for large network monitoring (>1000 devices)')
      actions.push('🧠 Fix memory leaks in SNMP polling processes')
    }

    // Compatibility actions
    const compatibilityIssues = feedback.filter(f =>
      f.content.toLowerCase().includes('docker') ||
      f.content.toLowerCase().includes('arm64') ||
      f.content.toLowerCase().includes('ipv6')
    ).length

    if (compatibilityIssues > 1) {
      actions.push('🐳 Add ARM64 Docker container support')
      actions.push('🌐 Implement IPv6 support for network discovery')
    }

    // Feature requests
    const featureRequests = feedback.filter(f =>
      f.content.toLowerCase().includes('prometheus') ||
      f.content.toLowerCase().includes('integration')
    ).length

    if (featureRequests > 1) {
      actions.push('📊 Add native Prometheus metrics export')
      actions.push('🔗 Develop ServiceNow bidirectional integration')
    }

    // Default actions if no specific issues
    if (actions.length < 3) {
      actions.push('📈 Enhance dashboard usability and navigation')
      actions.push('📱 Develop mobile application for network monitoring')
      actions.push('🔧 Implement NetFlow v9 export capabilities')
    }

    return actions.slice(0, 6) // Return top 6 actions
  }

  private async generateRecommendations(feedback: FeedbackItem[], env: any): Promise<string[]> {
    // Legacy method - keeping for backward compatibility
    return await this.generateAdvancedRecommendations(feedback, { overall: 'neutral', urgency_level: 'medium' }, env)
  }
}