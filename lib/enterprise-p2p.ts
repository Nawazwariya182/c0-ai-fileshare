// Enterprise-Grade P2P System - Ultra-Reliable & High-Performance

interface ConnectionStats {
  latency: number
  throughput: number
  quality: "excellent" | "good" | "poor"
  packetLoss: number
  jitter: number
  stability: number
}

interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "scanning" | "transferring" | "completed" | "error" | "paused" | "resuming"
  direction: "sending" | "receiving"
  speed?: number
  startTime?: number
  checksum?: string
  resumeOffset?: number
  chunks?: Map<number, boolean>
  totalChunks?: number
  lastActivity?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

interface FileChunkData {
  chunks: Map<number, ArrayBuffer>
  totalSize: number
  fileName: string
  fileType: string
  receivedSize: number
  totalChunks: number
  checksum?: string
  lastChunkTime: number
  resumeOffset: number
  missingChunks: Set<number>
}

interface ConnectionConfig {
  maxReconnectAttempts: number
  reconnectDelay: number
  heartbeatInterval: number
  connectionTimeout: number
  chunkSize: number
  maxConcurrentChunks: number
  bufferThreshold: number
  mobileOptimizations: boolean
}

export class EnterpriseP2P {
  private sessionId: string
  private userId: string
  private config: ConnectionConfig

  // Connection components with redundancy
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private backupDataChannel: RTCDataChannel | null = null

  // Enterprise connection state management
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"
  private userCount = 0
  private connectionQuality: "excellent" | "good" | "poor" = "excellent"

  // Multi-URL failover system
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
    packetLoss: 0,
    jitter: 0,
    stability: 100,
  }

  // Advanced ICE handling with redundancy
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false
  private localDescriptionSet = false
  private connectionAttempting = false
  private connectionLocked = false

  // Enterprise reconnection management
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private lastConnectionAttempt = 0
  private connectionFailures = 0
  private lastSuccessfulConnection = 0
  private connectionStabilityScore = 100

  // High-performance file transfer system
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private sendingFiles: Map<string, { file: File; transfer: FileTransfer; controller: AbortController }> = new Map()
  private transferQueue: string[] = []
  private activeTransfers = 0
  private maxConcurrentTransfers = 3

  // Adaptive performance optimization
  private adaptiveChunkSize = 64 * 1024 // Start with 64KB
  private maxChunkSize = 1024 * 1024 // 1MB max
  private minChunkSize = 16 * 1024 // 16KB min
  private optimalConcurrency = 8
  private transferBuffer: Map<string, ArrayBuffer[]> = new Map()

  // Mobile and stability optimizations
  private isMobileDevice = false
  private isBackgroundMode = false
  private visibilityState = "visible"
  private lastActivityTime = Date.now()
  private connectionPersistence = true
  private preventDisconnect = false

  // Enterprise timers and monitoring
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private performanceMonitorTimer: NodeJS.Timeout | null = null
  private stabilityMonitorTimer: NodeJS.Timeout | null = null
  private transferTimeoutTimer: NodeJS.Timeout | null = null
  private keepAliveTimer: NodeJS.Timeout | null = null

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onSignalingStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onUserCountChange: ((count: number) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onConnectionQualityChange: ((quality: "excellent" | "good" | "poor") => void) | null = null
  public onSpeedUpdate: ((speed: number) => void) | null = null
  public onFileTransferUpdate: ((transfers: FileTransfer[]) => void) | null = null
  public onChatMessage: ((message: ChatMessage) => void) | null = null
  public onConnectionRecovery: (() => void) | null = null
  public onTransferProgress: ((fileId: string, progress: number, speed: number) => void) | null = null

  constructor(sessionId: string, userId: string, customConfig?: Partial<ConnectionConfig>) {
    this.sessionId = sessionId
    this.userId = userId

    // Enterprise configuration with mobile optimizations
    this.config = {
      maxReconnectAttempts: 50,
      reconnectDelay: 1000,
      heartbeatInterval: 5000,
      connectionTimeout: 15000,
      chunkSize: 64 * 1024,
      maxConcurrentChunks: 16,
      bufferThreshold: 2 * 1024 * 1024,
      mobileOptimizations: true,
      ...customConfig,
    }

    this.initializeSystem()
    console.log("🚀 Enterprise P2P System initialized - Ultra-Reliable & High-Performance")
  }

  private initializeSystem() {
    this.detectMobileDevice()
    this.initializeUrls()
    this.setupMobileOptimizations()
    this.setupPerformanceMonitoring()
    this.setupStabilityMonitoring()
    this.adaptiveChunkSize = this.config.chunkSize
  }

  private detectMobileDevice() {
    this.isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (this.isMobileDevice) {
      console.log("📱 Mobile device detected - enabling optimizations")
      this.enableMobileOptimizations()
    }
  }

  private enableMobileOptimizations() {
    this.config.heartbeatInterval = 8000 // Longer intervals for mobile
    this.config.bufferThreshold = 1024 * 1024 // Smaller buffer for mobile
    this.adaptiveChunkSize = Math.min(this.adaptiveChunkSize, 32 * 1024) // Smaller chunks
    this.maxConcurrentTransfers = 2 // Fewer concurrent transfers
    this.optimalConcurrency = 4 // Reduced concurrency
    this.connectionPersistence = true
  }

  private setupMobileOptimizations() {
    if (typeof window !== "undefined") {
      // Prevent disconnections during file selection
      document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this))
      window.addEventListener("beforeunload", this.handleBeforeUnload.bind(this))
      window.addEventListener("pagehide", this.handlePageHide.bind(this))
      window.addEventListener("pageshow", this.handlePageShow.bind(this))
      window.addEventListener("focus", this.handleFocus.bind(this))
      window.addEventListener("blur", this.handleBlur.bind(this))

      // Mobile-specific events
      if (this.isMobileDevice) {
        document.addEventListener("touchstart", this.handleUserActivity.bind(this))
        document.addEventListener("touchend", this.handleUserActivity.bind(this))
        window.addEventListener("orientationchange", this.handleOrientationChange.bind(this))
      }
    }
  }

  private handleVisibilityChange() {
    this.visibilityState = document.hidden ? "hidden" : "visible"
    console.log(`📱 Visibility: ${this.visibilityState}`)

    if (document.hidden) {
      this.isBackgroundMode = true
      this.preventDisconnect = true
      this.startKeepAlive()
    } else {
      this.isBackgroundMode = false
      this.preventDisconnect = false
      this.stopKeepAlive()
      this.handleUserActivity()
      // Restore connection if needed
      setTimeout(() => this.ensureConnection(), 1000)
    }
  }

  private handleBeforeUnload() {
    this.preventDisconnect = true
  }

  private handlePageHide() {
    this.preventDisconnect = true
    this.isBackgroundMode = true
    this.startKeepAlive()
  }

  private handlePageShow() {
    this.preventDisconnect = false
    this.isBackgroundMode = false
    this.stopKeepAlive()
    setTimeout(() => this.ensureConnection(), 500)
  }

  private handleFocus() {
    this.handleUserActivity()
    this.ensureConnection()
  }

  private handleBlur() {
    if (this.isMobileDevice) {
      this.preventDisconnect = true
      this.startKeepAlive()
    }
  }

  private handleUserActivity() {
    this.lastActivityTime = Date.now()
    this.preventDisconnect = false
  }

  private handleOrientationChange() {
    // Prevent disconnection during orientation change
    this.preventDisconnect = true
    setTimeout(() => {
      this.preventDisconnect = false
      this.ensureConnection()
    }, 2000)
  }

  private startKeepAlive() {
    this.stopKeepAlive()
    this.keepAliveTimer = setInterval(() => {
      if (this.dataChannel?.readyState === "open") {
        this.sendDataChannelMessage({
          type: "keep-alive",
          timestamp: Date.now(),
          mobile: this.isMobileDevice,
          background: this.isBackgroundMode,
        })
      }
    }, 5000)
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private initializeUrls() {
    this.wsUrls = []

    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push(
        "wss://signaling-server-1ckx.onrender.com",
        "wss://p2p-signaling-backup.herokuapp.com",
        "wss://reliable-signaling.railway.app",
        "wss://ws-signaling.fly.dev",
      )
    } else {
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080")
    }

    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🌐 Enterprise signaling URLs:", this.wsUrls.length)
  }

  private setupPerformanceMonitoring() {
    this.performanceMonitorTimer = setInterval(() => {
      this.updatePerformanceMetrics()
      this.optimizeTransferParameters()
      this.monitorTransferHealth()
    }, 2000)
  }

  private setupStabilityMonitoring() {
    this.stabilityMonitorTimer = setInterval(() => {
      this.updateStabilityScore()
      this.checkConnectionHealth()
      this.optimizeForStability()
    }, 5000)
  }

  private updatePerformanceMetrics() {
    if (!this.pc) return

    this.pc
      .getStats()
      .then((stats) => {
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            if (report.currentRoundTripTime) {
              this.connectionStats.latency = report.currentRoundTripTime * 1000
            }
            if (report.availableOutgoingBitrate) {
              this.connectionStats.throughput = report.availableOutgoingBitrate
            }
          }

          if (report.type === "data-channel" && report.state === "open") {
            if (report.bytesReceived && report.bytesSent) {
              const totalBytes = report.bytesReceived + report.bytesSent
              this.updateThroughputStats(totalBytes)
            }
          }
        })

        this.updateConnectionQuality()
      })
      .catch((error) => {
        console.error("❌ Stats collection error:", error)
      })
  }

  private updateThroughputStats(totalBytes: number) {
    const now = Date.now()
    const timeDiff = (now - this.lastActivityTime) / 1000

    if (timeDiff > 0) {
      const throughput = totalBytes / timeDiff
      this.connectionStats.throughput = throughput
      this.onSpeedUpdate?.(throughput)
    }
  }

  private updateConnectionQuality() {
    const { latency, throughput } = this.connectionStats

    if (latency < 50 && throughput > 2000000) {
      this.connectionQuality = "excellent"
    } else if (latency < 150 && throughput > 500000) {
      this.connectionQuality = "good"
    } else {
      this.connectionQuality = "poor"
    }

    this.connectionStats.quality = this.connectionQuality
    this.onConnectionQualityChange?.(this.connectionQuality)
  }

  private optimizeTransferParameters() {
    switch (this.connectionQuality) {
      case "excellent":
        this.adaptiveChunkSize = Math.min(this.maxChunkSize, 512 * 1024) // 512KB
        this.optimalConcurrency = 16
        this.maxConcurrentTransfers = 4
        break
      case "good":
        this.adaptiveChunkSize = Math.min(this.maxChunkSize, 256 * 1024) // 256KB
        this.optimalConcurrency = 8
        this.maxConcurrentTransfers = 3
        break
      case "poor":
        this.adaptiveChunkSize = Math.max(this.minChunkSize, 64 * 1024) // 64KB
        this.optimalConcurrency = 4
        this.maxConcurrentTransfers = 2
        break
    }

    // Mobile adjustments
    if (this.isMobileDevice) {
      this.adaptiveChunkSize = Math.min(this.adaptiveChunkSize, 128 * 1024)
      this.optimalConcurrency = Math.min(this.optimalConcurrency, 6)
      this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers, 2)
    }
  }

  private updateStabilityScore() {
    const now = Date.now()
    const timeSinceLastSuccess = now - this.lastSuccessfulConnection

    if (timeSinceLastSuccess < 30000) {
      // Less than 30 seconds
      this.connectionStabilityScore = Math.min(100, this.connectionStabilityScore + 2)
    } else if (timeSinceLastSuccess > 60000) {
      // More than 1 minute
      this.connectionStabilityScore = Math.max(0, this.connectionStabilityScore - 5)
    }

    this.connectionStats.stability = this.connectionStabilityScore
  }

  private optimizeForStability() {
    if (this.connectionStabilityScore < 50) {
      // Poor stability - use conservative settings
      this.adaptiveChunkSize = this.minChunkSize
      this.optimalConcurrency = 2
      this.config.heartbeatInterval = 3000 // More frequent heartbeats
    } else if (this.connectionStabilityScore > 80) {
      // Good stability - can be more aggressive
      this.config.heartbeatInterval = this.isMobileDevice ? 8000 : 5000
    }
  }

  private monitorTransferHealth() {
    const now = Date.now()

    // Check for stalled transfers
    this.fileTransfers.forEach((transfer, fileId) => {
      if (
        transfer.status === "transferring" &&
        transfer.lastActivity &&
        now - transfer.lastActivity > 30000 // 30 seconds
      ) {
        console.log(`⚠️ Transfer ${fileId} appears stalled - attempting recovery`)
        this.recoverStalledTransfer(fileId)
      }
    })
  }

  private recoverStalledTransfer(fileId: string) {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    if (transfer.direction === "sending") {
      // Resume sending
      const sendingFile = this.sendingFiles.get(fileId)
      if (sendingFile) {
        transfer.status = "resuming"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        setTimeout(() => this.resumeSendingFile(fileId, sendingFile.file), 1000)
      }
    } else {
      // Request missing chunks
      const fileData = this.receivedChunks.get(fileId)
      if (fileData) {
        this.requestMissingChunks(fileId, fileData)
      }
    }
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting enterprise P2P connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    this.onConnectionStatusChange?.("connecting")
    this.onSignalingStatusChange?.("connecting")

    await this.connectWebSocket()
    this.startConnectionMonitoring()
  }

  public destroy() {
    console.log("🛑 Destroying enterprise P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    ;[
      this.heartbeatTimer,
      this.reconnectTimer,
      this.connectionMonitorTimer,
      this.performanceMonitorTimer,
      this.stabilityMonitorTimer,
      this.transferTimeoutTimer,
      this.keepAliveTimer,
    ].forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    // Reset timer references
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.connectionMonitorTimer = null
    this.performanceMonitorTimer = null
    this.stabilityMonitorTimer = null
    this.transferTimeoutTimer = null
    this.keepAliveTimer = null

    // Abort active transfers
    this.sendingFiles.forEach((fileInfo) => {
      fileInfo.controller.abort()
    })

    // Close connections
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    if (this.dataChannel) {
      this.dataChannel = null
    }
    if (this.backupDataChannel) {
      this.backupDataChannel = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Reset state
    this.resetConnectionState()
  }

  private resetConnectionState() {
    this.iceCandidateQueue = []
    this.remoteDescriptionSet = false
    this.localDescriptionSet = false
    this.connectionAttempting = false
    this.connectionLocked = false
  }

  private startConnectionMonitoring() {
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      this.checkConnectionHealth()
      this.attemptReconnectionIfNeeded()
      this.ensureConnection()
    }, 2000)
  }

  private checkConnectionHealth() {
    const wsHealthy = this.ws?.readyState === WebSocket.OPEN
    const p2pHealthy = this.pc?.connectionState === "connected"
    const dataChannelHealthy = this.dataChannel?.readyState === "open"

    // Update signaling state
    if (wsHealthy && this.signalingState !== "connected") {
      this.signalingState = "connected"
      this.onSignalingStatusChange?.("connected")
      this.lastSuccessfulConnection = Date.now()
      console.log("✅ Signaling connected")
    } else if (!wsHealthy && this.signalingState === "connected") {
      this.signalingState = "disconnected"
      this.onSignalingStatusChange?.("disconnected")
      console.log("⚠️ Signaling disconnected")
    }

    // Update P2P state
    if (p2pHealthy && dataChannelHealthy && this.connectionState !== "connected") {
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.p2pReconnectAttempts = 0
      this.connectionAttempting = false
      this.connectionLocked = false
      this.lastSuccessfulConnection = Date.now()
      this.onConnectionRecovery?.()
      console.log("✅ Enterprise P2P connection established!")
    } else if ((!p2pHealthy || !dataChannelHealthy) && this.connectionState === "connected") {
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
      console.log("⚠️ P2P connection lost")
    }
  }

  private ensureConnection() {
    if (this.preventDisconnect || this.isBackgroundMode) {
      // Maintain connection in background
      if (this.dataChannel?.readyState === "open") {
        this.sendDataChannelMessage({
          type: "keep-alive",
          timestamp: Date.now(),
          ensure: true,
        })
      }
    }
  }

  private attemptReconnectionIfNeeded() {
    const now = Date.now()

    // WebSocket reconnection
    if (this.ws?.readyState !== WebSocket.OPEN && !this.reconnectTimer) {
      this.connectWebSocket()
    }

    // P2P reconnection with enterprise logic
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.userCount === 2 &&
      this.pc?.connectionState !== "connected" &&
      !this.connectionAttempting &&
      !this.connectionLocked &&
      now - this.lastConnectionAttempt > this.config.reconnectDelay
    ) {
      console.log("🔄 Enterprise P2P reconnection...")
      this.attemptP2PConnection()
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws?.readyState === WebSocket.OPEN) return

    this.wsReconnectAttempts++

    // Intelligent URL rotation
    if (this.wsReconnectAttempts > 3) {
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      this.wsReconnectAttempts = 1
      console.log(`🔄 Switching to backup server: ${this.wsUrls[this.currentUrlIndex]}`)
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 Enterprise WebSocket attempt ${this.wsReconnectAttempts} to ${wsUrl}`)

    try {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(wsUrl)

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log("⏰ WebSocket timeout - trying next server")
          this.ws.close()
          this.scheduleReconnect()
        }
      }, this.config.connectionTimeout)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ Enterprise WebSocket connected!")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")
        this.wsReconnectAttempts = 0
        this.currentUrlIndex = 0
        this.lastSuccessfulConnection = Date.now()

        // Send enhanced join message
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          reconnect: this.wsReconnectAttempts > 1,
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobileDevice,
            version: "enterprise-v1",
            capabilities: {
              maxChunkSize: this.maxChunkSize,
              concurrentTransfers: this.maxConcurrentTransfers,
              resumableTransfers: true,
              largeFileSupport: true,
              adaptivePerformance: true,
            },
          },
        })

        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error("❌ Message parse error:", error)
        }
      }

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 WebSocket closed: ${event.code}`)
        this.signalingState = "disconnected"
        this.onSignalingStatusChange?.("disconnected")
        this.ws = null
        this.stopHeartbeat()

        if (!this.isDestroyed && event.code !== 1000) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("❌ WebSocket error:", error)
        this.connectionFailures++
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      this.connectionFailures++
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectDelay
    const exponentialDelay = Math.min(baseDelay * Math.pow(1.5, Math.min(this.wsReconnectAttempts, 10)), 30000)
    const jitter = Math.random() * 1000
    const delay = exponentialDelay + jitter

    console.log(`🔄 Scheduling reconnect in ${Math.round(delay)}ms`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.isDestroyed) {
        this.connectWebSocket()
      }
    }, delay)
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent
    if (ua.includes("Chrome")) return "Chrome"
    if (ua.includes("Firefox")) return "Firefox"
    if (ua.includes("Safari")) return "Safari"
    if (ua.includes("Edge")) return "Edge"
    return "Unknown"
  }

  private sendMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        this.lastActivityTime = Date.now()
      } catch (error) {
        console.error("❌ Send error:", error)
      }
    } else {
      console.log("📤 Cannot send - WebSocket not open")
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: "ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          quality: this.connectionQuality,
          stability: this.connectionStabilityScore,
        })
      }
    }, this.config.heartbeatInterval)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async handleMessage(message: any) {
    this.lastActivityTime = Date.now()

    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        console.log(`🎯 Role: ${this.isInitiator ? "INITIATOR" : "RECEIVER"}`)
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)

        // Immediate P2P initiation when both users present
        if (message.userCount === 2 && !this.connectionAttempting) {
          console.log("🚀 Both users present - initiating enterprise P2P...")
          setTimeout(() => this.attemptP2PConnection(), 1500) // Quick start
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected")
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)

        if (message.userCount === 2 && this.connectionState !== "connected" && !this.connectionAttempting) {
          setTimeout(() => this.attemptP2PConnection(), 1000)
        }
        break

      case "pong":
        this.handlePong(message.timestamp)
        break

      case "offer":
        console.log("📥 Received enterprise offer")
        await this.handleOffer(message.offer)
        break

      case "answer":
        console.log("📥 Received enterprise answer")
        await this.handleAnswer(message.answer)
        break

      case "ice-candidate":
        console.log("📥 Received ICE candidate")
        await this.handleIceCandidate(message.candidate)
        break

      case "user-left":
        console.log("👋 User left")
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        this.connectionState = "disconnected"
        this.onConnectionStatusChange?.("disconnected")
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private handlePong(timestamp: number) {
    const latency = Date.now() - timestamp
    this.connectionStats.latency = latency
    this.lastSuccessfulConnection = Date.now()
  }

  private async attemptP2PConnection() {
    if (this.isDestroyed || this.connectionAttempting || this.connectionLocked) {
      console.log("⚠️ P2P attempt blocked")
      return
    }

    this.p2pReconnectAttempts++
    if (this.p2pReconnectAttempts > this.config.maxReconnectAttempts) {
      console.log("❌ Max P2P attempts reached")
      this.onError?.("P2P connection failed after maximum attempts")
      return
    }

    this.connectionAttempting = true
    this.connectionLocked = true
    this.lastConnectionAttempt = Date.now()
    console.log(`🚀 Enterprise P2P attempt ${this.p2pReconnectAttempts}`)

    // Ensure WebSocket is ready
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⏳ Waiting for WebSocket...")
      this.connectionAttempting = false
      this.connectionLocked = false
      return
    }

    // Only initiator creates offer
    if (this.isInitiator) {
      await this.createEnterpriseOffer()
    } else {
      console.log("⏳ Waiting for offer as receiver...")
      this.connectionAttempting = false
      this.connectionLocked = false
    }
  }

  private async createEnterpriseOffer() {
    console.log("🚀 Creating enterprise P2P offer...")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connections
      if (this.pc) {
        this.pc.close()
        this.pc = null
      }
      this.dataChannel = null
      this.backupDataChannel = null
      this.resetConnectionState()

      // Create enterprise-grade peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "stun:stun.nextcloud.com:443" },
          // Add TURN servers if available
          ...(process.env.NEXT_PUBLIC_TURN_SERVER
            ? [
                {
                  urls: process.env.NEXT_PUBLIC_TURN_SERVER,
                  username: process.env.NEXT_PUBLIC_TURN_USERNAME,
                  credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
                },
              ]
            : []),
        ],
        iceCandidatePoolSize: 20,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      })

      this.setupEnterpriseHandlers()

      // Create primary data channel with enterprise settings
      this.dataChannel = this.pc.createDataChannel("enterprise-primary", {
        ordered: true,
        maxRetransmits: 3,
        maxPacketLifeTime: 5000,
        protocol: "enterprise-v1",
      })

      // Create backup data channel for redundancy
      this.backupDataChannel = this.pc.createDataChannel("enterprise-backup", {
        ordered: false,
        maxRetransmits: 1,
        maxPacketLifeTime: 3000,
        protocol: "enterprise-backup-v1",
      })

      this.setupDataChannelHandlers()

      // Set enterprise timeout
      this.transferTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ Enterprise P2P timeout")
          this.connectionAttempting = false
          this.connectionLocked = false
          this.onError?.("Enterprise P2P connection timeout - retrying...")
          setTimeout(() => this.attemptP2PConnection(), 3000)
        }
      }, 25000) // 25 second timeout

      // Create optimized offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await this.pc.setLocalDescription(offer)
      this.localDescriptionSet = true

      console.log("📤 Sending enterprise offer...")
      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
        enterprise: true,
        capabilities: {
          maxChunkSize: this.maxChunkSize,
          concurrentTransfers: this.maxConcurrentTransfers,
          adaptivePerformance: true,
          largeFileSupport: true,
          resumableTransfers: true,
        },
      })
    } catch (error) {
      console.error("❌ Enterprise offer error:", error)
      this.connectionAttempting = false
      this.connectionLocked = false
      this.onError?.("Failed to create enterprise P2P offer - retrying...")
      setTimeout(() => this.attemptP2PConnection(), 3000)
    }
  }

  private setupEnterpriseHandlers() {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`📤 Sending ICE candidate: ${event.candidate.type}`)
        this.sendMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          timestamp: Date.now(),
        })
      } else {
        console.log("✅ ICE gathering complete")
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔄 Enterprise P2P state: ${state}`)

      switch (state) {
        case "connected":
          console.log("✅ Enterprise P2P connected!")
          this.connectionState = "connected"
          this.onConnectionStatusChange?.("connected")
          this.p2pReconnectAttempts = 0
          this.connectionAttempting = false
          this.connectionLocked = false
          this.lastSuccessfulConnection = Date.now()
          this.clearTransferTimeout()
          this.onConnectionRecovery?.()
          break

        case "connecting":
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
        case "failed":
          console.log(`⚠️ Enterprise P2P ${state}`)
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.connectionAttempting = false
          this.connectionLocked = false
          this.clearTransferTimeout()
          setTimeout(() => this.attemptP2PConnection(), 2000)
          break

        case "closed":
          console.log("🔌 Enterprise P2P closed")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.connectionAttempting = false
          this.connectionLocked = false
          this.clearTransferTimeout()
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 ICE state: ${state}`)

      switch (state) {
        case "connected":
        case "completed":
          console.log("✅ ICE connection established")
          this.lastSuccessfulConnection = Date.now()
          break

        case "disconnected":
          console.log("⚠️ ICE disconnected - restarting...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "disconnected") {
              this.pc.restartIce()
            }
          }, 2000)
          break

        case "failed":
          console.log("❌ ICE failed - restarting...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "failed") {
              this.pc.restartIce()
            }
          }, 1000)
          break
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log(`📡 Received data channel: ${event.channel.label}`)
      if (event.channel.label === "enterprise-primary") {
        this.dataChannel = event.channel
      } else if (event.channel.label === "enterprise-backup") {
        this.backupDataChannel = event.channel
      }
      this.setupDataChannelHandlers()
    }
  }

  private setupDataChannelHandlers() {
    if (this.dataChannel) {
      this.setupSingleDataChannelHandlers(this.dataChannel, "primary")
    }
    if (this.backupDataChannel) {
      this.setupSingleDataChannelHandlers(this.backupDataChannel, "backup")
    }
  }

  private setupSingleDataChannelHandlers(channel: RTCDataChannel, type: "primary" | "backup") {
    channel.binaryType = "arraybuffer"
    channel.bufferedAmountLowThreshold = this.config.bufferThreshold

    channel.onopen = () => {
      console.log(`📡 ${type} data channel opened!`)
      if (type === "primary") {
        this.connectionState = "connected"
        this.onConnectionStatusChange?.("connected")
        this.connectionAttempting = false
        this.connectionLocked = false
        this.lastSuccessfulConnection = Date.now()
        this.clearTransferTimeout()

        // Send enterprise test message
        this.sendDataChannelMessage({
          type: "connection-test",
          message: "Enterprise connection ready",
          timestamp: Date.now(),
          capabilities: {
            maxChunkSize: this.maxChunkSize,
            concurrentTransfers: this.maxConcurrentTransfers,
            adaptivePerformance: true,
          },
        })
      }
    }

    channel.onmessage = (event) => {
      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data)
          this.handleDataMessage(message)
        } else {
          this.handleFileChunk(event.data)
        }
      } catch (error) {
        console.error(`❌ ${type} data channel message error:`, error)
      }
    }

    channel.onclose = () => {
      console.log(`📡 ${type} data channel closed`)
      if (type === "primary") {
        this.connectionState = "disconnected"
        this.onConnectionStatusChange?.("disconnected")
      }
    }

    channel.onerror = (error) => {
      console.error(`❌ ${type} data channel error:`, error)
    }

    channel.onbufferedamountlow = () => {
      console.log(`📡 ${type} buffer low - resuming transfers`)
      this.processTransferQueue()
    }
  }

  private clearTransferTimeout() {
    if (this.transferTimeoutTimer) {
      clearTimeout(this.transferTimeoutTimer)
      this.transferTimeoutTimer = null
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.connectionAttempting) {
      console.log("⚠️ Ignoring offer - busy")
      return
    }

    this.connectionAttempting = true
    this.connectionLocked = true
    console.log("📥 Handling enterprise offer")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connections
      if (this.pc) {
        this.pc.close()
      }
      this.resetConnectionState()

      // Create enterprise peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "stun:stun.nextcloud.com:443" },
          ...(process.env.NEXT_PUBLIC_TURN_SERVER
            ? [
                {
                  urls: process.env.NEXT_PUBLIC_TURN_SERVER,
                  username: process.env.NEXT_PUBLIC_TURN_USERNAME,
                  credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
                },
              ]
            : []),
        ],
        iceCandidatePoolSize: 20,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      })

      this.setupEnterpriseHandlers()

      // Set enterprise timeout
      this.transferTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ Enterprise answer timeout")
          this.connectionAttempting = false
          this.connectionLocked = false
          this.onError?.("Enterprise P2P answer timeout")
        }
      }, 25000)

      // Process offer
      console.log("📥 Setting remote description...")
      await this.pc.setRemoteDescription(offer)
      this.remoteDescriptionSet = true

      console.log("📤 Creating enterprise answer...")
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.localDescriptionSet = true

      console.log("📤 Sending enterprise answer...")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
        enterprise: true,
      })

      // Process queued ICE candidates
      this.processQueuedICECandidates()
    } catch (error) {
      console.error("❌ Enterprise offer error:", error)
      this.connectionAttempting = false
      this.connectionLocked = false
      this.onError?.("Failed to handle enterprise offer")
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || !this.pc) {
      console.log("⚠️ Ignoring answer")
      return
    }

    try {
      console.log("📥 Handling enterprise answer")

      if (this.pc.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
        this.remoteDescriptionSet = true
        console.log("✅ Enterprise answer processed")

        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Wrong signaling state:", this.pc.signalingState)
      }
    } catch (error) {
      console.error("❌ Enterprise answer error:", error)
      this.onError?.("Failed to handle enterprise answer")
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc && this.remoteDescriptionSet) {
        console.log("✅ Adding ICE candidate")
        await this.pc.addIceCandidate(candidate)
      } else {
        console.log("⏳ Queuing ICE candidate")
        this.iceCandidateQueue.push(candidate)
      }
    } catch (error) {
      console.error("❌ ICE candidate error:", error)
    }
  }

  private async processQueuedICECandidates() {
    if (!this.pc || !this.remoteDescriptionSet) return

    console.log(`🧊 Processing ${this.iceCandidateQueue.length} ICE candidates`)

    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch (error) {
        console.error("❌ Error processing ICE candidate:", error)
      }
    }

    this.iceCandidateQueue = []
  }

  private sendDataChannelMessage(message: any, useBackup = false) {
    const channel = useBackup ? this.backupDataChannel : this.dataChannel

    if (channel?.readyState === "open") {
      try {
        channel.send(JSON.stringify(message))
        this.lastActivityTime = Date.now()
      } catch (error) {
        console.error("❌ Data send error:", error)
        // Try backup channel if primary fails
        if (!useBackup && this.backupDataChannel?.readyState === "open") {
          this.sendDataChannelMessage(message, true)
        }
      }
    }
  }

  private handleDataMessage(message: any) {
    this.lastActivityTime = Date.now()

    switch (message.type) {
      case "connection-test":
        console.log("📨 Enterprise connection test received")
        this.sendDataChannelMessage({
          type: "connection-ack",
          message: "Enterprise connection confirmed",
          timestamp: Date.now(),
          capabilities: {
            maxChunkSize: this.maxChunkSize,
            concurrentTransfers: this.maxConcurrentTransfers,
            adaptivePerformance: true,
          },
        })
        break

      case "connection-ack":
        console.log("✅ Enterprise connection acknowledged")
        break

      case "keep-alive":
        this.sendDataChannelMessage({
          type: "keep-alive-ack",
          timestamp: Date.now(),
        })
        break

      case "keep-alive-ack":
        this.lastSuccessfulConnection = Date.now()
        break

      case "chat-message":
        this.onChatMessage?.({
          id: message.id,
          content: message.content,
          sender: message.sender,
          timestamp: new Date(message.timestamp),
          type: message.messageType || "text",
        })
        break

      case "file-start":
        this.handleFileStart(message)
        break

      case "file-chunk-ack":
        this.handleFileChunkAck(message)
        break

      case "file-complete":
        this.handleFileComplete(message)
        break

      case "file-error":
        this.handleFileError(message)
        break

      case "request-chunks":
        this.handleChunkRequest(message)
        break
    }
  }

  // Enterprise file transfer implementation
  private handleFileStart(message: any) {
    console.log(`📥 Enterprise file start: ${message.fileName} (${(message.fileSize / 1024 / 1024).toFixed(2)}MB)`)

    const transfer: FileTransfer = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
      startTime: Date.now(),
      checksum: message.checksum,
      resumeOffset: 0,
      lastActivity: Date.now(),
    }

    this.fileTransfers.set(message.fileId, transfer)

    const totalChunks = Math.ceil(message.fileSize / this.adaptiveChunkSize)
    this.receivedChunks.set(message.fileId, {
      chunks: new Map(),
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
      receivedSize: 0,
      totalChunks,
      checksum: message.checksum,
      lastChunkTime: Date.now(),
      resumeOffset: 0,
      missingChunks: new Set(),
    })

    this.updateFileTransfers()

    // Send acknowledgment
    this.sendDataChannelMessage({
      type: "file-start-ack",
      fileId: message.fileId,
      timestamp: Date.now(),
      chunkSize: this.adaptiveChunkSize,
    })
  }

  private handleFileChunk(data: ArrayBuffer) {
    try {
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const chunkIndex = view.getUint32(4)
      const isLastChunk = view.getUint8(8) === 1
      const fileId = new TextDecoder().decode(data.slice(9, 9 + fileIdLength))
      const chunkData = data.slice(9 + fileIdLength)

      const fileData = this.receivedChunks.get(fileId)
      const transfer = this.fileTransfers.get(fileId)

      if (fileData && transfer) {
        // Store chunk
        fileData.chunks.set(chunkIndex, chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()
        transfer.lastActivity = Date.now()

        // Update progress
        const progress = Math.min(Math.round((fileData.chunks.size / fileData.totalChunks) * 100), 99)
        transfer.progress = progress

        // Calculate speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
          this.onSpeedUpdate?.(transfer.speed)
          this.onTransferProgress?.(fileId, progress, transfer.speed)
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        // Send acknowledgment
        this.sendDataChannelMessage({
          type: "file-chunk-ack",
          fileId,
          chunkIndex,
          timestamp: Date.now(),
        })

        // Check if complete
        if (isLastChunk && fileData.chunks.size === fileData.totalChunks) {
          this.completeFileReception(fileId)
        }
      }
    } catch (error) {
      console.error("❌ Enterprise file chunk error:", error)
    }
  }

  private async completeFileReception(fileId: string) {
    console.log(`📥 Completing enterprise file reception: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!fileData || !transfer) return

    try {
      // Check for missing chunks
      const missingChunks: number[] = []
      for (let i = 0; i < fileData.totalChunks; i++) {
        if (!fileData.chunks.has(i)) {
          missingChunks.push(i)
        }
      }

      if (missingChunks.length > 0) {
        console.log(`⚠️ Missing ${missingChunks.length} chunks - requesting...`)
        this.requestMissingChunks(fileId, fileData)
        return
      }

      // Assemble file
      const orderedChunks: ArrayBuffer[] = []
      for (let i = 0; i < fileData.totalChunks; i++) {
        const chunk = fileData.chunks.get(i)
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`)
        }
        orderedChunks.push(chunk)
      }

      const blob = new Blob(orderedChunks, { type: fileData.fileType })

      // Verify file size
      if (blob.size !== fileData.totalSize) {
        throw new Error(`File size mismatch: expected ${fileData.totalSize}, got ${blob.size}`)
      }

      // Verify checksum if provided
      if (fileData.checksum) {
        const calculatedChecksum = await this.calculateChecksum(blob)
        if (calculatedChecksum !== fileData.checksum) {
          throw new Error("File checksum verification failed")
        }
      }

      // Download file
      this.downloadFile(blob, fileData.fileName)

      // Update transfer status
      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(fileId, transfer)
      this.receivedChunks.delete(fileId)
      this.updateFileTransfers()

      // Send completion acknowledgment
      this.sendDataChannelMessage({
        type: "file-complete-ack",
        fileId,
        timestamp: Date.now(),
        success: true,
      })

      console.log(`✅ Enterprise file ${fileData.fileName} completed successfully`)
    } catch (error) {
      console.error("❌ Enterprise file completion error:", error)
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      this.sendDataChannelMessage({
        type: "file-error",
        fileId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      })
    }
  }

  private requestMissingChunks(fileId: string, fileData: FileChunkData) {
    const missingChunks: number[] = []
    for (let i = 0; i < fileData.totalChunks; i++) {
      if (!fileData.chunks.has(i)) {
        missingChunks.push(i)
        fileData.missingChunks.add(i)
      }
    }

    this.sendDataChannelMessage({
      type: "request-chunks",
      fileId,
      chunks: missingChunks,
      timestamp: Date.now(),
    })
  }

  private handleChunkRequest(message: any) {
    const fileId = message.fileId
    const requestedChunks = message.chunks
    const sendingFile = this.sendingFiles.get(fileId)

    if (sendingFile) {
      console.log(`🔄 Resending ${requestedChunks.length} chunks for ${fileId}`)
      this.resendChunks(fileId, sendingFile.file, requestedChunks)
    }
  }

  private async resendChunks(fileId: string, file: File, chunkIndices: number[]) {
    for (const chunkIndex of chunkIndices) {
      if (this.dataChannel?.readyState !== "open") break

      // Wait for buffer
      while (this.dataChannel.bufferedAmount > this.config.bufferThreshold) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const start = chunkIndex * this.adaptiveChunkSize
      const end = Math.min(start + this.adaptiveChunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

      // Create chunk message
      const fileIdBytes = new TextEncoder().encode(fileId)
      const isLastChunk = chunkIndex === Math.ceil(file.size / this.adaptiveChunkSize) - 1
      const message = new ArrayBuffer(9 + fileIdBytes.length + arrayBuffer.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, chunkIndex)
      view.setUint8(8, isLastChunk ? 1 : 0)
      new Uint8Array(message, 9, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 9 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

      try {
        this.dataChannel.send(message)
      } catch (error) {
        console.error("❌ Error resending chunk:", error)
        break
      }
    }
  }

  private handleFileChunkAck(message: any) {
    // Handle chunk acknowledgment for flow control
    const fileId = message.fileId
    const transfer = this.fileTransfers.get(fileId)
    if (transfer) {
      transfer.lastActivity = Date.now()
      this.fileTransfers.set(fileId, transfer)
    }
  }

  private handleFileComplete(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer && transfer.direction === "sending") {
      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(message.fileId, transfer)
      this.updateFileTransfers()
      this.sendingFiles.delete(message.fileId)
      console.log(`✅ Enterprise file ${transfer.name} sent successfully`)
    }
  }

  private handleFileError(message: any) {
    const fileId = message.fileId
    const transfer = this.fileTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
      this.sendingFiles.delete(fileId)
      console.error(`❌ Enterprise file transfer error: ${message.error}`)
    }
  }

  private async calculateChecksum(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  private downloadFile(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private updateFileTransfers() {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private processTransferQueue() {
    while (this.transferQueue.length > 0 && this.activeTransfers < this.maxConcurrentTransfers) {
      const fileId = this.transferQueue.shift()
      if (fileId) {
        const sendingFile = this.sendingFiles.get(fileId)
        if (sendingFile) {
          this.activeTransfers++
          this.continueSendingFile(fileId, sendingFile.file)
        }
      }
    }
  }

  private async continueSendingFile(fileId: string, file: File) {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    try {
      await this.sendFileInChunks(fileId, file, transfer)
    } finally {
      this.activeTransfers--
      this.processTransferQueue()
    }
  }

  private async resumeSendingFile(fileId: string, file: File) {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    console.log(`🔄 Resuming file transfer: ${fileId}`)
    transfer.status = "transferring"
    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()

    await this.sendFileInChunks(fileId, file, transfer)
  }

  // Public methods for enterprise file transfer
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Enterprise connection not ready for file transfer")
      return
    }

    console.log(`📤 Starting enterprise file transfer: ${files.length} files`)

    // Prevent disconnection during file transfer
    this.preventDisconnect = true

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024 * 1024) {
        // 10GB limit
        this.onError?.(`File ${file.name} is too large (max 10GB)`)
        continue
      }

      await this.sendFile(file)
    }

    // Allow disconnection after transfer
    setTimeout(() => {
      this.preventDisconnect = false
    }, 5000)
  }

  private async sendFile(file: File) {
    const fileId = Math.random().toString(36).substring(2, 15)

    console.log(`📤 Enterprise sending: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const transfer: FileTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "transferring",
      direction: "sending",
      startTime: Date.now(),
      resumeOffset: 0,
      lastActivity: Date.now(),
    }

    this.fileTransfers.set(fileId, transfer)
    const controller = new AbortController()
    this.sendingFiles.set(fileId, { file, transfer, controller })
    this.updateFileTransfers()

    // Calculate checksum for large files
    const checksum = file.size > 100 * 1024 * 1024 ? await this.calculateChecksum(file) : undefined
    transfer.checksum = checksum

    // Send file start message
    this.sendDataChannelMessage({
      type: "file-start",
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      checksum,
      timestamp: Date.now(),
      chunkSize: this.adaptiveChunkSize,
    })

    // Add to queue or start immediately
    if (this.activeTransfers < this.maxConcurrentTransfers) {
      this.activeTransfers++
      await this.sendFileInChunks(fileId, file, transfer)
      this.activeTransfers--
      this.processTransferQueue()
    } else {
      this.transferQueue.push(fileId)
    }
  }

  private async sendFileInChunks(fileId: string, file: File, transfer: FileTransfer) {
    const totalChunks = Math.ceil(file.size / this.adaptiveChunkSize)
    let chunksSent = 0
    const startOffset = Math.floor((transfer.resumeOffset || 0) / this.adaptiveChunkSize)

    console.log(`📤 Sending ${totalChunks} chunks for ${file.name}`)

    // Create concurrent chunk senders
    const concurrentSenders = Math.min(this.optimalConcurrency, totalChunks - startOffset)
    const sendPromises: Promise<void>[] = []

    for (let i = 0; i < concurrentSenders; i++) {
      sendPromises.push(
        this.sendChunksConcurrently(fileId, file, transfer, startOffset + i, concurrentSenders, totalChunks)
      )
    }

    try {
      await Promise.all(sendPromises)

      // Send completion message
      this.sendDataChannelMessage({
        type: "file-complete",
        fileId,
        timestamp: Date.now(),
      })

      console.log(`✅ Enterprise file ${file.name} sent successfully`)
    } catch (error) {
      console.error("❌ Enterprise file send error:", error)
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
    }
  }

  private async sendChunksConcurrently(
    fileId: string,
    file: File,
    transfer: FileTransfer,
    startIndex: number,
    step: number,
    totalChunks: number
  ) {
    const sendingFile = this.sendingFiles.get(fileId)
    if (!sendingFile) return

    for (let i = startIndex; i < totalChunks; i += step) {
      if (sendingFile.controller.signal.aborted) break
      if (this.dataChannel?.readyState !== "open") break

      // Adaptive flow control
      while (this.dataChannel.bufferedAmount > this.config.bufferThreshold) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        if (sendingFile.controller.signal.aborted) return
      }

      const start = i * this.adaptiveChunkSize
      const end = Math.min(start + this.adaptiveChunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

      // Create enterprise chunk message
      const fileIdBytes = new TextEncoder().encode(fileId)
      const isLastChunk = i === totalChunks - 1
      const message = new ArrayBuffer(9 + fileIdBytes.length + arrayBuffer.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, i)
      view.setUint8(8, isLastChunk ? 1 : 0)
      new Uint8Array(message, 9, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 9 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

      try {
        this.dataChannel.send(message)

        // Update progress
        const progress = Math.min(Math.round(((i + 1) / totalChunks) * 100), 99)
        transfer.progress = progress
        transfer.lastActivity = Date.now()

        // Calculate speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          const bytesSent = (i + 1) * this.adaptiveChunkSize
          transfer.speed = bytesSent / elapsed
          this.onSpeedUpdate?.(transfer.speed)
          this.onTransferProgress?.(fileId, progress, transfer.speed)
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        // Adaptive delay based on connection quality
        if (this.connectionQuality === "poor") {
          await new Promise((resolve) => setTimeout(resolve, 5))
        } else if (this.connectionQuality === "good") {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      } catch (error) {
        console.error("❌ Error sending enterprise chunk:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        break
      }
    }
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Enterprise connection not ready for chat")
      return
    }

    const message = {
      id: Math.random().toString(36).substring(2, 15),
      content,
      sender,
      timestamp: new Date(),
      type,
    }

    this.onChatMessage?.(message)

    this.sendDataChannelMessage({
      type: "chat-message",
      id: message.id,
      content: message.content,
      sender: message.sender,
      timestamp: message.timestamp.getTime(),
      messageType: type,
    })
  }

  public pauseFileTransfer(fileId: string) {
    const sendingFile = this.sendingFiles.get(fileId)
    if (sendingFile) {
      sendingFile.controller.abort()
      const transfer = this.fileTransfers.get(fileId)
      if (transfer) {
        transfer.status = "paused"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
      }
    }
  }

  public resumeFileTransfer(fileId: string) {
    const sendingFile = this.sendingFiles.get(fileId)
    if (sendingFile) {
      const transfer = this.fileTransfers.get(fileId)
      if (transfer && transfer.status === "paused") {
        transfer.status = "resuming"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        
        // Create new controller and resume
        const newController = new AbortController()
        this.sendingFiles.set(fileId, { ...sendingFile, controller: newController })
        setTimeout(() => this.resumeSendingFile(fileId, sendingFile.file), 1000)
      }
    }
  }

  public cancelFileTransfer(fileId: string) {
    const sendingFile = this.sendingFiles.get(fileId)
    if (sendingFile) {
      sendingFile.controller.abort()
      this.sendingFiles.delete(fileId)
    }

    const transfer = this.fileTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
    }

    this.receivedChunks.delete(fileId)
  }

  public forceReconnect() {
    console.log("🔄 Enterprise force reconnect")
    this.cleanup()
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.initialize()
      }
    }, 1000)
  }

  public getConnectionState() {
    return this.connectionState
  }

  public getSignalingState() {
    return this.signalingState
  }

  public isDataChannelOpen() {
    return this.dataChannel?.readyState === "open"
  }

  public getConnectionStats() {
    return this.connectionStats
  }

  public getActiveTransfers() {
    return this.activeTransfers
  }

  public getTransferQueue() {
    return this.transferQueue.length
  }
}
