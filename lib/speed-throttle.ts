// Transfer speed throttling
export type SpeedLimit = 'unlimited' | '200kb' | '500kb' | '1mb' | '2mb'

export interface ThrottleConfig {
  limit: SpeedLimit
  bytesPerSecond: number
}

export class SpeedThrottle {
  private static readonly SPEED_LIMITS: Record<SpeedLimit, number> = {
    'unlimited': 0,
    '200kb': 200 * 1024,
    '500kb': 500 * 1024,
    '1mb': 1024 * 1024,
    '2mb': 2 * 1024 * 1024
  }

  private bytesPerSecond: number
  private lastSentTime: number = 0
  private bytesSentInWindow: number = 0
  private windowStart: number = 0
  private readonly windowSize: number = 1000 // 1 second window

  constructor(limit: SpeedLimit = 'unlimited') {
    this.bytesPerSecond = SpeedThrottle.SPEED_LIMITS[limit]
  }

  setLimit(limit: SpeedLimit): void {
    this.bytesPerSecond = SpeedThrottle.SPEED_LIMITS[limit]
    this.reset()
  }

  async throttle(dataSize: number): Promise<void> {
    if (this.bytesPerSecond === 0) {
      // No throttling
      return
    }

    const now = Date.now()

    // Reset window if needed
    if (now - this.windowStart >= this.windowSize) {
      this.windowStart = now
      this.bytesSentInWindow = 0
    }

    // Check if we need to wait
    const projectedBytes = this.bytesSentInWindow + dataSize
    const maxBytesInWindow = this.bytesPerSecond * (this.windowSize / 1000)

    if (projectedBytes > maxBytesInWindow) {
      // Calculate delay needed
      const excessBytes = projectedBytes - maxBytesInWindow
      const delayMs = (excessBytes / this.bytesPerSecond) * 1000

      await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 5000))) // Max 5s delay
      
      // Reset window after delay
      this.windowStart = Date.now()
      this.bytesSentInWindow = 0
    }

    this.bytesSentInWindow += dataSize
    this.lastSentTime = now
  }

  reset(): void {
    this.lastSentTime = 0
    this.bytesSentInWindow = 0
    this.windowStart = 0
  }

  getCurrentSpeed(): number {
    const now = Date.now()
    const windowElapsed = now - this.windowStart
    
    if (windowElapsed === 0) return 0
    
    return (this.bytesSentInWindow / windowElapsed) * 1000 // bytes per second
  }

  static getSpeedLimitOptions(): { value: SpeedLimit; label: string }[] {
    return [
      { value: 'unlimited', label: 'Unlimited' },
      { value: '200kb', label: '200 KB/s' },
      { value: '500kb', label: '500 KB/s' },
      { value: '1mb', label: '1 MB/s' },
      { value: '2mb', label: '2 MB/s' }
    ]
  }
}
