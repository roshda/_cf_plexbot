// Free Tier Optimization Strategies for Cloudflare Products
// Limits as of 2026-01-28

export const CLOUDFLARE_LIMITS = {
  // Workers AI: 100,000 tokens per day
  AI_TOKENS_PER_DAY: 100000,
  AI_RESERVED_TOKENS: 10000, // Keep 10% in reserve

  // D1: 500,000 rows read per month, 100,000 rows written per month
  D1_ROWS_READ_MONTHLY: 500000,
  D1_ROWS_WRITTEN_MONTHLY: 100000,
  D1_RESERVED_READS: 50000, // Keep 10% in reserve
  D1_RESERVED_WRITES: 10000,

  // KV: 100,000 reads per day, 1,000 writes per day
  KV_READS_DAILY: 100000,
  KV_WRITES_DAILY: 1000,
  KV_RESERVED_READS: 10000,
  KV_RESERVED_WRITES: 100,

  // R2: 10 GB storage, 100,000 operations per month
  R2_STORAGE_GB: 10,
  R2_OPERATIONS_MONTHLY: 100000,
  R2_RESERVED_OPERATIONS: 10000,

  // Workers: 100,000 requests per day
  WORKERS_REQUESTS_DAILY: 100000,
  WORKERS_RESERVED_REQUESTS: 10000
}

export class FreeTierManager {
  private static instance: FreeTierManager
  private usageCache: Map<string, { count: number, resetTime: number }> = new Map()

  static getInstance(): FreeTierManager {
    if (!FreeTierManager.instance) {
      FreeTierManager.instance = new FreeTierManager()
    }
    return FreeTierManager.instance
  }

  // Check if we can make an AI request
  canMakeAIRequest(env: any, estimatedTokens: number = 1000): boolean {
    const key = 'ai:tokens:used'
    const now = Date.now()
    const dayStart = new Date().setHours(0, 0, 0, 0)

    // Reset counter if it's a new day
    if (this.usageCache.get(key)?.resetTime !== dayStart) {
      this.usageCache.set(key, { count: 0, resetTime: dayStart })
    }

    const currentUsage = this.usageCache.get(key)?.count || 0
    return (currentUsage + estimatedTokens) < (CLOUDFLARE_LIMITS.AI_TOKENS_PER_DAY - CLOUDFLARE_LIMITS.AI_RESERVED_TOKENS)
  }

  // Record AI token usage
  recordAITokensUsed(tokens: number): void {
    const key = 'ai:tokens:used'
    const dayStart = new Date().setHours(0, 0, 0, 0)

    const current = this.usageCache.get(key)
    if (!current || current.resetTime !== dayStart) {
      this.usageCache.set(key, { count: tokens, resetTime: dayStart })
    } else {
      current.count += tokens
    }
  }

  // Check if we can read from D1
  canReadFromD1(estimatedRows: number = 1): boolean {
    const key = 'd1:reads:used'
    const now = Date.now()
    const monthStart = new Date(now - (now % (30 * 24 * 60 * 60 * 1000))).getTime()

    if (this.usageCache.get(key)?.resetTime !== monthStart) {
      this.usageCache.set(key, { count: 0, resetTime: monthStart })
    }

    const currentUsage = this.usageCache.get(key)?.count || 0
    return (currentUsage + estimatedRows) < (CLOUDFLARE_LIMITS.D1_ROWS_READ_MONTHLY - CLOUDFLARE_LIMITS.D1_RESERVED_READS)
  }

  // Check if we can write to D1
  canWriteToD1(estimatedRows: number = 1): boolean {
    const key = 'd1:writes:used'
    const now = Date.now()
    const monthStart = new Date(now - (now % (30 * 24 * 60 * 60 * 1000))).getTime()

    if (this.usageCache.get(key)?.resetTime !== monthStart) {
      this.usageCache.set(key, { count: 0, resetTime: monthStart })
    }

    const currentUsage = this.usageCache.get(key)?.count || 0
    return (currentUsage + estimatedRows) < (CLOUDFLARE_LIMITS.D1_ROWS_WRITTEN_MONTHLY - CLOUDFLARE_LIMITS.D1_RESERVED_WRITES)
  }

  // Check if we can read from KV
  canReadFromKV(): boolean {
    const key = 'kv:reads:used'
    const dayStart = new Date().setHours(0, 0, 0, 0)

    if (this.usageCache.get(key)?.resetTime !== dayStart) {
      this.usageCache.set(key, { count: 0, resetTime: dayStart })
    }

    const currentUsage = this.usageCache.get(key)?.count || 0
    return currentUsage < (CLOUDFLARE_LIMITS.KV_READS_DAILY - CLOUDFLARE_LIMITS.KV_RESERVED_READS)
  }

  // Check if we can write to KV
  canWriteToKV(): boolean {
    const key = 'kv:writes:used'
    const dayStart = new Date().setHours(0, 0, 0, 0)

    if (this.usageCache.get(key)?.resetTime !== dayStart) {
      this.usageCache.set(key, { count: 0, resetTime: dayStart })
    }

    const currentUsage = this.usageCache.get(key)?.count || 0
    return currentUsage < (CLOUDFLARE_LIMITS.KV_WRITES_DAILY - CLOUDFLARE_LIMITS.KV_RESERVED_WRITES)
  }

  // Get usage statistics for monitoring
  getUsageStats(): Record<string, any> {
    return {
      ai: {
        tokensUsed: this.usageCache.get('ai:tokens:used')?.count || 0,
        limit: CLOUDFLARE_LIMITS.AI_TOKENS_PER_DAY,
        remaining: CLOUDFLARE_LIMITS.AI_TOKENS_PER_DAY - (this.usageCache.get('ai:tokens:used')?.count || 0)
      },
      d1: {
        readsUsed: this.usageCache.get('d1:reads:used')?.count || 0,
        writesUsed: this.usageCache.get('d1:writes:used')?.count || 0,
        readLimit: CLOUDFLARE_LIMITS.D1_ROWS_READ_MONTHLY,
        writeLimit: CLOUDFLARE_LIMITS.D1_ROWS_WRITTEN_MONTHLY
      },
      kv: {
        readsUsed: this.usageCache.get('kv:reads:used')?.count || 0,
        writesUsed: this.usageCache.get('kv:writes:used')?.count || 0,
        readLimit: CLOUDFLARE_LIMITS.KV_READS_DAILY,
        writeLimit: CLOUDFLARE_LIMITS.KV_WRITES_DAILY
      }
    }
  }
}

// Utility functions for conservative resource usage
export const conservativeAI = {
  // Use smaller models for simple tasks
  getModelForTask: (task: string) => {
    if (task === 'sentiment') return '@cf/meta/llama-3.1-8b-instruct'
    if (task === 'summary') return '@cf/meta/llama-3.1-8b-instruct'
    return '@cf/meta/llama-3.1-8b-instruct' // Default to 8B model for free tier
  },

  // Limit input text length
  truncateForAI: (text: string, maxLength: number = 2000) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  },

  // Conservative token estimation
  estimateTokens: (text: string) => {
    return Math.ceil(text.length / 4) // Rough estimate: 1 token ≈ 4 characters
  }
}

export const conservativeDB = {
  // Use batch operations when possible
  batchSize: 10,

  // Limit query result sets
  maxResults: 100,

  // Use efficient queries with indexes
  optimizedQueries: {
    recentFeedback: `
      SELECT * FROM feedback
      WHERE created_at_timestamp > ?
      ORDER BY created_at_timestamp DESC
      LIMIT ?
    `,
    feedbackBySource: `
      SELECT COUNT(*) as count, source_type
      FROM feedback
      GROUP BY source_type
    `
  }
}

export const conservativeCache = {
  // Longer TTL for stable data
  summaryTTL: 300, // 5 minutes
  insightsTTL: 600, // 10 minutes
  visualizationTTL: 600, // 10 minutes

  // Cache keys follow a pattern
  keyPatterns: {
    summary: 'feedback:summary',
    insights: 'feedback:insights',
    visualization: 'network:visualization',
    usage: 'usage:stats'
  }
}