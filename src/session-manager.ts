// Durable Object for managing user sessions and conversation context
// This adds another Cloudflare product to the stack

export interface SessionData {
  userId: string
  lastActivity: string
  conversationHistory: Array<{
    userMessage: string
    botResponse: string
    timestamp: string
  }>
  preferences: {
    detailLevel: 'brief' | 'detailed' | 'comprehensive'
    focusAreas: string[]
  }
}

export class SessionManager {
  private state: DurableObjectState
  private storage: DurableObjectStorage

  constructor(state: DurableObjectState) {
    this.state = state
    this.storage = state.storage
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (method === 'POST') {
      const data = await request.json() as { userId: string; userMessage?: string; botResponse?: string }

      if (url.pathname === '/get-context') {
        const context = await this.getConversationContext(data.userId)
        return new Response(JSON.stringify({ context }), {
          headers: { 'Content-Type': 'application/json' }
        })
      } else if (url.pathname === '/add-history') {
        await this.addToHistory(data.userId, data.userMessage!, data.botResponse!)
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response('Not found', { status: 404 })
  }

  async handleSession(sessionId: string): Promise<SessionData> {
    let session = await this.storage.get<SessionData>(`session:${sessionId}`)

    if (!session) {
      session = {
        userId: sessionId,
        lastActivity: new Date().toISOString(),
        conversationHistory: [],
        preferences: {
          detailLevel: 'detailed',
          focusAreas: ['performance', 'security', 'usability']
        }
      }
      await this.storage.put(`session:${sessionId}`, session)
    }

    // Update last activity
    session.lastActivity = new Date().toISOString()
    await this.storage.put(`session:${sessionId}`, session)

    return session
  }

  async addToHistory(sessionId: string, userMessage: string, botResponse: string): Promise<void> {
    const session = await this.handleSession(sessionId)
    session.conversationHistory.push({
      userMessage,
      botResponse,
      timestamp: new Date().toISOString()
    })

    // Keep only last 10 conversations
    if (session.conversationHistory.length > 10) {
      session.conversationHistory = session.conversationHistory.slice(-10)
    }

    await this.storage.put(`session:${sessionId}`, session)
  }

  async getConversationContext(sessionId: string): Promise<string> {
    const session = await this.handleSession(sessionId)
    const recentHistory = session.conversationHistory.slice(-3)

    if (recentHistory.length === 0) {
      return "New conversation session."
    }

    return recentHistory.map(h =>
      `User: ${h.userMessage}\nBot: ${h.botResponse}`
    ).join('\n\n')
  }

  async updatePreferences(sessionId: string, preferences: Partial<SessionData['preferences']>): Promise<void> {
    const session = await this.handleSession(sessionId)
    session.preferences = { ...session.preferences, ...preferences }
    await this.storage.put(`session:${sessionId}`, session)
  }

  async getAnalytics(): Promise<any> {
    // Get session analytics from storage
    const sessions = await this.storage.list({ prefix: 'session:' })
    const sessionData = Object.values(sessions) as SessionData[]

    return {
      totalSessions: sessionData.length,
      activeUsers: sessionData.filter(s => {
        const lastActivity = new Date(s.lastActivity)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        return lastActivity > oneHourAgo
      }).length,
      averageSessionLength: sessionData.reduce((acc, s) => acc + s.conversationHistory.length, 0) / sessionData.length,
      popularFocusAreas: this.calculatePopularFocusAreas(sessionData)
    }
  }

  private calculatePopularFocusAreas(sessions: SessionData[]): Record<string, number> {
    const areaCounts: Record<string, number> = {}

    sessions.forEach(session => {
      session.preferences.focusAreas.forEach(area => {
        areaCounts[area] = (areaCounts[area] || 0) + 1
      })
    })

    return areaCounts
  }
}