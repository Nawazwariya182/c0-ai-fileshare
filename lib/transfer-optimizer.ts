export interface TransferStats {
  bytesTransferred: number
  totalBytes: number
  speed: number
  eta: number
  packetsLost: number
  retransmissions: number
  efficiency: number
}

export interface ChunkMetadata {
  id: number
  size: number
  checksum: string
  priority: number
  attempts: number
  timestamp: number
}

export class TransferOptimizer {
  private chunkSize: number = 65536 // Start with 64KB
  private maxChunkSize: number = 1048576 // Max 1MB
  private minChunkSize: number = 16384 // Min 16KB
  private concurrentChunks: number = 8 // Start with 8 concurrent chunks
  private maxConcurrentChunks: number = 32
  private minConcurrentChunks: number = 2
  
  private windowSize: number = 16 // Sliding window size
  private congestionWindow: number = 8
  private slowStartThreshold: number = 16
  private inSlowStart: boolean = true
  
  private rtt: number = 100 // Round trip time in ms
  private rttVariance: number = 50
  private packetLoss: number = 0
  private bandwidth: number = 0 // Bytes per second
  
  private lastAdjustment: number = Date.now()
  private adjustmentInterval: number = 1000 // 1 second
  
  private stats: TransferStats = {
    bytesTransferred: 0,
    totalBytes: 0,
    speed: 0,
    eta: 0,
    packetsLost: 0,
    retransmissions: 0,
    efficiency: 100
  }

  constructor() {
    this.detectOptimalSettings()
  }

  private detectOptimalSettings() {
    // Detect connection type and adjust initial settings
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    
    if (connection) {
      const effectiveType = connection.effectiveType
      const downlink = connection.downlink || 10 // Mbps
      
      console.log(`🔍 Detected connection: ${effectiveType}, ${downlink} Mbps`)
      
      switch (effectiveType) {
        case '4g':
          this.chunkSize = 131072 // 128KB
          this.concurrentChunks = 16
          this.windowSize = 24
          break
        case '3g':
          this.chunkSize = 65536 // 64KB
          this.concurrentChunks = 8
          this.windowSize = 12
          break
        case '2g':
          this.chunkSize = 32768 // 32KB
          this.concurrentChunks = 4
          this.windowSize = 6
          break
        default: // wifi or unknown
          this.chunkSize = 262144 // 256KB
          this.concurrentChunks = 24
          this.windowSize = 32
      }
      
      // Adjust based on downlink speed
      if (downlink > 50) {
        this.chunkSize = Math.min(this.chunkSize * 2, this.maxChunkSize)
        this.concurrentChunks = Math.min(this.concurrentChunks * 2, this.maxConcurrentChunks)
      } else if (downlink < 5) {
        this.chunkSize = Math.max(this.chunkSize / 2, this.minChunkSize)
        this.concurrentChunks = Math.max(this.concurrentChunks / 2, this.minConcurrentChunks)
      }
    }
    
    console.log(`🚀 Initial settings: chunk=${this.chunkSize}, concurrent=${this.concurrentChunks}, window=${this.windowSize}`)
  }

  public getOptimalChunkSize(): number {
    return this.chunkSize
  }

  public getConcurrentChunks(): number {
    return this.concurrentChunks
  }

  public getWindowSize(): number {
    return this.windowSize
  }

  public updateRTT(newRTT: number) {
    // Exponential weighted moving average
    const alpha = 0.125
    const beta = 0.25
    
    const sampleRTT = newRTT
    this.rtt = (1 - alpha) * this.rtt + alpha * sampleRTT
    this.rttVariance = (1 - beta) * this.rttVariance + beta * Math.abs(sampleRTT - this.rtt)
    
    // Adjust timeout based on RTT
    const timeout = this.rtt + 4 * this.rttVariance
    this.adjustCongestionControl()
  }

  public reportPacketLoss(lost: number, total: number) {
    this.packetLoss = lost / total
    this.stats.packetsLost += lost
    
    if (this.packetLoss > 0.01) { // More than 1% loss
      this.handleCongestion()
    }
  }

  public reportSuccessfulTransmission(bytes: number, duration: number) {
    this.bandwidth = bytes / (duration / 1000) // bytes per second
    this.stats.bytesTransferred += bytes
    this.stats.speed = this.bandwidth
    
    if (this.stats.totalBytes > 0) {
      const remaining = this.stats.totalBytes - this.stats.bytesTransferred
      this.stats.eta = remaining / this.bandwidth
      this.stats.efficiency = (this.stats.bytesTransferred / (this.stats.bytesTransferred + this.stats.retransmissions * this.chunkSize)) * 100
    }
    
    // Increase congestion window on success
    if (this.inSlowStart) {
      this.congestionWindow += 1
      if (this.congestionWindow >= this.slowStartThreshold) {
        this.inSlowStart = false
      }
    } else {
      this.congestionWindow += 1 / this.congestionWindow // Additive increase
    }
    
    this.adjustParameters()
  }

  private handleCongestion() {
    console.log('🚨 Congestion detected, adjusting parameters')
    
    // Multiplicative decrease
    this.slowStartThreshold = Math.max(this.congestionWindow / 2, 2)
    this.congestionWindow = this.slowStartThreshold
    this.inSlowStart = false
    
    // Reduce chunk size and concurrent transfers
    this.chunkSize = Math.max(this.chunkSize * 0.75, this.minChunkSize)
    this.concurrentChunks = Math.max(this.concurrentChunks * 0.75, this.minConcurrentChunks)
    
    this.stats.retransmissions++
  }

  private adjustCongestionControl() {
    this.concurrentChunks = Math.min(this.congestionWindow, this.maxConcurrentChunks)
    this.windowSize = Math.max(this.concurrentChunks * 2, 8)
  }

  private adjustParameters() {
    const now = Date.now()
    if (now - this.lastAdjustment < this.adjustmentInterval) {
      return
    }
    
    this.lastAdjustment = now
    
    // Adaptive chunk size based on RTT and bandwidth
    const optimalChunkSize = Math.min(
      this.bandwidth * (this.rtt / 1000) * 2, // 2x bandwidth-delay product
      this.maxChunkSize
    )
    
    if (optimalChunkSize > this.chunkSize * 1.5 && this.packetLoss < 0.005) {
      // Increase chunk size if network can handle it
      this.chunkSize = Math.min(this.chunkSize * 1.25, this.maxChunkSize)
      console.log(`📈 Increased chunk size to ${this.chunkSize}`)
    } else if (optimalChunkSize < this.chunkSize * 0.5 || this.packetLoss > 0.02) {
      // Decrease chunk size if network is struggling
      this.chunkSize = Math.max(this.chunkSize * 0.8, this.minChunkSize)
      console.log(`📉 Decreased chunk size to ${this.chunkSize}`)
    }
    
    // Adjust concurrent chunks based on performance
    if (this.bandwidth > 0 && this.packetLoss < 0.01) {
      const targetConcurrency = Math.min(
        Math.ceil(this.bandwidth / (this.chunkSize / (this.rtt / 1000))),
        this.maxConcurrentChunks
      )
      
      if (targetConcurrency > this.concurrentChunks) {
        this.concurrentChunks = Math.min(this.concurrentChunks + 2, this.maxConcurrentChunks)
        console.log(`📈 Increased concurrent chunks to ${this.concurrentChunks}`)
      }
    }
  }

  public getStats(): TransferStats {
    return { ...this.stats }
  }

  public reset(totalBytes: number) {
    this.stats = {
      bytesTransferred: 0,
      totalBytes,
      speed: 0,
      eta: 0,
      packetsLost: 0,
      retransmissions: 0,
      efficiency: 100
    }
  }
}

export class ChunkManager {
  private chunks: Map<number, ChunkMetadata> = new Map()
  private pendingChunks: Set<number> = new Set()
  private completedChunks: Set<number> = new Set()
  private failedChunks: Map<number, number> = new Map() // chunk id -> attempt count
  
  private totalChunks: number = 0
  private chunkSize: number
  private maxRetries: number = 5
  
  constructor(fileSize: number, chunkSize: number) {
    this.chunkSize = chunkSize
    this.totalChunks = Math.ceil(fileSize / chunkSize)
    this.initializeChunks(fileSize)
  }
  
  private initializeChunks(fileSize: number) {
    for (let i = 0; i < this.totalChunks; i++) {
      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, fileSize)
      const size = end - start
      
      this.chunks.set(i, {
        id: i,
        size,
        checksum: '',
        priority: this.calculatePriority(i),
        attempts: 0,
        timestamp: 0
      })
    }
  }
  
  private calculatePriority(chunkId: number): number {
    // Higher priority for chunks at the beginning and end
    const progress = chunkId / this.totalChunks
    if (progress < 0.1 || progress > 0.9) {
      return 3 // High priority
    } else if (progress < 0.3 || progress > 0.7) {
      return 2 // Medium priority
    }
    return 1 // Normal priority
  }
  
  public getNextChunks(count: number): ChunkMetadata[] {
    const available = Array.from(this.chunks.values())
      .filter(chunk => 
        !this.pendingChunks.has(chunk.id) && 
        !this.completedChunks.has(chunk.id) &&
        (this.failedChunks.get(chunk.id) || 0) < this.maxRetries
      )
      .sort((a, b) => {
        // Sort by priority first, then by attempts (retry failed chunks first)
        const priorityDiff = b.priority - a.priority
        if (priorityDiff !== 0) return priorityDiff
        
        const attemptsA = this.failedChunks.get(a.id) || 0
        const attemptsB = this.failedChunks.get(b.id) || 0
        return attemptsB - attemptsA
      })
      .slice(0, count)
    
    available.forEach(chunk => {
      this.pendingChunks.add(chunk.id)
      chunk.timestamp = Date.now()
    })
    
    return available
  }
  
  public markCompleted(chunkId: number) {
    this.pendingChunks.delete(chunkId)
    this.completedChunks.add(chunkId)
    this.failedChunks.delete(chunkId)
  }
  
  public markFailed(chunkId: number) {
    this.pendingChunks.delete(chunkId)
    const attempts = (this.failedChunks.get(chunkId) || 0) + 1
    this.failedChunks.set(chunkId, attempts)
    
    const chunk = this.chunks.get(chunkId)
    if (chunk) {
      chunk.attempts = attempts
    }
  }
  
  public getProgress(): number {
    return this.completedChunks.size / this.totalChunks
  }
  
  public isComplete(): boolean {
    return this.completedChunks.size === this.totalChunks
  }
  
  public getFailedChunks(): number[] {
    return Array.from(this.failedChunks.entries())
      .filter(([_, attempts]) => attempts >= this.maxRetries)
      .map(([chunkId, _]) => chunkId)
  }
  
  public timeoutStaleChunks(timeoutMs: number = 30000) {
    const now = Date.now()
    const staleChunks: number[] = []
    
    this.pendingChunks.forEach(chunkId => {
      const chunk = this.chunks.get(chunkId)
      if (chunk && now - chunk.timestamp > timeoutMs) {
        staleChunks.push(chunkId)
      }
    })
    
    staleChunks.forEach(chunkId => {
      this.markFailed(chunkId)
    })
    
    return staleChunks.length
  }
}

export class ConnectionStabilizer {
  private dataChannel: RTCDataChannel
  private sendQueue: ArrayBuffer[] = []
  private isProcessing: boolean = false
  private maxQueueSize: number = 100
  private sendDelay: number = 0 // Adaptive delay between sends
  
  private lastSendTime: number = 0
  private sendTimes: number[] = []
  private maxSendTimeHistory: number = 100
  
  constructor(dataChannel: RTCDataChannel) {
    this.dataChannel = dataChannel
    this.setupBufferMonitoring()
  }
  
  private setupBufferMonitoring() {
    setInterval(() => {
      if (this.dataChannel.readyState === 'open') {
        const bufferedAmount = this.dataChannel.bufferedAmount
        const maxBuffer = 16 * 100 * 100 // 16MB buffer limit
        
        if (bufferedAmount > maxBuffer * 0.8) {
          // Buffer is getting full, increase delay
          this.sendDelay = Math.min(this.sendDelay + 1, 50)
        } else if (bufferedAmount < maxBuffer * 0.2) {
          // Buffer has space, decrease delay
          this.sendDelay = Math.max(this.sendDelay - 1, 0)
        }
      }
    }, 100)
  }
  
  public async sendData(data: ArrayBuffer): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.sendQueue.length >= this.maxQueueSize) {
        console.warn('⚠️ Send queue full, dropping packet')
        resolve(false)
        return
      }
      
      this.sendQueue.push(data)
      this.processSendQueue()
      resolve(true)
    })
  }
  
  private async processSendQueue() {
    if (this.isProcessing || this.sendQueue.length === 0) {
      return
    }
    
    this.isProcessing = true
    
    while (this.sendQueue.length > 0 && this.dataChannel.readyState === 'open') {
      const data = this.sendQueue.shift()!
      
      try {
        // Wait for buffer to have space
        while (this.dataChannel.bufferedAmount > 8 * 100 * 100) { // 8MB threshold
          await this.sleep(10)
        }
        
        const sendStart = performance.now()
        this.dataChannel.send(data)
        const sendEnd = performance.now()
        
        // Track send performance
        this.sendTimes.push(sendEnd - sendStart)
        if (this.sendTimes.length > this.maxSendTimeHistory) {
          this.sendTimes.shift()
        }
        
        // Adaptive delay based on performance
        if (this.sendDelay > 0) {
          await this.sleep(this.sendDelay)
        }
        
      } catch (error) {
        console.error('❌ Failed to send data:', error)
        // Put the data back at the front of the queue for retry
        this.sendQueue.unshift(data)
        await this.sleep(100) // Wait before retry
      }
    }
    
    this.isProcessing = false
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  public getAverageSendTime(): number {
    if (this.sendTimes.length === 0) return 0
    return this.sendTimes.reduce((a, b) => a + b, 0) / this.sendTimes.length
  }
  
  public getQueueLength(): number {
    return this.sendQueue.length
  }
  
  public clearQueue() {
    this.sendQueue = []
  }
}
