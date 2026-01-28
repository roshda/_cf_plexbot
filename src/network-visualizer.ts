interface NetworkLayer {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  issueCount: number
  description: string
}

interface NetworkVisualization {
  layerStatus: NetworkLayer[]
  criticalLayers: string[]
  issueDistribution: string
  visualizationUrl: string
  lastUpdated: string
}

export class NetworkVisualizer {
  private readonly CACHE_TTL = 600 // 10 minutes

  async generateVisualization(env: any): Promise<NetworkVisualization> {
    // Check cache first
    const cacheKey = 'network:visualization:v2' // Updated cache key to force refresh
    const cached = await env.CACHE.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    // Get feedback data
    const feedback = await this.getNetworkFeedback(env)

    // Analyze network layers
    const layers = await this.analyzeNetworkLayers(feedback, env)

    // Generate visualization data
    const visualization = this.createVisualizationData(layers)

    // Cache result
    await env.CACHE.put(cacheKey, JSON.stringify(visualization), { expirationTtl: this.CACHE_TTL })

    return visualization
  }

  private async getNetworkFeedback(env: any): Promise<any[]> {
    try {
      // Get network-related feedback from D1
      const result = await env.FEEDBACK_DB.prepare(`
        SELECT * FROM feedback
        WHERE content LIKE '%network%' OR content LIKE '%connectivity%' OR content LIKE '%interface%'
        OR metadata LIKE '%network%' OR metadata LIKE '%interface%'
        ORDER BY created_at DESC
      `).all()

      return result.results || []
    } catch (error) {
      // Fallback: filter from aggregated feedback
      const aggregator = (await import('./feedback-aggregator')).FeedbackAggregator
      const allFeedback = await new aggregator().aggregateAllFeedback(env)
      return allFeedback.filter(f =>
        f.content.toLowerCase().includes('network') ||
        f.content.toLowerCase().includes('connectivity') ||
        f.content.toLowerCase().includes('interface') ||
        f.metadata.labels?.some((label: string) => label.includes('network'))
      )
    }
  }

  private async analyzeNetworkLayers(feedback: any[], env: any): Promise<NetworkLayer[]> {
    const layers: Record<string, NetworkLayer> = {
      'Physical Layer': { name: 'Physical Layer', status: 'healthy', issueCount: 0, description: 'Cabling, connectors, signal transmission' },
      'Data Link Layer': { name: 'Data Link Layer', status: 'healthy', issueCount: 0, description: 'MAC addresses, switches, VLANs' },
      'Network Layer': { name: 'Network Layer', status: 'healthy', issueCount: 0, description: 'IP addressing, routing, subnetting' },
      'Transport Layer': { name: 'Transport Layer', status: 'healthy', issueCount: 0, description: 'TCP/UDP, port management, QoS' },
      'Session Layer': { name: 'Session Layer', status: 'healthy', issueCount: 0, description: 'Session management, authentication' },
      'Presentation Layer': { name: 'Presentation Layer', status: 'healthy', issueCount: 0, description: 'Data formatting, encryption' },
      'Application Layer': { name: 'Application Layer', status: 'healthy', issueCount: 0, description: 'HTTP, DNS, monitoring protocols' }
    }

    // Analyze feedback for each layer
    feedback.forEach(item => {
      const content = (item.content || item.title || '').toLowerCase()
      const metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata

      // Physical Layer issues
      if (content.includes('cable') || content.includes('connector') || content.includes('fiber') ||
          content.includes('physical') || content.includes('hardware')) {
        layers['Physical Layer'].issueCount++
      }

      // Data Link Layer issues
      if (content.includes('mac') || content.includes('switch') || content.includes('vlan') ||
          content.includes('bridge') || content.includes('ethernet')) {
        layers['Data Link Layer'].issueCount++
      }

      // Network Layer issues
      if (content.includes('ip') || content.includes('routing') || content.includes('subnet') ||
          content.includes('arp') || content.includes('icmp') || content.includes('ipv6')) {
        layers['Network Layer'].issueCount++
      }

      // Transport Layer issues
      if (content.includes('tcp') || content.includes('udp') || content.includes('port') ||
          content.includes('qos') || content.includes('congestion')) {
        layers['Transport Layer'].issueCount++
      }

      // Application Layer issues
      if (content.includes('http') || content.includes('dns') || content.includes('snmp') ||
          content.includes('monitoring') || content.includes('prometheus')) {
        layers['Application Layer'].issueCount++
      }

      // Security issues affect multiple layers
      if (content.includes('security') || content.includes('vulnerability') ||
          content.includes('injection') || content.includes('attack')) {
        layers['Session Layer'].issueCount++
        layers['Presentation Layer'].issueCount++
      }
    })

    // Determine status based on issue count
    Object.values(layers).forEach(layer => {
      if (layer.issueCount >= 5) {
        layer.status = 'critical'
      } else if (layer.issueCount >= 2) {
        layer.status = 'warning'
      }
    })

    return Object.values(layers)
  }

  private createVisualizationData(layers: NetworkLayer[]): NetworkVisualization {
    const criticalLayers = layers
      .filter(layer => layer.status === 'critical')
      .map(layer => `🚨 ${layer.name}: ${layer.issueCount} issues`)

    const warningLayers = layers
      .filter(layer => layer.status === 'warning')
      .map(layer => `⚠️ ${layer.name}: ${layer.issueCount} issues`)

    const issueDistribution = layers
      .map(layer => `${layer.name}: ${layer.issueCount}`)
      .join(', ')

    // Generate comprehensive visualization directly in Slack
    const comprehensiveVisualization = this.generateComprehensiveVisualization(layers)

    return {
      layerStatus: layers,
      criticalLayers: criticalLayers.length > 0 ? criticalLayers : ['✅ No critical issues detected'],
      warningLayers: warningLayers.length > 0 ? warningLayers : ['✅ No warnings detected'],
      issueDistribution,
      visualization: comprehensiveVisualization,
      lastUpdated: new Date().toISOString(),
      healthScore: this.calculateHealthScore(layers)
    } as any
  }

  private calculateHealthScore(layers: NetworkLayer[]): number {
    const totalIssues = layers.reduce((sum, layer) => sum + layer.issueCount, 0)
    const criticalCount = layers.filter(l => l.status === 'critical').length
    const warningCount = layers.filter(l => l.status === 'warning').length

    // Health score calculation (0-100)
    let score = 100 - (totalIssues * 5) - (criticalCount * 15) - (warningCount * 5)
    return Math.max(0, Math.min(100, score))
  }

  private generateComprehensiveVisualization(layers: NetworkLayer[]): string {
    const statusIcons = {
      healthy: '🟢',
      warning: '🟡',
      critical: '🔴'
    }

    const healthScore = this.calculateHealthScore(layers)
    const overallStatus = healthScore >= 80 ? '🟢 EXCELLENT' : healthScore >= 60 ? '🟡 GOOD' : healthScore >= 40 ? '🟠 FAIR' : '🔴 POOR'

    let visualization = `🏗️ *Network Stack Health Visualization*\n`
    visualization += `═══════════════════════════════════════\n\n`

    // Overall health summary
    visualization += `📊 *Overall Health:* ${overallStatus} (${healthScore}/100)\n\n`

    // Layer-by-layer breakdown
    visualization += `🔍 *Layer Analysis:*\n`
    layers.forEach((layer, index) => {
      const icon = statusIcons[layer.status]
      const issues = layer.issueCount > 0 ? ` (${layer.issueCount} issues)` : ' (healthy)'
      visualization += `${icon} ${layer.name}${issues}\n`

      // Add connection line (except for last layer)
      if (index < layers.length - 1) {
        visualization += `   │\n`
      }
    })

    visualization += `\n📈 *Issue Summary:*\n`
    const criticalCount = layers.filter(l => l.status === 'critical').length
    const warningCount = layers.filter(l => l.status === 'warning').length
    const healthyCount = layers.filter(l => l.status === 'healthy').length

    visualization += `🔴 Critical: ${criticalCount} layers\n`
    visualization += `🟡 Warning: ${warningCount} layers\n`
    visualization += `🟢 Healthy: ${healthyCount} layers\n\n`

    // Recommendations based on health
    visualization += `💡 *Recommendations:*\n`
    if (healthScore >= 80) {
      visualization += `✅ Network stack is in excellent condition\n`
      visualization += `🔄 Continue monitoring and maintenance\n`
    } else if (healthScore >= 60) {
      visualization += `⚠️ Address warning-level issues\n`
      visualization += `📈 Consider performance optimizations\n`
    } else {
      visualization += `🚨 Immediate attention required\n`
      visualization += `🔧 Focus on critical infrastructure issues\n`
    }

    visualization += `\n⏰ *Last updated:* ${new Date().toLocaleString()}\n`

    return visualization
  }

  private generateASCIIVisualization(layers: NetworkLayer[]): string {
    const statusSymbols = {
      healthy: '🟢',
      warning: '🟡',
      critical: '🔴'
    }

    let visualization = '```\nNetwork Stack Health Visualization\n'
    visualization += '=' .repeat(40) + '\n\n'

    layers.forEach((layer, index) => {
      const symbol = statusSymbols[layer.status]
      const issues = layer.issueCount > 0 ? ` (${layer.issueCount} issues)` : ''
      visualization += `${symbol} ${layer.name}${issues}\n`

      // Add connecting line (except for last layer)
      if (index < layers.length - 1) {
        visualization += '   │\n'
      }
    })

    visualization += '\n```\n'
    visualization += '*Legend:* 🟢 Healthy | 🟡 Warning | 🔴 Critical\n'
    visualization += `*Last updated: ${new Date().toLocaleString()}*`

    return visualization
  }
}