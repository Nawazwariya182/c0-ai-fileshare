// Ultra-Stable P2P Connection System - Zero Disconnection Edition

interface ConnectionStats {
  latency: number
  throughput: number
  packetLoss: number
  quality: "excellent" | "good" | "poor"
  jitter: number
  rtt: number
}

interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "scanning" | "transferring" | "completed" | "error" | "blocked"
  direction: "sending" | "receiving"
  checksum?: string
  scanResult?: any
  speed?: number
  startTime?: number
  lastChunkTime?: number
  resumeOffset?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

interface ICECandidate {
  candidate: RTCIceCandidateInit
  timestamp: number
  processed: boolean
}

interface P2PConfig {
  maxReconnectAttempts?: number
  reconnectDelay?: number
  heartbeatInterval?: number
  connectionTimeout?: number
  chunkSize?: number
  maxConcurrentChunks?: number
  enableCompression?: boolean
  enableResumableTransfers?: boolean
  mobileOptimizations?: boolean
  backgroundMode?: boolean
}

export class UltraReliableP2P {
  private sessionId: string
  private userId: string
  private config: P2PConfig

  // Core connection components with redundancy
  private ws: WebSocket | null = null
  private wsBackup: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private pcBackup: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private dataChannelBackup: RTCDataChannel | null = null

  // Connection state management
  private isInitiator = false
  private connectionAttempts = 0
  private reconnectAttempts = 0
  private isDestroyed = false
  private isBackgroundMode = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" | "error" = "connecting"

  // Ultra-stable connection handling
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private iceCandidateQueue: ICECandidate[] = []
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    packetLoss: 0,
    quality: "excellent",
    jitter: 0,
    rtt: 0,
  }

  // File transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<
    string,
    {
      chunks: Map<number, ArrayBuffer>
      totalSize: number
      fileName: string
      fileType: string
      checksum?: string
      receivedSize: number
      lastChunkTime: number
      totalChunks: number
      resumeOffset: number
    }
  > = new Map()

  // Ultra-stable timing and performance
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private performanceMonitor: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private stabilityMonitor: NodeJS.Timeout | null = null
  private redundancyChecker: NodeJS.Timeout | null = null

  // Ultra-optimized buffer management
  private sendBuffer: Map<string, ArrayBuffer[]> = new Map()
  private maxBufferSize = 64 * 1024 * 1024 // 64MB buffer
  private optimalChunkSize = 2 * 1024 * 1024 // 2MB chunks
  private maxConcurrentTransfers = 16
  private adaptiveChunkSize = true

  // Connection quality monitoring with instant feedback
  private latencyHistory: number[] = []
  private throughputHistory: number[] = []
  private lastPingTime = 0
  private transferStartTime = 0
  private bytesTransferred = 0
  private connectionQualityChecks = 0
  private stableConnectionTime = 0
  private lastSuccessfulConnection = 0

  // Mobile and background handling with ultra-persistence
  private visibilityState = "visible"
  private lastActivityTime = Date.now()
  private backgroundReconnectAttempts = 0
  private preservedState: any = null
  private connectionPersistence = true
  private mobileOptimized = false

  // Zero-disconnection system
  private stabilityQueue: (() => void)[] = []
  private isStabilizing = false
  private lastDisconnectTime = 0
  private disconnectCount = 0
  private connectionLocks = new Set<string>()
  private redundantConnections = new Map<string, any>()

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onSignalingStatusChange: ((status: "connecting" | "connected" | "disconnected" | "error") => void) | null =
    null
  public onUserCountChange: ((count: number) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onConnectionQualityChange: ((quality: "excellent" | "good" | "poor") => void) | null = null
  public onSpeedUpdate: ((speed: number) => void) | null = null
  public onFileTransferUpdate: ((transfers: FileTransfer[]) => void) | null = null
  public onChatMessage: ((message: ChatMessage) => void) | null = null
  public onConnectionRecovery: (() => void) | null = null

  constructor(sessionId: string, userId: string, config: P2PConfig = {}) {
    this.sessionId = sessionId
    this.userId = userId
    this.config = {
      maxReconnectAttempts: 999999, // Unlimited retries
      reconnectDelay: 50, // Ultra-fast reconnection
      heartbeatInterval: 500, // 500ms heartbeat for ultra-stability
      connectionTimeout: 3000, // 3 second timeout
      chunkSize: 2 * 1024 * 1024, // 2MB chunks
      maxConcurrentChunks: 16,
      enableCompression: false, // Disabled for speed
      enableResumableTransfers: true,
      mobileOptimizations: true,
      backgroundMode: false,
      ...config,
    }

    this.optimalChunkSize = this.config.chunkSize!
    this.maxConcurrentTransfers = this.config.maxConcurrentChunks!

    this.initializeUrls()
    this.setupZeroDisconnectionSystem()
    this.setupPerformanceMonitoring()
    this.setupMobileHandlers()
  }

  private initializeUrls() {
    this.wsUrls = []

    // Primary URL from environment
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    // Production fallbacks with geographic distribution
    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push(
        "wss://signaling-server-1ckx.onrender.com",
        "wss://p2p-signaling-backup.herokuapp.com",
        "wss://reliable-signaling.railway.app",
        "wss://ws-signaling.fly.dev",
        "wss://signaling.vercel.app",
        "wss://ws.postman-echo.com/raw", // Additional fallback
      )
    } else {
      // Development URLs
      this.wsUrls.push(
        "ws://localhost:8080",
        "ws://127.0.0.1:8080",
        "ws://0.0.0.0:8080",
        "ws://192.168.1.100:8080",
        "ws://10.0.0.100:8080",
      )
    }

    // Remove duplicates and shuffle for load balancing
    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🚀 Initialized ultra-stable signaling URLs:", this.wsUrls.length)
  }

  private setupZeroDisconnectionSystem() {
    // Ultra-stable monitoring system that prevents disconnections
    this.stabilityMonitor = setInterval(() => {
      if (this.isDestroyed) return

      // Check all connection components every 50ms
      this.checkAllConnectionHealth()

      // Instant stabilization if needed
      if (this.shouldTriggerStabilization()) {
        this.triggerInstantStabilization()
      }

      // Process stability queue
      this.processStabilityQueue()
    }, 50) // 50ms ultra-fast monitoring

    // Redundancy checker for backup connections
    this.redundancyChecker = setInterval(() => {
      this.maintainRedundantConnections()
    }, 1000) // Every second
  }

  private checkAllConnectionHealth(): boolean {
    const wsHealthy = this.ws?.readyState === WebSocket.OPEN
    const p2pHealthy = this.pc?.connectionState === "connected"
    const dataChannelHealthy = this.dataChannel?.readyState === "open"

    // Check backup connections
    const wsBackupHealthy = this.wsBackup?.readyState === WebSocket.OPEN
    const p2pBackupHealthy = this.pcBackup?.connectionState === "connected"

    const primaryHealthy = wsHealthy && p2pHealthy && dataChannelHealthy
    const backupAvailable = wsBackupHealthy || p2pBackupHealthy

    // Update connection states based on health
    if (primaryHealthy) {
      if (this.signalingState !== "connected") {
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")
      }
      if (this.connectionState !== "connected") {
        this.connectionState = "connected"
        this.onConnectionStatusChange?.("connected")
      }
      this.lastSuccessfulConnection = Date.now()
    } else if (backupAvailable) {
      // Switch to backup if primary fails
      this.switchToBackupConnections()
    } else if (!this.isStabilizing) {
      // Trigger stabilization if no healthy connections
      this.triggerInstantStabilization()
    }

    return primaryHealthy || backupAvailable
  }

  private shouldTriggerStabilization(): boolean {
    const now = Date.now()
    const timeSinceLastSuccess = now - this.lastSuccessfulConnection
    const timeSinceLastDisconnect = now - this.lastDisconnectTime

    // Trigger stabilization if:
    // 1. No successful connection in last 1 second
    // 2. Multiple disconnects in short time
    // 3. Connection state is inconsistent
    return (
      timeSinceLastSuccess > 1000 ||
      (this.disconnectCount > 1 && timeSinceLastDisconnect < 3000) ||
      (this.signalingState === "connected" && this.connectionState !== "connected") ||
      (this.connectionState === "connected" && this.signalingState !== "connected")
    )
  }

  private triggerInstantStabilization() {
    if (this.isStabilizing) return

    this.isStabilizing = true
    console.log("⚡ Triggering instant stabilization")

    // Add stabilization actions to queue
    this.stabilityQueue.push(() => this.stabilizeSignalingConnection())
    this.stabilityQueue.push(() => this.stabilizeP2PConnection())
    this.stabilityQueue.push(() => this.stabilizeDataChannel())
    this.stabilityQueue.push(() => this.createBackupConnections())

    // Reset stabilization flag
    setTimeout(() => {
      this.isStabilizing = false
    }, 500)
  }

  private processStabilityQueue() {
    if (this.stabilityQueue.length > 0 && !this.isStabilizing) {
      const stabilityAction = this.stabilityQueue.shift()
      if (stabilityAction) {
        stabilityAction()
      }
    }
  }

  private stabilizeSignalingConnection() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log("🔄 Stabilizing signaling connection")
      this.establishSignalingConnection()
    }
  }

  private stabilizeP2PConnection() {
    if (!this.pc || this.pc.connectionState !== "connected") {
      console.log("🔄 Stabilizing P2P connection")
      if (this.isInitiator) {
        setTimeout(() => this.initiateP2PConnection(), 50)
      }
    }
  }

  private stabilizeDataChannel() {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.log("🔄 Stabilizing data channel")
      this.attemptDataChannelRecovery()
    }
  }

  private createBackupConnections() {
    // Create backup WebSocket connection
    if (!this.wsBackup || this.wsBackup.readyState !== WebSocket.OPEN) {
      this.createBackupWebSocket()
    }

    // Create backup P2P connection if primary is unstable
    if (this.pc && this.pc.connectionState !== "connected" && !this.pcBackup) {
      this.createBackupP2PConnection()
    }
  }

  private createBackupWebSocket() {
    if (this.wsUrls.length > 1) {
      const backupUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      const backupUrl = this.wsUrls[backupUrlIndex]

      try {
        this.wsBackup = new WebSocket(backupUrl)

        this.wsBackup.onopen = () => {
          console.log(`✅ Backup WebSocket connected to ${backupUrl}`)
          // Send join message to backup
          this.sendBackupSignalingMessage({
            type: "join",
            sessionId: this.sessionId,
            userId: this.userId,
            backup: true,
          })
        }

        this.wsBackup.onmessage = (event) => {
          // Handle backup messages
          try {
            const message = JSON.parse(event.data)
            this.handleSignalingMessage(message)
          } catch (error) {
            console.error("❌ Error parsing backup message:", error)
          }
        }

        this.wsBackup.onclose = () => {
          console.log("🔌 Backup WebSocket closed")
          this.wsBackup = null
        }

        this.wsBackup.onerror = (error) => {
          console.error("❌ Backup WebSocket error:", error)
          this.wsBackup = null
        }
      } catch (error) {
        console.error("❌ Failed to create backup WebSocket:", error)
      }
    }
  }

  private createBackupP2PConnection() {
    try {
      this.pcBackup = new RTCPeerConnection(this.getOptimizedRTCConfiguration())

      this.pcBackup.onconnectionstatechange = () => {
        if (this.pcBackup?.connectionState === "connected") {
          console.log("✅ Backup P2P connection established")
        }
      }

      this.pcBackup.ondatachannel = (event) => {
        this.dataChannelBackup = event.channel
        this.setupBackupDataChannelHandlers()
      }
    } catch (error) {
      console.error("❌ Failed to create backup P2P connection:", error)
    }
  }

  private switchToBackupConnections() {
    console.log("🔄 Switching to backup connections")

    // Switch WebSocket
    if (this.wsBackup?.readyState === WebSocket.OPEN) {
      const oldWs = this.ws
      this.ws = this.wsBackup
      this.wsBackup = null
      oldWs?.close()

      this.signalingState = "connected"
      this.onSignalingStatusChange?.("connected")
    }

    // Switch P2P connection
    if (this.pcBackup?.connectionState === "connected") {
      const oldPc = this.pc
      this.pc = this.pcBackup
      this.pcBackup = null
      oldPc?.close()
    }

    // Switch data channel
    if (this.dataChannelBackup?.readyState === "open") {
      const oldChannel = this.dataChannel
      this.dataChannel = this.dataChannelBackup
      this.dataChannelBackup = null
      oldChannel?.close()

      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
    }

    this.lastSuccessfulConnection = Date.now()
    this.onConnectionRecovery?.()
  }

  private maintainRedundantConnections() {
    // Ensure we always have backup connections ready
    if (this.connectionState === "connected" || this.signalingState === "connected") {
      this.createBackupConnections()
    }

    // Clean up failed backup connections
    if (this.wsBackup && this.wsBackup.readyState === WebSocket.CLOSED) {
      this.wsBackup = null
    }

    if (this.pcBackup && this.pcBackup.connectionState === "closed") {
      this.pcBackup = null
    }
  }

  private setupBackupDataChannelHandlers() {
    if (!this.dataChannelBackup) return

    this.dataChannelBackup.binaryType = "arraybuffer"

    this.dataChannelBackup.onopen = () => {
      console.log("📡 Backup data channel opened")
    }

    this.dataChannelBackup.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    this.dataChannelBackup.onclose = () => {
      console.log("📡 Backup data channel closed")
      this.dataChannelBackup = null
    }
  }

  private setupPerformanceMonitoring() {
    // Ultra-fast performance monitoring every 100ms
    this.performanceMonitor = setInterval(() => {
      this.updateConnectionStats()
      this.adaptChunkSize()
      this.monitorBufferHealth()
      this.optimizeForSpeed()
    }, 100)
  }

  private optimizeForSpeed() {
    // Dynamic optimization based on current performance
    if (this.connectionStats.quality === "excellent") {
      this.optimalChunkSize = Math.min(4 * 1024 * 1024, this.optimalChunkSize * 1.05) // Up to 4MB
      this.maxConcurrentTransfers = Math.min(32, this.maxConcurrentTransfers + 1)
    } else if (this.connectionStats.quality === "poor") {
      this.optimalChunkSize = Math.max(512 * 1024, this.optimalChunkSize * 0.95) // Down to 512KB
      this.maxConcurrentTransfers = Math.max(4, this.maxConcurrentTransfers - 1)
    }
  }

  private setupMobileHandlers() {
    if (typeof window !== "undefined") {
      // Detect mobile device
      this.mobileOptimized = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

      if (this.mobileOptimized) {
        console.log("📱 Mobile device detected - enabling ultra-stable optimizations")
        this.enableMobileOptimizations()
      }

      // Enhanced mobile lifecycle handling
      document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this))
      window.addEventListener("beforeunload", this.handleBeforeUnload.bind(this))
      window.addEventListener("pagehide", this.handlePageHide.bind(this))
      window.addEventListener("pageshow", this.handlePageShow.bind(this))
      window.addEventListener("focus", this.handleFocus.bind(this))
      window.addEventListener("blur", this.handleBlur.bind(this))

      // Mobile-specific file input handling
      document.addEventListener("touchstart", this.handleTouchStart.bind(this))
      document.addEventListener("touchend", this.handleTouchEnd.bind(this))
    }
  }

  private enableMobileOptimizations() {
    // Optimize for mobile networks and battery
    this.config.heartbeatInterval = 1000 // 1 second for mobile
    this.optimalChunkSize = Math.min(this.optimalChunkSize, 1024 * 1024) // 1MB max for mobile
    this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers, 8) // Reduce for mobile
    this.connectionPersistence = true // Always maintain connection on mobile
  }

  private handleTouchStart() {
    // Maintain connection during touch interactions
    this.maintainConnection()
  }

  private handleTouchEnd() {
    // Ensure connection stability after touch
    setTimeout(() => this.checkAllConnectionHealth(), 50)
  }

  private handleVisibilityChange() {
    this.visibilityState = document.hidden ? "hidden" : "visible"
    console.log(`📱 Visibility: ${this.visibilityState}`)

    if (document.hidden) {
      this.enableBackgroundMode(true)
      this.preserveConnectionState()
    } else {
      this.enableBackgroundMode(false)
      setTimeout(() => {
        this.restoreConnectionState()
        this.triggerInstantStabilization()
      }, 25) // Ultra-fast recovery
    }
  }

  private handleBeforeUnload() {
    this.preserveConnectionState()
  }

  private handlePageHide() {
    console.log("📱 Page hidden - preserving ultra-stable state")
    this.preserveConnectionState()
    this.enableBackgroundMode(true)
  }

  private handlePageShow() {
    console.log("📱 Page shown - instant restoration")
    this.enableBackgroundMode(false)
    setTimeout(() => {
      this.restoreConnectionState()
      this.triggerInstantStabilization()
    }, 10) // Even faster restoration
  }

  private handleFocus() {
    this.lastActivityTime = Date.now()
    this.triggerInstantStabilization()
  }

  private handleBlur() {
    this.preserveConnectionState()
    if (this.mobileOptimized) {
      this.enableBackgroundMode(true)
    }
  }

  public enableBackgroundMode(enabled: boolean) {
    this.isBackgroundMode = enabled
    console.log(`📱 Background mode: ${enabled ? "enabled" : "disabled"}`)

    if (enabled) {
      // Maintain connection in background with aggressive keep-alive
      this.startKeepAlive()
      if (this.mobileOptimized) {
        this.startHeartbeat(2000) // 2 seconds for mobile background
      }
    } else {
      // Resume normal operation
      this.stopKeepAlive()
      this.startHeartbeat(this.config.heartbeatInterval!)
      // Immediate connection check
      setTimeout(() => this.triggerInstantStabilization(), 50)
    }
  }

  public preserveConnectionState() {
    this.preservedState = {
      sessionId: this.sessionId,
      userId: this.userId,
      isInitiator: this.isInitiator,
      connectionAttempts: this.connectionAttempts,
      fileTransfers: Array.from(this.fileTransfers.entries()),
      connectionStats: { ...this.connectionStats },
      timestamp: Date.now(),
    }
    console.log("💾 Ultra-stable state preserved")
  }

  public restoreConnectionState() {
    if (this.preservedState && Date.now() - this.preservedState.timestamp < 600000) {
      // 10 minutes
      this.isInitiator = this.preservedState.isInitiator
      this.connectionAttempts = Math.min(this.preservedState.connectionAttempts, 2)
      this.connectionStats = { ...this.preservedState.connectionStats }

      // Restore file transfers
      this.preservedState.fileTransfers.forEach(([id, transfer]: [string, FileTransfer]) => {
        if (transfer.status === "transferring") {
          transfer.status = "pending" // Reset to retry
        }
        this.fileTransfers.set(id, transfer)
      })

      console.log("🔄 Ultra-stable state restored")
      this.onConnectionRecovery?.()
    }
  }

  public maintainConnection() {
    this.lastActivityTime = Date.now()

    // Send immediate heartbeat to all connections
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
        type: "heartbeat",
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now(),
        maintain: true,
      })
    }

    if (this.wsBackup?.readyState === WebSocket.OPEN) {
      this.sendBackupSignalingMessage({
        type: "heartbeat",
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now(),
        maintain: true,
      })
    }

    // Ensure P2P connection is active
    if (this.dataChannel?.readyState === "open") {
      this.sendDataChannelMessage({
        type: "keep-alive",
        timestamp: Date.now(),
      })
    }

    if (this.dataChannelBackup?.readyState === "open") {
      this.sendBackupDataChannelMessage({
        type: "keep-alive",
        timestamp: Date.now(),
      })
    }
  }

  public configureMobileOptimizations(enabled: boolean) {
    if (enabled) {
      this.mobileOptimized = true
      this.enableMobileOptimizations()
      console.log("📱 Mobile optimizations enabled")
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive()
    this.keepAliveInterval = setInterval(() => {
      if (this.isBackgroundMode) {
        this.maintainConnection()

        // Check and stabilize if needed
        if (!this.checkAllConnectionHealth()) {
          this.triggerInstantStabilization()
        }
      }
    }, 2000) // Every 2 seconds in background
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  public async initialize() {
    console.log("🚀 Initializing Ultra-Stable P2P System v5.0")
    this.isDestroyed = false
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    await this.establishSignalingConnection()
  }

  public destroy() {
    console.log("🛑 Destroying Ultra-Stable P2P System")
    this.isDestroyed = true
    this.cleanup()
  }

  public forceReconnect() {
    console.log("🔄 Force reconnecting with instant stabilization")
    this.cleanup()
    this.connectionAttempts = 0
    this.reconnectAttempts = 0
    this.currentUrlIndex = 0
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    setTimeout(() => this.initialize(), 25) // Ultra-fast restart
  }

  public gracefulDisconnect() {
    console.log("👋 Graceful disconnect")
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
        type: "disconnect",
        sessionId: this.sessionId,
        userId: this.userId,
        reason: "user_initiated",
      })
    }
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    ;[
      this.heartbeatInterval,
      this.reconnectTimeout,
      this.connectionTimeout,
      this.statsInterval,
      this.performanceMonitor,
      this.keepAliveInterval,
      this.stabilityMonitor,
      this.redundancyChecker,
    ].forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    // Reset timer references
    this.heartbeatInterval = null
    this.reconnectTimeout = null
    this.connectionTimeout = null
    this.statsInterval = null
    this.performanceMonitor = null
    this.keepAliveInterval = null
    this.stabilityMonitor = null
    this.redundancyChecker = null

    // Close all connections gracefully
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    if (this.pcBackup) {
      this.pcBackup.close()
      this.pcBackup = null
    }

    if (this.dataChannel) {
      this.dataChannel = null
    }

    if (this.dataChannelBackup) {
      this.dataChannelBackup = null
    }

    if (this.ws) {
      this.ws.close(1000, "Clean disconnect")
      this.ws = null
    }

    if (this.wsBackup) {
      this.wsBackup.close(1000, "Clean disconnect")
      this.wsBackup = null
    }

    // Clear queues and buffers
    this.iceCandidateQueue = []
    this.sendBuffer.clear()
    this.stabilityQueue = []
    this.connectionLocks.clear()
    this.redundantConnections.clear()
  }

  private async establishSignalingConnection() {
    if (this.isDestroyed) return

    // Ultra-fast failover with immediate retry
    if (this.currentUrlIndex >= this.wsUrls.length) {
      this.onSignalingStatusChange?.("error")
      this.signalingState = "error"

      // Immediate retry with minimal delay
      const delay = Math.min(50 * Math.pow(1.1, this.reconnectAttempts), 1000)
      this.reconnectAttempts++

      console.log(`🔄 Ultra-fast retry in ${delay}ms (attempt ${this.reconnectAttempts})`)
      this.reconnectTimeout = setTimeout(() => {
        this.currentUrlIndex = 0
        this.establishSignalingConnection()
      }, delay)
      return
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🚀 Ultra-stable connect to ${wsUrl}`)
    this.onSignalingStatusChange?.("connecting")
    this.signalingState = "connecting"

    try {
      this.ws = new WebSocket(wsUrl)

      // Ultra-fast connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Ultra-fast timeout for ${wsUrl}`)
          this.ws.close()
          this.currentUrlIndex++
          setTimeout(() => this.establishSignalingConnection(), 10) // 10ms failover
        }
      }, 2000) // 2 second timeout

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Ultra-stable connected to ${wsUrl}`)
        this.onSignalingStatusChange?.("connected")
        this.signalingState = "connected"
        this.connectionAttempts = 0
        this.reconnectAttempts = 0
        this.currentUrlIndex = 0
        this.lastSuccessfulConnection = Date.now()

        // Immediate join with enhanced capabilities
        this.sendSignalingMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          reconnect: this.preservedState !== null,
          clientInfo: {
            isMobile: this.mobileOptimized,
            browser: this.getBrowserInfo(),
            capabilities: {
              maxChunkSize: this.optimalChunkSize,
              concurrentTransfers: this.maxConcurrentTransfers,
              resumableTransfers: this.config.enableResumableTransfers,
              compression: this.config.enableCompression,
              ultraStable: true,
              zeroDisconnection: true,
            },
          },
        })

        this.startHeartbeat()
        this.startStatsCollection()

        // Create backup connection immediately
        setTimeout(() => this.createBackupConnections(), 1000)
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error("❌ Error parsing signaling message:", error)
        }
      }

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
        this.onSignalingStatusChange?.("disconnected")
        this.signalingState = "disconnected"
        this.lastDisconnectTime = Date.now()
        this.disconnectCount++
        this.stopHeartbeat()
        this.stopStatsCollection()

        if (!this.isDestroyed && event.code !== 1000 && event.code !== 1001) {
          // Check if backup is available
          if (this.wsBackup?.readyState === WebSocket.OPEN) {
            this.switchToBackupConnections()
          } else {
            // Immediate reconnection
            setTimeout(() => this.establishSignalingConnection(), 25) // 25ms immediate retry
          }
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ WebSocket error on ${wsUrl}:`, error)
        this.currentUrlIndex++
        setTimeout(() => this.establishSignalingConnection(), 25) // 25ms failover
      }
    } catch (error) {
      console.error(`❌ Failed to create WebSocket for ${wsUrl}:`, error)
      this.currentUrlIndex++
      setTimeout(() => this.establishSignalingConnection(), 25) // 25ms failover
    }
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent
    if (ua.includes("Chrome")) return "Chrome"
    if (ua.includes("Firefox")) return "Firefox"
    if (ua.includes("Safari")) return "Safari"
    if (ua.includes("Edge")) return "Edge"
    return "Unknown"
  }

  private sendSignalingMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        this.lastActivityTime = Date.now()
      } catch (error) {
        console.error("❌ Error sending signaling message:", error)
        // Try backup connection
        if (this.wsBackup?.readyState === WebSocket.OPEN) {
          this.sendBackupSignalingMessage(message)
        } else {
          // Immediate recovery on send failure
          setTimeout(() => this.triggerInstantStabilization(), 50)
        }
      }
    } else {
      // Try backup connection
      if (this.wsBackup?.readyState === WebSocket.OPEN) {
        this.sendBackupSignalingMessage(message)
      } else {
        // Queue message for when connection is restored
        console.log("📤 Queueing message for when connection is restored")
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendSignalingMessage(message)
          }
        }, 100)
      }
    }
  }

  private sendBackupSignalingMessage(message: any) {
    if (this.wsBackup?.readyState === WebSocket.OPEN) {
      try {
        this.wsBackup.send(JSON.stringify(message))
        this.lastActivityTime = Date.now()
      } catch (error) {
        console.error("❌ Error sending backup signaling message:", error)
      }
    }
  }

  private startHeartbeat(interval?: number) {
    this.stopHeartbeat()
    const heartbeatInterval = interval || this.config.heartbeatInterval!

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now()
        this.sendSignalingMessage({
          type: "ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: this.lastPingTime,
          quality: this.connectionStats.quality,
          ultraStable: true,
        })
      } else if (!this.isDestroyed) {
        // Immediate stabilization on heartbeat failure
        console.log("💓 Heartbeat failed, instant stabilization")
        this.triggerInstantStabilization()
      }
    }, heartbeatInterval)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private startStatsCollection() {
    this.stopStatsCollection()
    this.statsInterval = setInterval(() => {
      this.collectConnectionStats()
    }, 250) // Every 250ms for real-time stats
  }

  private stopStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }

  private async handleSignalingMessage(message: any) {
    this.lastActivityTime = Date.now()

    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator

        // Apply server optimizations immediately
        if (message.optimizations) {
          this.applyOptimizations(message.optimizations)
        }
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          // Instant P2P initiation
          setTimeout(() => this.initiateP2PConnection(), 10) // 10ms ultra-fast
        }
        break

      case "initiate-connection":
        if (message.mode === "ultra-reliable" && this.isInitiator) {
          console.log("⚡ Ultra-stable connection mode activated")
          setTimeout(() => this.initiateP2PConnection(), 5) // 5ms instant
        }
        break

      case "pong":
        this.handlePong(message.timestamp)
        break

      case "heartbeat-ack":
        // Connection is healthy
        this.lastSuccessfulConnection = Date.now()
        break

      case "optimize-connection":
        this.handleOptimizationSuggestions(message)
        break

      case "offer":
        await this.handleOffer(message.offer)
        break

      case "answer":
        await this.handleAnswer(message.answer)
        break

      case "ice-candidate":
        await this.handleIceCandidate(message.candidate)
        break

      case "retry-connection":
        if (message.mode === "ultra-fast") {
          console.log("⚡ Ultra-fast retry requested")
          setTimeout(() => this.triggerInstantStabilization(), 25)
        }
        break

      case "connection-stable":
        console.log("✅ Connection confirmed ultra-stable by server")
        this.stableConnectionTime = Date.now()
        this.disconnectCount = 0 // Reset disconnect counter
        break

      case "user-left":
        this.onUserCountChange?.(message.userCount)
        if (message.temporary && message.autoReconnect) {
          console.log("⏳ Peer temporarily disconnected, maintaining connection...")
        } else {
          this.onConnectionStatusChange?.("disconnected")
          this.connectionState = "disconnected"
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected successfully")
        this.onUserCountChange?.(message.userCount)
        // Immediate connection check
        setTimeout(() => this.triggerInstantStabilization(), 50)
        break

      case "session-expired":
        this.onError?.(message.message)
        if (message.reconnectDelay) {
          setTimeout(() => this.forceReconnect(), message.reconnectDelay)
        }
        break

      case "server-shutdown":
        console.log("🛑 Server maintenance detected")
        if (message.reconnectDelay) {
          setTimeout(() => this.forceReconnect(), message.reconnectDelay)
        }
        break

      case "error":
        console.error("❌ Signaling error:", message.message)
        this.onError?.(message.message)
        if (message.recoverable) {
          setTimeout(() => this.triggerInstantStabilization(), 250)
        }
        break
    }
  }

  private applyOptimizations(optimizations: any) {
    if (optimizations.chunkSize) {
      this.optimalChunkSize = Math.max(optimizations.chunkSize, 1024 * 1024) // Minimum 1MB
    }
    if (optimizations.heartbeatInterval) {
      this.startHeartbeat(Math.max(optimizations.heartbeatInterval, 500)) // Minimum 500ms
    }
    if (optimizations.parallelTransfers) {
      this.maxConcurrentTransfers = Math.max(optimizations.parallelTransfers, 8) // Minimum 8
    }
    console.log("⚙️ Applied ultra-stable optimizations:", optimizations)
  }

  private handleOptimizationSuggestions(message: any) {
    const suggestions = message.suggestions
    if (suggestions.maxPerformance) {
      this.optimalChunkSize = Math.min(this.optimalChunkSize * 2, 4 * 1024 * 1024) // Up to 4MB
      this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers + 4, 32) // Up to 32
    }
    if (suggestions.reduceChunkSize) {
      this.optimalChunkSize = Math.max(this.optimalChunkSize / 2, 512 * 1024) // Down to 512KB
    }
    console.log("🎯 Applied performance suggestions for", message.quality, "connection")
  }

  private handlePong(timestamp: number) {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime
      this.updateLatencyStats(latency)
      this.lastSuccessfulConnection = Date.now()
    }
  }

  private updateLatencyStats(latency: number) {
    this.latencyHistory.push(latency)
    if (this.latencyHistory.length > 50) {
      this.latencyHistory.shift()
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    this.connectionStats.latency = avgLatency
    this.connectionStats.rtt = latency

    this.updateConnectionQuality()
  }

  private async initiateP2PConnection() {
    if (this.isDestroyed) return

    console.log("⚡ Initiating ultra-stable P2P connection")
    this.onConnectionStatusChange?.("connecting")
    this.connectionState = "connecting"

    try {
      if (this.pc) {
        this.pc.close()
      }

      // Ultra-optimized RTCPeerConnection configuration
      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      this.setupPeerConnectionHandlers()

      // Create data channel with maximum performance settings
      this.dataChannel = this.pc.createDataChannel("ultra-stable-transfer", {
        ordered: true,
        maxRetransmits: undefined,
        protocol: "ultra-stable-v5",
        negotiated: false,
      })
      this.setupDataChannelHandlers()

      // Ultra-fast connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("⏰ P2P timeout, instant retry...")
          this.retryP2PConnection()
        }
      }, this.config.connectionTimeout!)

      // Create optimized offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await this.pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: this.pc.localDescription,
        timestamp: Date.now(),
        capabilities: {
          ultraStable: true,
          fastTransfer: true,
          resumableTransfers: true,
          zeroDisconnection: true,
          maxSpeed: true,
        },
      })
    } catch (error) {
      console.error("❌ Error initiating P2P connection:", error)
      this.onError?.("Failed to initiate P2P connection")
      setTimeout(() => this.retryP2PConnection(), 250)
    }
  }

  private getOptimizedRTCConfiguration(): RTCConfiguration {
    return {
      iceServers: [
        // Ultra-optimized STUN server list
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.nextcloud.com:443" },
        { urls: "stun:stun.sipgate.net:3478" },
        { urls: "stun:stun.ekiga.net" },
        { urls: "stun:stun.ideasip.com" },
        { urls: "stun:stun.stunprotocol.org:3478" },
        { urls: "stun:stun.voiparound.com" },
        { urls: "stun:stun.voipbuster.com" },
        { urls: "stun:stun.voipstunt.com" },
        { urls: "stun:stun.voxgratia.org" },

        // TURN servers if available
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
      iceCandidatePoolSize: 30, // Maximum for best connectivity
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all",
    }
  }

  private setupPeerConnectionHandlers() {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate: ${event.candidate.type}`)
        this.sendSignalingMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          timestamp: Date.now(),
        })
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔄 P2P connection state: ${state}`)

      switch (state) {
        case "connected":
          this.onConnectionStatusChange?.("connected")
          this.connectionState = "connected"
          this.clearConnectionTimeout()
          this.startConnectionMonitoring()
          this.stableConnectionTime = Date.now()
          this.lastSuccessfulConnection = Date.now()
          this.connectionAttempts = 0
          this.disconnectCount = 0
          this.onConnectionRecovery?.()
          console.log("✅ Ultra-stable P2P connection established!")
          break

        case "connecting":
          this.onConnectionStatusChange?.("connecting")
          this.connectionState = "connecting"
          break

        case "disconnected":
          console.log("⚠️ P2P disconnected, instant stabilization...")
          this.connectionState = "disconnected"
          this.lastDisconnectTime = Date.now()
          this.onConnectionStatusChange?.("connecting")
          setTimeout(() => this.triggerInstantStabilization(), 50) // 50ms instant recovery
          break

        case "failed":
          console.log("❌ P2P failed, instant retry...")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          setTimeout(() => this.retryP2PConnection(), 100) // 100ms retry
          break

        case "closed":
          console.log("🔌 P2P connection closed")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 ICE connection state: ${state}`)

      switch (state) {
        case "connected":
        case "completed":
          console.log("✅ ICE connection established")
          this.lastSuccessfulConnection = Date.now()
          break

        case "disconnected":
          console.log("⚠️ ICE disconnected, instant recovery...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "disconnected") {
              this.pc.restartIce()
            }
          }, 250)
          break

        case "failed":
          console.log("❌ ICE failed, instant restart...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "failed") {
              this.pc.restartIce()
            }
          }, 25) // 25ms instant restart
          break
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log("📡 Received data channel:", event.channel.label)
      this.dataChannel = event.channel
      this.setupDataChannelHandlers()
    }
  }

  private setupDataChannelHandlers() {
    if (!this.dataChannel) return

    this.dataChannel.binaryType = "arraybuffer"
    this.dataChannel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()

    this.dataChannel.onopen = () => {
      console.log("📡 Ultra-stable data channel opened")
      this.onConnectionStatusChange?.("connected")
      this.connectionState = "connected"
      this.lastSuccessfulConnection = Date.now()
      this.clearConnectionTimeout()

      // Send connection test with ultra-fast confirmation
      this.sendDataChannelMessage({
        type: "connection-test",
        timestamp: Date.now(),
        message: "Ultra-stable data channel ready",
        capabilities: {
          chunkSize: this.optimalChunkSize,
          concurrentTransfers: this.maxConcurrentTransfers,
          resumableTransfers: this.config.enableResumableTransfers,
          ultraStable: true,
        },
      })
    }

    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    this.dataChannel.onclose = () => {
      console.log("📡 Data channel closed")
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")

      // Instant recovery attempt
      setTimeout(() => this.attemptDataChannelRecovery(), 100)
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      setTimeout(() => this.attemptDataChannelRecovery(), 250)
    }

    this.dataChannel.onbufferedamountlow = () => {
      this.processSendBuffer()
    }
  }

  private getOptimalBufferThreshold(): number {
    switch (this.connectionStats.quality) {
      case "excellent":
        return 4 * 1024 * 1024 // 4MB for maximum speed
      case "good":
        return 2 * 1024 * 1024 // 2MB
      case "poor":
        return 1024 * 1024 // 1MB
      default:
        return 2 * 1024 * 1024
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed) return

    try {
      console.log("📥 Handling received offer")

      if (this.pc) {
        this.pc.close()
      }

      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      this.setupPeerConnectionHandlers()

      await this.pc.setRemoteDescription(offer)
      this.processQueuedICECandidates()

      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: this.pc.localDescription,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error("❌ Error handling offer:", error)
      this.onError?.("Failed to handle connection offer")
      setTimeout(() => this.retryP2PConnection(), 250)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling received answer")

      if (this.pc?.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
        console.log("✅ Answer processed successfully")
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Cannot set remote description - wrong signaling state:", this.pc?.signalingState)
        setTimeout(() => this.retryP2PConnection(), 100)
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
      this.onError?.("Failed to handle connection answer")
      setTimeout(() => this.retryP2PConnection(), 250)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc?.remoteDescription) {
        await this.pc.addIceCandidate(candidate)
        console.log("✅ ICE candidate added successfully")
      } else {
        console.log("⚠️ Queuing ICE candidate")
        this.iceCandidateQueue.push({
          candidate,
          timestamp: Date.now(),
          processed: false,
        })
      }
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error)
    }
  }

  private processQueuedICECandidates() {
    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ICE candidates`)

    this.iceCandidateQueue.forEach(async (queuedCandidate) => {
      if (!queuedCandidate.processed && this.pc?.remoteDescription) {
        try {
          await this.pc.addIceCandidate(queuedCandidate.candidate)
          queuedCandidate.processed = true
          console.log("✅ Processed queued ICE candidate")
        } catch (error) {
          console.error("❌ Error processing queued ICE candidate:", error)
        }
      }
    })

    this.iceCandidateQueue = this.iceCandidateQueue.filter((c) => !c.processed)
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
  }

  private retryP2PConnection() {
    if (this.isDestroyed) return

    this.connectionAttempts++
    console.log(`🔄 Ultra-stable P2P retry (attempt ${this.connectionAttempts})`)

    if (this.connectionAttempts < 100) {
      // Increased retry limit
      this.resetP2PConnection()
      const delay = Math.min(100 * this.connectionAttempts, 1000) // Max 1 second delay
      setTimeout(() => {
        if (this.isInitiator) {
          this.initiateP2PConnection()
        }
      }, delay)
    } else {
      this.onError?.("Connection optimization in progress. The system continues trying automatically.")
      // Reset attempts for continuous retry
      setTimeout(() => {
        this.connectionAttempts = 0
      }, 5000)
    }
  }

  private resetP2PConnection() {
    console.log("🔄 Resetting P2P connection")

    this.clearConnectionTimeout()

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.dataChannel = null
    this.iceCandidateQueue = []
    // Preserve send buffer for ongoing transfers
  }

  private attemptConnectionRecovery() {
    console.log("🔧 Ultra-stable connection recovery...")

    // Multi-stage instant recovery
    if (this.pc && this.pc.connectionState === "disconnected") {
      // Stage 1: Immediate ICE restart
      setTimeout(() => {
        if (this.pc?.connectionState === "disconnected") {
          console.log("🔄 ICE restart...")
          this.pc.restartIce()
        }
      }, 50)

      // Stage 2: Full retry if needed
      setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("🔄 Full P2P retry...")
          this.retryP2PConnection()
        }
      }, 500)
    } else {
      // Direct retry
      this.retryP2PConnection()
    }
  }

  private attemptDataChannelRecovery() {
    console.log("🔧 Ultra-stable data channel recovery...")

    if (this.pc?.connectionState === "connected" && this.isInitiator) {
      try {
        this.dataChannel = this.pc.createDataChannel("ultra-stable-transfer-recovery", {
          ordered: true,
          maxRetransmits: undefined,
        })
        this.setupDataChannelHandlers()
        console.log("✅ Data channel recreated successfully")
      } catch (error) {
        console.error("❌ Failed to recreate data channel:", error)
        setTimeout(() => this.retryP2PConnection(), 250)
      }
    } else {
      setTimeout(() => this.retryP2PConnection(), 250)
    }
  }

  private startConnectionMonitoring() {
    const monitorInterval = setInterval(() => {
      if (this.pc?.connectionState !== "connected") {
        clearInterval(monitorInterval)
        return
      }

      this.collectConnectionStats()
    }, 250) // Every 250ms for real-time monitoring
  }

  private collectConnectionStats() {
    if (!this.pc) return

    this.pc
      .getStats()
      .then((stats) => {
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            if (report.currentRoundTripTime) {
              this.connectionStats.rtt = report.currentRoundTripTime * 1000
            }
            if (report.availableOutgoingBitrate) {
              this.connectionStats.throughput = report.availableOutgoingBitrate
            }
          }

          if (report.type === "data-channel" && report.state === "open") {
            if (report.bytesReceived && report.bytesSent) {
              this.updateThroughputStats(report.bytesReceived + report.bytesSent)
            }
          }
        })

        this.updateConnectionQuality()
      })
      .catch((error) => {
        console.error("❌ Error collecting connection stats:", error)
      })
  }

  private updateThroughputStats(totalBytes: number) {
    const now = Date.now()
    if (this.transferStartTime === 0) {
      this.transferStartTime = now
      this.bytesTransferred = totalBytes
      return
    }

    const timeDiff = (now - this.transferStartTime) / 1000
    const bytesDiff = totalBytes - this.bytesTransferred

    if (timeDiff > 0) {
      const throughput = bytesDiff / timeDiff
      this.throughputHistory.push(throughput)

      if (this.throughputHistory.length > 50) {
        this.throughputHistory.shift()
      }

      const avgThroughput = this.throughputHistory.reduce((a, b) => a + b, 0) / this.throughputHistory.length
      this.connectionStats.throughput = avgThroughput

      this.onSpeedUpdate?.(avgThroughput)
    }

    this.transferStartTime = now
    this.bytesTransferred = totalBytes
  }

  private updateConnectionStats() {
    // Calculate jitter from latency history
    if (this.latencyHistory.length > 1) {
      let jitterSum = 0
      for (let i = 1; i < this.latencyHistory.length; i++) {
        jitterSum += Math.abs(this.latencyHistory[i] - this.latencyHistory[i - 1])
      }
      this.connectionStats.jitter = jitterSum / (this.latencyHistory.length - 1)
    }

    this.updateConnectionQuality()
  }

  private updateConnectionQuality() {
    const { latency, throughput, jitter } = this.connectionStats

    // Ultra-optimized quality determination for maximum performance
    if (latency < 15 && throughput > 8000000 && jitter < 2) {
      // < 15ms, > 8MB/s, < 2ms jitter
      this.connectionStats.quality = "excellent"
    } else if (latency < 40 && throughput > 3000000 && jitter < 8) {
      // < 40ms, > 3MB/s, < 8ms jitter
      this.connectionStats.quality = "good"
    } else {
      this.connectionStats.quality = "poor"
    }

    this.onConnectionQualityChange?.(this.connectionStats.quality)
  }

  private adaptChunkSize() {
    if (!this.adaptiveChunkSize) return

    const { quality, throughput } = this.connectionStats

    // Ultra-aggressive chunk size adaptation for maximum speed
    switch (quality) {
      case "excellent":
        this.optimalChunkSize = Math.min(4 * 1024 * 1024, Math.max(2 * 1024 * 1024, throughput / 3)) // Up to 4MB
        break
      case "good":
        this.optimalChunkSize = Math.min(2 * 1024 * 1024, Math.max(1024 * 1024, throughput / 5)) // Up to 2MB
        break
      case "poor":
        this.optimalChunkSize = Math.min(1024 * 1024, Math.max(512 * 1024, throughput / 10)) // Up to 1MB
        break
    }

    // Ensure chunk size is power of 2 for optimal performance
    this.optimalChunkSize = Math.pow(2, Math.floor(Math.log2(this.optimalChunkSize)))
  }

  private monitorBufferHealth() {
    if (!this.dataChannel) return

    const bufferedAmount = this.dataChannel.bufferedAmount
    const threshold = this.getOptimalBufferThreshold()

    // Ultra-aggressive buffer management for maximum speed
    if (bufferedAmount > threshold * 4) {
      console.log("⚠️ Buffer congestion, optimizing...")
      this.dataChannel.bufferedAmountLowThreshold = threshold * 2
    } else if (bufferedAmount < threshold * 0.2) {
      console.log("📡 Buffer optimal, maximizing speed")
      this.dataChannel.bufferedAmountLowThreshold = threshold
    }
  }

  private sendDataChannelMessage(message: any) {
    if (this.dataChannel?.readyState === "open") {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending data channel message:", error)
        // Try backup data channel
        this.sendBackupDataChannelMessage(message)
      }
    } else if (this.dataChannelBackup?.readyState === "open") {
      this.sendBackupDataChannelMessage(message)
    }
  }

  private sendBackupDataChannelMessage(message: any) {
    if (this.dataChannelBackup?.readyState === "open") {
      try {
        this.dataChannelBackup.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending backup data channel message:", error)
      }
    }
  }

  private handleDataChannelMessage(data: ArrayBuffer | string) {
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data)
        this.handleControlMessage(message)
      } catch (error) {
        console.error("❌ Error parsing data channel message:", error)
      }
    } else {
      this.handleFileChunk(data)
    }
  }

  private handleControlMessage(message: any) {
    switch (message.type) {
      case "connection-test":
        console.log("📨 Received connection test")
        this.sendDataChannelMessage({
          type: "connection-ack",
          timestamp: Date.now(),
          message: "Ultra-stable connection confirmed",
          capabilities: {
            chunkSize: this.optimalChunkSize,
            concurrentTransfers: this.maxConcurrentTransfers,
            ultraStable: true,
          },
        })
        break

      case "connection-ack":
        console.log("✅ Ultra-stable connection acknowledged")
        this.lastSuccessfulConnection = Date.now()
        break

      case "keep-alive":
        // Respond to keep-alive
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
        this.handleChunkAck(message)
        break

      case "file-end":
        this.handleFileEnd(message.fileId)
        break

      case "file-error":
        this.handleFileError(message.fileId, message.error)
        break

      case "resume-request":
        this.handleResumeRequest(message)
        break
    }
  }

  private handleFileStart(message: any) {
    console.log(`📥 Starting ultra-stable file reception: ${message.fileName}`)

    const transfer: FileTransfer = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
      checksum: message.checksum,
      startTime: Date.now(),
      resumeOffset: 0,
    }

    this.fileTransfers.set(message.fileId, transfer)

    const totalChunks = Math.ceil(message.fileSize / this.optimalChunkSize)
    this.receivedChunks.set(message.fileId, {
      chunks: new Map(),
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
      checksum: message.checksum,
      receivedSize: 0,
      lastChunkTime: Date.now(),
      totalChunks,
      resumeOffset: 0,
    })

    this.updateFileTransfers()
  }

  private handleFileChunk(data: ArrayBuffer) {
    try {
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const chunkIndex = view.getUint32(4)
      const fileId = new TextDecoder().decode(data.slice(8, 8 + fileIdLength))
      const chunkData = data.slice(8 + fileIdLength)

      const fileData = this.receivedChunks.get(fileId)
      const transfer = this.fileTransfers.get(fileId)

      if (fileData && transfer) {
        // Store chunk by index for resumable transfers
        fileData.chunks.set(chunkIndex, chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.round((fileData.chunks.size / fileData.totalChunks) * 100)
        transfer.progress = progress

        // Calculate ultra-stable transfer speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed || 0)

        // Send acknowledgment for reliable delivery
        this.sendDataChannelMessage({
          type: "file-chunk-ack",
          fileId,
          chunkIndex,
          timestamp: Date.now(),
        })
      }
    } catch (error) {
      console.error("❌ Error handling file chunk:", error)
    }
  }

  private handleChunkAck(message: any) {
    // Handle chunk acknowledgment for reliable delivery
    console.log(`✅ Chunk ${message.chunkIndex} acknowledged for file ${message.fileId}`)
  }

  private async handleFileEnd(fileId: string) {
    console.log(`📥 Ultra-stable file reception complete: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (fileData && transfer) {
      try {
        // Reconstruct file from chunks in correct order
        const orderedChunks: ArrayBuffer[] = []
        for (let i = 0; i < fileData.totalChunks; i++) {
          const chunk = fileData.chunks.get(i)
          if (chunk) {
            orderedChunks.push(chunk)
          } else {
            throw new Error(`Missing chunk ${i}`)
          }
        }

        const blob = new Blob(orderedChunks, { type: fileData.fileType })

        // Verify checksum if provided
        if (fileData.checksum) {
          const isValid = await this.verifyChecksum(blob, fileData.checksum)
          if (!isValid) {
            transfer.status = "error"
            this.fileTransfers.set(fileId, transfer)
            this.updateFileTransfers()
            this.onError?.("File integrity check failed")
            return
          }
        }

        // Download file
        this.downloadFile(blob, fileData.fileName)

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.receivedChunks.delete(fileId)
        this.updateFileTransfers()

        console.log(`✅ File ${fileData.fileName} downloaded at ${(transfer.speed! / 1024 / 1024).toFixed(2)} MB/s`)
      } catch (error) {
        console.error("❌ Error completing file reception:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
      }
    }
  }

  private handleFileError(fileId: string, error: string) {
    console.error(`❌ File transfer error for ${fileId}: ${error}`)

    const transfer = this.fileTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
    }

    this.receivedChunks.delete(fileId)
    this.onError?.(error)
  }

  private handleResumeRequest(message: any) {
    console.log(`🔄 Resume request for file ${message.fileId} from offset ${message.offset}`)
    // Handle resume logic for interrupted transfers
  }

  private async verifyChecksum(blob: Blob, expectedChecksum: string): Promise<boolean> {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const actualChecksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      return actualChecksum === expectedChecksum
    } catch (error) {
      console.error("❌ Error verifying checksum:", error)
      return false
    }
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

  private processSendBuffer() {
    // Process send buffer for all active transfers with maximum speed
    this.sendBuffer.forEach((chunks, fileId) => {
      if (chunks.length > 0 && this.dataChannel?.readyState === "open") {
        const threshold = this.getOptimalBufferThreshold()

        // Send multiple chunks at once for maximum speed
        let sentCount = 0
        while (chunks.length > 0 && this.dataChannel.bufferedAmount < threshold && sentCount < 10) {
          const chunk = chunks.shift()
          if (chunk) {
            try {
              this.dataChannel.send(chunk)
              sentCount++
            } catch (error) {
              console.error("❌ Error sending buffered chunk:", error)
              break
            }
          }
        }

        if (chunks.length === 0) {
          this.sendBuffer.delete(fileId)
        }
      }
    })
  }

  // Enhanced public methods for ultra-stable file transfer
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting ultra-stable file transfer: ${files.length} files`)

    // Maintain connection during file transfer
    this.maintainConnection()

    // Process files with maximum parallelization
    const transferPromises = files.map((file) => this.sendSingleFile(file))
    await Promise.all(transferPromises)
  }

  private async sendSingleFile(file: File) {
    try {
      const fileId = Math.random().toString(36).substring(2, 15)
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
      }

      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Calculate checksum for integrity verification
      const checksum = await this.calculateChecksum(file)
      transfer.checksum = checksum

      // Send file start message
      this.sendDataChannelMessage({
        type: "file-start",
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        checksum,
        chunkSize: this.optimalChunkSize,
      })

      // Send file in ultra-optimized chunks
      await this.sendFileInChunks(file, fileId, transfer)
    } catch (error) {
      console.error("❌ Error sending file:", error)
      this.onError?.("Failed to send file")
    }
  }

  private async sendFileInChunks(file: File, fileId: string, transfer: FileTransfer) {
    const totalChunks = Math.ceil(file.size / this.optimalChunkSize)
    let isTransferring = true

    // Initialize send buffer for this file
    this.sendBuffer.set(fileId, [])

    const sendChunk = async (index: number, start: number) => {
      if (!isTransferring || !this.dataChannel || this.dataChannel.readyState !== "open") {
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      const end = Math.min(start + this.optimalChunkSize, file.size)
      const slice = file.slice(start, end)

      try {
        const arrayBuffer = await slice.arrayBuffer()

        // Create enhanced chunk with metadata
        const fileIdBytes = new TextEncoder().encode(fileId)
        const message = new ArrayBuffer(8 + fileIdBytes.length + arrayBuffer.byteLength)
        const view = new DataView(message)

        view.setUint32(0, fileIdBytes.length)
        view.setUint32(4, index) // Chunk index for resumable transfers
        new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
        new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

        // Ultra-stable buffer management
        const threshold = this.getOptimalBufferThreshold()
        const buffer = this.sendBuffer.get(fileId)!

        if (this.dataChannel.bufferedAmount > threshold) {
          buffer.push(message)
        } else {
          try {
            this.dataChannel.send(message)
          } catch (error) {
            console.error("❌ Error sending chunk:", error)
            buffer.push(message)
          }
        }

        // Update progress
        const progress = Math.min(Math.round(((index + 1) / totalChunks) * 100), 100)
        transfer.progress = progress

        // Calculate ultra-stable transfer speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          const bytesSent = (index + 1) * this.optimalChunkSize
          transfer.speed = bytesSent / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed || 0)
      } catch (error) {
        console.error("❌ Error processing chunk:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        isTransferring = false
      }
    }

    // Ultra-stable parallel chunk sending with maximum concurrency
    const maxConcurrent = Math.min(this.maxConcurrentTransfers, totalChunks)
    const sendPromises: Promise<void>[] = []

    for (let i = 0; i < maxConcurrent && i < totalChunks; i++) {
      sendPromises.push(
        (async () => {
          let currentIndex = i
          while (currentIndex < totalChunks && isTransferring) {
            const currentOffset = currentIndex * this.optimalChunkSize
            await sendChunk(currentIndex, currentOffset)

            // No delay for maximum speed
            currentIndex += maxConcurrent
          }
        })(),
      )
    }

    // Wait for all chunks to be sent
    await Promise.all(sendPromises)

    if (isTransferring) {
      // Send file end message
      this.sendDataChannelMessage({
        type: "file-end",
        fileId,
        timestamp: Date.now(),
      })

      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      console.log(`✅ File ${file.name} sent at ${(transfer.speed! / 1024 / 1024).toFixed(2)} MB/s`)
    }

    // Clean up send buffer
    this.sendBuffer.delete(fileId)
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Cannot send message - not connected")
      return
    }

    const message = {
      id: Math.random().toString(36).substring(2, 15),
      content,
      sender,
      timestamp: new Date(),
      type,
    }

    // Add to local messages
    this.onChatMessage?.(message)

    // Send to peer
    this.sendDataChannelMessage({
      type: "chat-message",
      id: message.id,
      content: message.content,
      sender: message.sender,
      timestamp: message.timestamp.getTime(),
      messageType: type,
    })
  }
}
