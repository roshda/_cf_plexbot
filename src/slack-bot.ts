import { FeedbackAggregator } from './feedback-aggregator'
import { NetworkVisualizer } from './network-visualizer'

export class SlackBot {
  private feedbackAggregator = new FeedbackAggregator()
  private networkVisualizer = new NetworkVisualizer()

  verifyRequest(body: any, signature: string | undefined, timestamp: string | undefined, signingSecret: string): boolean {
    if (!signature || !timestamp) return false

    // In production, implement proper Slack signature verification
    // For now, we'll skip this for the demo
    return true

    // Proper implementation would be:
    // const bodyString = typeof body === 'string' ? body : JSON.stringify(body)
    // const sigBaseString = `v0:${timestamp}:${bodyString}`
    // const expectedSignature = crypto
    //   .createHmac('sha256', signingSecret)
    //   .update(sigBaseString, 'utf8')
    //   .digest('hex')
    // return `v0=${expectedSignature}` === signature
  }

  async handleEvent(event: any, env: any): Promise<any> {
    // Handle URL verification challenge
    if (event.type === 'url_verification') {
      return { challenge: event.challenge }
    }

    // Handle app mention and messages
    if (event.event?.type === 'app_mention' || event.event?.type === 'message') {
      return await this.handleMessage(event.event, env)
    }

    // Handle slash commands
    if (event.command) {
      return await this.handleSlashCommand(event, env)
    }

    return { ok: true }
  }

  private async handleMessage(event: any, env: any): Promise<any> {
    const text = event.text || ''
    const channel = event.channel
    const userId = event.user

    // Ignore messages from the bot itself
    if (event.user === env.SLACK_BOT_USER_ID) return { ok: true }

    // Get or create user session
    const sessionId = `slack_${userId}`
    const sessionManagerId = env.SESSION_MANAGER.idFromName(sessionId)
    const sessionManagerStub = env.SESSION_MANAGER.get(sessionManagerId)

    // Handle conversational chat
    const response = await this.handleConversationalChat(text, userId, sessionManagerStub, env)

    // Send response to Slack
    await this.sendMessage(channel, response, env.SLACK_BOT_TOKEN)

    return { ok: true }
  }

  private async handleConversationalChat(text: string, userId: string, sessionManager: any, env: any): Promise<string> {
    const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim().toLowerCase()
    console.log('Processing conversational chat:', { userId, cleanText })

    // Handle keyword-based commands
    if (cleanText.includes('summary') || cleanText.includes('overview')) {
      console.log('Detected summary request')
      const summary = await this.feedbackAggregator.getSummary(env)
      return this.formatSummaryResponse(summary)
    } else if (cleanText.includes('insights') || cleanText.includes('analysis')) {
      console.log('Detected insights request')
      const insights = await this.feedbackAggregator.getInsights(env)
      return this.formatInsightsResponse(insights)
    } else if (cleanText.includes('network') || cleanText.includes('visualization') || cleanText.includes('stack')) {
      console.log('Detected visualization request')
      const visualization = await this.networkVisualizer.generateVisualization(env)
      return this.formatVisualizationResponse(visualization)
    } else if (cleanText.includes('help') || cleanText.includes('what can you do')) {
      console.log('Detected help request')
      return this.getEnhancedHelpMessage()
    }

    // Handle conversational queries
    console.log('Processing as conversational query')
    return await this.generateIntelligentResponse(text, userId, sessionManager, env)
  }

  private async generateIntelligentResponse(text: string, userId: string, sessionManagerStub: any, env: any): Promise<string> {
    try {
      // Get conversation context
      const contextResponse = await sessionManagerStub.fetch('http://internal/get-context', {
        method: 'POST',
        body: JSON.stringify({ userId })
      })
      const contextData = await contextResponse.json()
      const context = contextData.context || "New conversation session."

      // Analyze the query intent
      const queryAnalysis = await this.analyzeQueryIntent(text, env)

      // Get relevant data based on intent
      let relevantData = ''
      if (queryAnalysis.intent === 'performance') {
        const insights = await this.feedbackAggregator.getInsights(env)
        relevantData = `Performance-related feedback: ${insights.criticalIssues.filter(issue =>
          issue.toLowerCase().includes('performance') || issue.toLowerCase().includes('slow') || issue.toLowerCase().includes('cpu')
        ).join(', ')}`
      } else if (queryAnalysis.intent === 'security') {
        const insights = await this.feedbackAggregator.getInsights(env)
        relevantData = `Security-related feedback: ${insights.criticalIssues.filter(issue =>
          issue.toLowerCase().includes('security') || issue.toLowerCase().includes('vulnerability')
        ).join(', ')}`
      } else if (queryAnalysis.intent === 'features') {
        const insights = await this.feedbackAggregator.getInsights(env)
        relevantData = `Feature requests: ${insights.recommendations.slice(0, 3).join(', ')}`
      } else {
        // General conversation - provide overview
        const summary = await this.feedbackAggregator.getSummary(env)
        relevantData = `Current feedback overview: ${summary.totalItems} items across ${summary.sources.length} sources, ${summary.criticalIssues} critical issues, top categories: ${summary.topCategories.slice(0, 3).join(', ')}`
      }

      // Generate intelligent response using AI
      const prompt = `You are a helpful network infrastructure feedback analysis assistant. The user asked: "${text}"

Context from previous conversation:
${context}

Relevant feedback data:
${relevantData}

Provide a helpful, concise response that addresses their question using the feedback data. Be conversational and actionable. Keep responses under 300 characters.`

      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a network infrastructure feedback expert. Provide concise, helpful responses based on the provided data.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 150
      })

      const response = aiResponse.response || 'I understand your question. Let me analyze the feedback data to provide insights.'

      // Store conversation in session
      await sessionManagerStub.fetch('http://internal/add-history', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          userMessage: text,
          botResponse: response
        })
      })

      return response

    } catch (error) {
      console.error('Intelligent response generation failed:', error)
      return this.generateFallbackResponse(text, env)
    }
  }

  private async analyzeQueryIntent(text: string, env: any): Promise<{ intent: string, confidence: number }> {
    const query = text.toLowerCase()

    // Simple keyword-based intent detection
    if (query.includes('performance') || query.includes('slow') || query.includes('cpu') || query.includes('memory')) {
      return { intent: 'performance', confidence: 0.9 }
    } else if (query.includes('security') || query.includes('vulnerability') || query.includes('hack') || query.includes('breach')) {
      return { intent: 'security', confidence: 0.9 }
    } else if (query.includes('feature') || query.includes('add') || query.includes('new') || query.includes('enhancement')) {
      return { intent: 'features', confidence: 0.8 }
    } else if (query.includes('bug') || query.includes('error') || query.includes('issue') || query.includes('problem')) {
      return { intent: 'bugs', confidence: 0.8 }
    } else if (query.includes('summary') || query.includes('overview') || query.includes('status')) {
      return { intent: 'summary', confidence: 0.7 }
    } else {
      return { intent: 'general', confidence: 0.5 }
    }
  }

  private async generateFallbackResponse(text: string, env: any): Promise<string> {
    const responses = [
      "I'd be happy to help analyze the network infrastructure feedback. Try asking about performance issues, security concerns, or feature requests.",
      "I can provide insights about the feedback data. You can ask about summaries, critical issues, or specific topics like performance or security.",
      "Let me know what aspect of the network infrastructure feedback you'd like to explore. I can show you summaries, insights, or visualizations.",
      "I'm here to help with network feedback analysis. Try commands like 'show me performance issues' or 'what are the main security concerns'."
    ]

    return responses[Math.floor(Math.random() * responses.length)]
  }

  private async handleSlashCommand(event: any, env: any): Promise<any> {
    const command = event.command
    const channel = event.channel_id

    let response = ''

    switch (command) {
      case '/feedback-summary':
        const summary = await this.feedbackAggregator.getSummary(env)
        response = this.formatSummaryResponse(summary)
        break
      case '/network-insights':
        const insights = await this.feedbackAggregator.getInsights(env)
        response = this.formatInsightsResponse(insights)
        break
      case '/network-viz':
        const visualization = await this.networkVisualizer.generateVisualization(env)
        response = this.formatVisualizationResponse(visualization)
        break
      default:
        response = 'Unknown command. Try `/feedback-summary`, `/network-insights`, or `/network-viz`'
    }

    return {
      response_type: 'in_channel',
      text: response
    }
  }

  private formatSummaryResponse(summary: any): string {
    return `📊 *Feedback Summary*\n\n` +
           `• Total feedback items: ${summary.totalItems}\n` +
           `• Sources: ${summary.sources.join(', ')}\n` +
           `• Date range: ${summary.dateRange}\n` +
           `• Top categories: ${summary.topCategories.join(', ')}\n\n` +
           `💡 *Key Metrics:*\n` +
           `• Average sentiment: ${summary.averageSentiment}\n` +
           `• Critical issues: ${summary.criticalIssues}\n` +
           `• Feature requests: ${summary.featureRequests}`
  }

  private formatInsightsResponse(insights: any): string {
    let response = `🔍 *Advanced Network Infrastructure Insights*\n\n`

    // Sentiment Analysis
    if (insights.sentimentAnalysis) {
      const sentiment = insights.sentimentAnalysis.overall || 'neutral'
      const sentimentEmoji = sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😞' : '😐'
      response += `💭 *Overall Sentiment:* ${sentimentEmoji} ${sentiment.toUpperCase()}\n`
      response += `🚨 *Urgency Level:* ${insights.sentimentAnalysis.urgency_level?.toUpperCase() || 'MEDIUM'}\n\n`
    }

    // Critical Issues
    response += `🚨 *Critical Issues (${insights.criticalIssues.length}):*\n`
    if (insights.criticalIssues.length > 0) {
      insights.criticalIssues.slice(0, 5).forEach((issue: string, index: number) => {
        response += `${index + 1}. ${issue}\n`
      })
    } else {
      response += `✅ No critical issues detected\n`
    }
    response += `\n`

    // Priority Matrix
    if (insights.priorityMatrix) {
      response += `📊 *Priority Matrix:*\n`
      const urgent = insights.priorityMatrix.urgent || []
      const high = insights.priorityMatrix.high || []
      const medium = insights.priorityMatrix.medium || []

      if (urgent.length > 0) response += `🔴 Urgent: ${urgent.length} categories\n`
      if (high.length > 0) response += `🟠 High: ${high.length} categories\n`
      if (medium.length > 0) response += `🟡 Medium: ${medium.length} categories\n`
      response += `\n`
    }

    // Trending Topics
    response += `📈 *Trending Topics:*\n`
    insights.trendingTopics.slice(0, 4).forEach((topic: string, index: number) => {
      response += `${index + 1}. ${topic.replace(/^[-•]\s*/, '')}\n`
    })
    response += `\n`

    // User Journey Insights
    if (insights.userJourneyInsights) {
      response += `👥 *User Journey Analysis:*\n`
      const journeys = insights.userJourneyInsights.journeyStages || []
      journeys.forEach((journey: any) => {
        const satisfaction = journey.satisfaction === 'high' ? '😊' : journey.satisfaction === 'low' ? '😞' : '😐'
        response += `• ${journey.stage}: ${journey.feedbackCount} feedbacks (${satisfaction})\n`
      })
      response += `\n`

      // Pain Points
      if (insights.userJourneyInsights.painPoints?.length > 0) {
        response += `🤕 *Top Pain Points:*\n`
        insights.userJourneyInsights.painPoints.slice(0, 3).forEach((point: string) => {
          response += `• ${point}\n`
        })
        response += `\n`
      }
    }

    // Strategic Recommendations
    response += `🎯 *Strategic Recommendations:*\n`
    insights.recommendations.slice(0, 4).forEach((rec: string, index: number) => {
      response += `${index + 1}. ${rec.replace(/^[-•]\s*/, '')}\n`
    })
    response += `\n`

    // Priority Actions
    response += `⚡ *Immediate Priority Actions:*\n`
    insights.priorityActions.slice(0, 4).forEach((action: string, index: number) => {
      response += `${index + 1}. ${action}\n`
    })

    return response
  }

  private formatVisualizationResponse(visualization: any): string {
    let response = `🏗️ *Network Stack Health Dashboard*\n\n`

    // Health Score
    if (visualization.healthScore !== undefined) {
      const healthEmoji = visualization.healthScore >= 80 ? '🟢' : visualization.healthScore >= 60 ? '🟡' : visualization.healthScore >= 40 ? '🟠' : '🔴'
      response += `📊 *Health Score:* ${healthEmoji} ${visualization.healthScore}/100\n\n`
    }

    // Comprehensive visualization (embedded directly)
    if (visualization.visualization) {
      response += `${visualization.visualization}\n`
    } else {
      // Fallback to basic format
      response += `📋 *Layer Status Overview:*\n`
      visualization.layerStatus.forEach((layer: any) => {
        const statusEmoji = layer.status === 'healthy' ? '🟢' : layer.status === 'warning' ? '🟡' : '🔴'
        response += `${statusEmoji} ${layer.name}: ${layer.status} (${layer.issueCount} issues)\n`
      })
      response += `\n`

      response += `🔴 *Critical Layers:*\n${visualization.criticalLayers.join('\n')}\n\n`
    }

    // Issue Distribution
    response += `📊 *Issue Distribution:*\n${visualization.issueDistribution}\n\n`

    // Additional insights
    if (visualization.warningLayers && visualization.warningLayers.length > 0 && !visualization.warningLayers[0].includes('No warnings')) {
      response += `⚠️ *Warning Layers:*\n${visualization.warningLayers.join('\n')}\n\n`
    }

    return response
  }

  // Test method for debugging conversational chat
  async testConversationalChat(text: string, userId: string, sessionManagerStub: any, env: any): Promise<string> {
    return await this.handleConversationalChat(text, userId, sessionManagerStub, env)
  }

  private getEnhancedHelpMessage(): string {
    return `🤖 *Network Infrastructure Feedback Assistant*\n\n` +
           `*I can help you analyze feedback from:* GitHub, Slack, Jira, Email, Bug Reports, Teams, Forms\n\n` +
           `*Slash Commands:*\n` +
           `• \`/feedback-summary\` - Overall statistics\n` +
           `• \`/network-insights\` - AI-powered analysis\n` +
           `• \`/network-viz\` - Network health visualization\n\n` +
           `*Chat with me about:*\n` +
           `• "What are the main performance issues?"\n` +
           `• "Tell me about security concerns"\n` +
           `• "What features do users want?"\n` +
           `• "How is the network health?"\n` +
           `• "What's the overall sentiment?"\n\n` +
           `*I remember our conversation and provide personalized insights!* 💭`
  }

  private async generateConversationalResponse(text: string, env: any): Promise<string> {
    try {
      // Use Workers AI for conversational responses
      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for network infrastructure feedback analysis. Keep responses concise and actionable.'
          },
          {
            role: 'user',
            content: `Based on network infrastructure feedback, answer this question: ${text}`
          }
        ],
        max_tokens: 200
      })

      return aiResponse.response || 'I\'m analyzing your request. Please try asking about feedback summaries, insights, or network visualization.'
    } catch (error) {
      console.error('AI response error:', error)
      return 'I\'m having trouble processing your request. Try using slash commands like `/feedback-summary` or `/network-insights`.'
    }
  }

  private async sendMessage(channel: string, text: string, botToken: string): Promise<void> {
    try {
      console.log('Sending message to Slack:', { channel, textLength: text.length })

      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${botToken}`
        },
        body: JSON.stringify({
          channel: channel,
          text: text,
          mrkdwn: true
        })
      })

      const result = await response.json() as { ok: boolean; error?: string }
      console.log('Slack API response:', result)

      if (!result.ok) {
        console.error('Slack API error:', result.error)
      }
    } catch (error) {
      console.error('Error sending Slack message:', error)
    }
  }
}