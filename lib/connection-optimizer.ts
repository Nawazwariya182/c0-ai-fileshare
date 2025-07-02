// New utility for connection optimization
export class ConnectionOptimizer {
  private static instance: ConnectionOptimizer
  private connectionQuality: 'excellent' | 'good' | 'poor' = 'good'
  private lastLatency: number = 0
  private throughputHistory: number[] = []

  static getInstance(): ConnectionOptimizer {
    if (!ConnectionOptimizer.instance) {
      ConnectionOptimizer.instance = new ConnectionOptimizer()
    }
    return ConnectionOptimizer.instance
  }

  // Optimize chunk size based on connection quality
  getOptimalChunkSize(): number {
    switch (this.connectionQuality) {
      case 'excellent':
        return 262144 // 256KB for excellent connections
      case 'good':
        return 131072 // 128KB for good connections
      case 'poor':
        return 65536  // 64KB for poor connections
      default:
        return 131072
    }
  }

  // Get optimal buffer threshold
  getOptimalBufferThreshold(): number {
    switch (this.connectionQuality) {
      case 'excellent':
        return 262144 // 256KB
      case 'good':
        return 131072 // 128KB
      case 'poor':
        return 65536  // 64KB
      default:
        return 131072
    }
  }

  // Update connection quality based on performance metrics
  updateConnectionQuality(latency: number, throughput: number) {
    this.lastLatency = latency
    this.throughputHistory.push(throughput)
    
    // Keep only last 10 measurements
    if (this.throughputHistory.length > 10) {
      this.throughputHistory.shift()
    }

    const avgThroughput = this.throughputHistory.reduce((a, b) => a + b, 0) / this.throughputHistory.length

    // Determine connection quality
    if (latency < 50 && avgThroughput > 10240000) { // < 50ms latency, > 1MB/s
      this.connectionQuality = 'excellent'
    } else if (latency < 200 && avgThroughput > 500000) { // < 200ms latency, > 500KB/s
      this.connectionQuality = 'good'
    } else {
      this.connectionQuality = 'poor'
    }

    console.log(`📊 Connection quality: ${this.connectionQuality} (latency: ${latency}ms, throughput: ${(avgThroughput / 1024 / 1024).toFixed(2)}MB/s)`)
  }

  // Get connection statistics
  getStats() {
    return {
      quality: this.connectionQuality,
      latency: this.lastLatency,
      avgThroughput: this.throughputHistory.reduce((a, b) => a + b, 0) / this.throughputHistory.length,
      optimalChunkSize: this.getOptimalChunkSize(),
      optimalBufferThreshold: this.getOptimalBufferThreshold()
    }
  }
}
