// Rock-Solid P2P Connection System - Permanent Connection Edition

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

  // Core connection components
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null

  // Connection state management
  private isInitiator = false
  private connectionAttempts = 0
  private reconnectAttempts = 0
  private isDestroyed = false
  private isBackgroundMode = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" | "error" = "connecting"

  // Rock-solid connection handling
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

  // Rock-solid timing and performance
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private performanceMonitor: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private connectionGuard: NodeJS.Timeout | null = null

  // Buffer management
  private sendBuffer: Map<string, ArrayBuffer[]> = new Map()
  private maxBufferSize = 64 * 1024 * 1024 // 64MB buffer
  private optimalChunkSize = 2 * 1024 * 1024 // 2MB chunks
  private maxConcurrentTransfers = 16
  private adaptiveChunkSize = true

  // Connection quality monitoring
  private latencyHistory: number[] = []
  private throughputHistory: number[] = []
  private lastPingTime = 0
  private transferStartTime = 0
  private bytesTransferred = 0
  private connectionQualityChecks = 0
  private stableConnectionTime = 0
  private lastSuccessfulConnection = 0

  // Mobile and background handling
  private visibilityState = "visible"
  private lastActivityTime = Date.now()
  private backgroundReconnectAttempts = 0
  private preservedState: any = null
  private connectionPersistence = true
  private mobileOptimized = false

  // Rock-solid connection protection
  private isConnecting = false
  private connectionLock = false
  private lastDisconnectTime = 0
  private disconnectCount = 0
  private forceStayConnected = true
  private connectionHealthy = false

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
      reconnectDelay: 1000, // 1 second delay to prevent spam
      heartbeatInterval: 5000, // 5 second heartbeat - more stable
      connectionTimeout: 10000, // 10 second timeout
      chunkSize: 2 * 1024 * 1024, // 2MB chunks
      maxConcurrentChunks: 16,
      enableCompression: false,
      enableResumableTransfers: true,
      mobileOptimizations: true,
      backgroundMode: false,
      ...config,
    }

    this.optimalChunkSize = this.config.chunkSize!
    this.maxConcurrentTransfers = this.config.maxConcurrentChunks!

    this.initializeUrls()
    this.setupConnectionGuard()
    this.setupPerformanceMonitoring()
    this.setupMobileHandlers()
  }

  private initializeUrls() {
    this.wsUrls = []

    // Primary URL from environment
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    // Production fallbacks
    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push(
        "wss://signaling-server-1ckx.onrender.com",
        "wss://p2p-signaling-backup.herokuapp.com",
        "wss://reliable-signaling.railway.app",
        "wss://ws-signaling.fly.dev",
        "wss://signaling.vercel.app",
      )
    } else {
      // Development URLs
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080", "ws://0.0.0.0:8080")
    }

    // Remove duplicates
    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🚀 Initialized rock-solid signaling URLs:", this.wsUrls.length)
  }

  private setupConnectionGuard() {
    // Rock-solid connection guard that prevents disconnections
    this.connectionGuard = setInterval(() => {
      if (this.isDestroyed) return

      // Check connection health every 2 seconds
      this.checkConnectionHealth()

      // Maintain connection if needed
      if (this.shouldMaintainConnection()) {
        this.maintainConnection()
      }

      // Auto-reconnect if disconnected
      if (this.shouldAutoReconnect()) {
        this.autoReconnect()
      }
    }, 2000) // 2 second monitoring
  }

  private checkConnectionHealth(): boolean {
    const wsHealthy = this.ws?.readyState === WebSocket.OPEN
    const p2pHealthy = this.pc?.connectionState === "connected"
    const dataChannelHealthy = this.dataChannel?.readyState === "open"

    this.connectionHealthy = wsHealthy && this.signalingState === "connected"

    // Update connection states
    if (wsHealthy && this.signalingState !== "connected") {
      this.signalingState = "connected"
      this.onSignalingStatusChange?.("connected")
      this.lastSuccessfulConnection = Date.now()
    }

    if (p2pHealthy && dataChannelHealthy && this.connectionState !== "connected") {
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.lastSuccessfulConnection = Date.now()
    }

    return this.connectionHealthy
  }

  private shouldMaintainConnection(): boolean {
    const now = Date.now()
    const timeSinceLastActivity = now - this.lastActivityTime
    const timeSinceLastSuccess = now - this.lastSuccessfulConnection

    // Maintain connection if:
    // 1. No activity in last 10 seconds
    // 2. No successful connection in last 5 seconds
    return this.forceStayConnected && (timeSinceLastActivity > 10000 || timeSinceLastSuccess > 5000)
  }

  private shouldAutoReconnect(): boolean {
    const now = Date.now()
    const timeSinceLastDisconnect = now - this.lastDisconnectTime

    // Auto-reconnect if:
    // 1. Not currently connecting
    // 2. Connection is not healthy
    // 3. Enough time has passed since last disconnect
    return (
      !this.isConnecting &&
      !this.connectionHealthy &&
      timeSinceLastDisconnect > this.config.reconnectDelay! &&
      this.forceStayConnected
    )
  }

  private autoReconnect() {
    if (this.isConnecting || this.connectionLock) return

    console.log("🔄 Auto-reconnecting...")
    this.reconnectAttempts++
    this.establishSignalingConnection()
  }

  private setupPerformanceMonitoring() {
    // Performance monitoring every 5 seconds
    this.performanceMonitor = setInterval(() => {
      this.updateConnectionStats()
      this.adaptChunkSize()
      this.monitorBufferHealth()
    }, 5000)
  }

  private setupMobileHandlers() {
    if (typeof window !== "undefined") {
      // Detect mobile device
      this.mobileOptimized = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

      if (this.mobileOptimized) {
        console.log("📱 Mobile device detected - enabling optimizations")
        this.enableMobileOptimizations()
      }

      // Mobile lifecycle handling
      document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this))
      window.addEventListener("beforeunload", this.handleBeforeUnload.bind(this))
      window.addEventListener("pagehide", this.handlePageHide.bind(this))
      window.addEventListener("pageshow", this.handlePageShow.bind(this))
      window.addEventListener("focus", this.handleFocus.bind(this))
      window.addEventListener("blur", this.handleBlur.bind(this))
    }
  }

  private enableMobileOptimizations() {
    // Optimize for mobile networks
    this.config.heartbeatInterval = 10000 // 10 seconds for mobile
    this.optimalChunkSize = Math.min(this.optimalChunkSize, 1024 * 1024) // 1MB max for mobile
    this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers, 8) // Reduce for mobile
    this.connectionPersistence = true
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
        this.maintainConnection()
      }, 1000) // 1 second delay for stability
    }
  }

  private handleBeforeUnload() {
    this.preserveConnectionState()
  }

  private handlePageHide() {
    console.log("📱 Page hidden - preserving state")
    this.preserveConnectionState()
    this.enableBackgroundMode(true)
  }

  private handlePageShow() {
    console.log("📱 Page shown - restoring state")
    this.enableBackgroundMode(false)
    setTimeout(() => {
      this.restoreConnectionState()
      this.maintainConnection()
    }, 1000)
  }

  private handleFocus() {
    this.lastActivityTime = Date.now()
    this.maintainConnection()
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
      // Maintain connection in background
      this.startKeepAlive()
      if (this.mobileOptimized) {
        this.startHeartbeat(15000) // 15 seconds for mobile background
      }
    } else {
      // Resume normal operation
      this.stopKeepAlive()
      this.startHeartbeat(this.config.heartbeatInterval!)
      // Check connection after resuming
      setTimeout(() => this.maintainConnection(), 2000)
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
    console.log("💾 State preserved")
  }

  public restoreConnectionState() {
    if (this.preservedState && Date.now() - this.preservedState.timestamp < 600000) {
      // 10 minutes
      this.isInitiator = this.preservedState.isInitiator
      this.connectionAttempts = Math.min(this.preservedState.connectionAttempts, 5)
      this.connectionStats = { ...this.preservedState.connectionStats }

      // Restore file transfers
      this.preservedState.fileTransfers.forEach(([id, transfer]: [string, FileTransfer]) => {
        if (transfer.status === "transferring") {
          transfer.status = "pending"
        }
        this.fileTransfers.set(id, transfer)
      })

      console.log("🔄 State restored")
      this.onConnectionRecovery?.()
    }
  }

  public maintainConnection() {
    this.lastActivityTime = Date.now()

    // Send heartbeat if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
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
      }
    }, 10000) // Every 10 seconds in background
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  public async initialize() {
    console.log("🚀 Initializing Rock-Solid P2P System v6.0")
    this.isDestroyed = false
    this.forceStayConnected = true
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    await this.establishSignalingConnection()
  }

  public destroy() {
    console.log("🛑 Destroying Rock-Solid P2P System")
    this.isDestroyed = true
    this.forceStayConnected = false
    this.cleanup()
  }

  public forceReconnect() {
    console.log("🔄 Force reconnecting")
    this.cleanup()
    this.connectionAttempts = 0
    this.reconnectAttempts = 0
    this.currentUrlIndex = 0
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    setTimeout(() => this.initialize(), 2000) // 2 second delay
  }

  public gracefulDisconnect() {
    console.log("👋 Graceful disconnect")
    this.forceStayConnected = false
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
      this.connectionGuard,
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
    this.connectionGuard = null

    // Close connections gracefully
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    if (this.dataChannel) {
      this.dataChannel = null
    }

    if (this.ws) {
      this.ws.close(1000, "Clean disconnect")
      this.ws = null
    }

    // Clear queues and buffers
    this.iceCandidateQueue = []
    this.sendBuffer.clear()
  }

  private async establishSignalingConnection() {
    if (this.isDestroyed || this.isConnecting || this.connectionLock) return

    this.isConnecting = true
    this.connectionLock = true

    // Reset if we've tried all URLs
    if (this.currentUrlIndex >= this.wsUrls.length) {
      this.currentUrlIndex = 0
      this.onSignalingStatusChange?.("error")
      this.signalingState = "error"

      // Wait before retrying
      const delay = Math.min(this.config.reconnectDelay! * Math.pow(1.5, this.reconnectAttempts), 10000)
      this.reconnectAttempts++

      console.log(`🔄 Retrying in ${delay}ms (attempt ${this.reconnectAttempts})`)
      this.reconnectTimeout = setTimeout(() => {
        this.connectionLock = false
        this.isConnecting = false
        if (this.forceStayConnected) {
          this.establishSignalingConnection()
        }
      }, delay)
      return
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🚀 Connecting to ${wsUrl}`)
    this.onSignalingStatusChange?.("connecting")
    this.signalingState = "connecting"

    try {
      // Close existing connection if any
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(wsUrl)

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Timeout for ${wsUrl}`)
          this.ws.close()
          this.currentUrlIndex++
          this.connectionLock = false
          this.isConnecting = false
          if (this.forceStayConnected) {
            setTimeout(() => this.establishSignalingConnection(), 1000)
          }
        }
      }, this.config.connectionTimeout!)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Connected to ${wsUrl}`)
        this.onSignalingStatusChange?.("connected")
        this.signalingState = "connected"
        this.connectionAttempts = 0
        this.reconnectAttempts = 0
        this.currentUrlIndex = 0
        this.lastSuccessfulConnection = Date.now()
        this.connectionLock = false
        this.isConnecting = false
        this.connectionHealthy = true

        // Send join message
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
              rockSolid: true,
            },
          },
        })

        this.startHeartbeat()
        this.startStatsCollection()
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
        this.connectionHealthy = false
        this.connectionLock = false
        this.isConnecting = false
        this.stopHeartbeat()
        this.stopStatsCollection()

        // Only reconnect if not destroyed and not a clean disconnect
        if (!this.isDestroyed && this.forceStayConnected && event.code !== 1000) {
          this.currentUrlIndex++
          setTimeout(() => {
            if (this.forceStayConnected) {
              this.establishSignalingConnection()
            }
          }, this.config.reconnectDelay!)
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ WebSocket error on ${wsUrl}:`, error)
        this.connectionLock = false
        this.isConnecting = false
        this.currentUrlIndex++
        if (this.forceStayConnected) {
          setTimeout(() => this.establishSignalingConnection(), this.config.reconnectDelay!)
        }
      }
    } catch (error) {
      console.error(`❌ Failed to create WebSocket for ${wsUrl}:`, error)
      this.connectionLock = false
      this.isConnecting = false
      this.currentUrlIndex++
      if (this.forceStayConnected) {
        setTimeout(() => this.establishSignalingConnection(), this.config.reconnectDelay!)
      }
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
      }
    } else {
      console.log("📤 Cannot send message - WebSocket not open")
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
          rockSolid: true,
        })
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
    }, 5000) // Every 5 seconds
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

        if (message.optimizations) {
          this.applyOptimizations(message.optimizations)
        }
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          setTimeout(() => this.initiateP2PConnection(), 2000) // 2 second delay
        }
        break

      case "initiate-connection":
        if (message.mode === "ultra-stable" && this.isInitiator) {
          console.log("⚡ Rock-solid connection mode activated")
          setTimeout(() => this.initiateP2PConnection(), 1000) // 1 second delay
        }
        break

      case "pong":
        this.handlePong(message.timestamp)
        break

      case "heartbeat-ack":
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

      case "connection-stable":
        console.log("✅ Connection confirmed stable by server")
        this.stableConnectionTime = Date.now()
        this.disconnectCount = 0
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
        break
    }
  }

  private applyOptimizations(optimizations: any) {
    if (optimizations.chunkSize) {
      this.optimalChunkSize = Math.max(optimizations.chunkSize, 1024 * 1024)
    }
    if (optimizations.heartbeatInterval) {
      this.startHeartbeat(Math.max(optimizations.heartbeatInterval, 5000))
    }
    if (optimizations.parallelTransfers) {
      this.maxConcurrentTransfers = Math.max(optimizations.parallelTransfers, 8)
    }
    console.log("⚙️ Applied optimizations:", optimizations)
  }

  private handleOptimizationSuggestions(message: any) {
    const suggestions = message.suggestions
    if (suggestions.maxPerformance) {
      this.optimalChunkSize = Math.min(this.optimalChunkSize * 1.5, 4 * 1024 * 1024)
      this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers + 2, 32)
    }
    if (suggestions.reduceChunkSize) {
      this.optimalChunkSize = Math.max(this.optimalChunkSize / 1.5, 512 * 1024)
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
    if (this.latencyHistory.length > 20) {
      this.latencyHistory.shift()
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    this.connectionStats.latency = avgLatency
    this.connectionStats.rtt = latency

    this.updateConnectionQuality()
  }

  private async initiateP2PConnection() {
    if (this.isDestroyed || this.pc) return

    console.log("⚡ Initiating rock-solid P2P connection")
    this.onConnectionStatusChange?.("connecting")
    this.connectionState = "connecting"

    try {
      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      this.setupPeerConnectionHandlers()

      this.dataChannel = this.pc.createDataChannel("rock-solid-transfer", {
        ordered: true,
        maxRetransmits: undefined,
        protocol: "rock-solid-v6",
        negotiated: false,
      })
      this.setupDataChannelHandlers()

      this.connectionTimeout = setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("⏰ P2P timeout, retrying...")
          this.retryP2PConnection()
        }
      }, this.config.connectionTimeout!)

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
          rockSolid: true,
          fastTransfer: true,
          resumableTransfers: true,
          maxSpeed: true,
        },
      })
    } catch (error) {
      console.error("❌ Error initiating P2P connection:", error)
      this.onError?.("Failed to initiate P2P connection")
      setTimeout(() => this.retryP2PConnection(), 2000)
    }
  }

  private getOptimizedRTCConfiguration(): RTCConfiguration {
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },

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
          console.log("✅ Rock-solid P2P connection established!")
          break

        case "connecting":
          this.onConnectionStatusChange?.("connecting")
          this.connectionState = "connecting"
          break

        case "disconnected":
          console.log("⚠️ P2P disconnected, will retry...")
          this.connectionState = "disconnected"
          this.lastDisconnectTime = Date.now()
          this.onConnectionStatusChange?.("connecting")
          setTimeout(() => this.retryP2PConnection(), 3000) // 3 second delay
          break

        case "failed":
          console.log("❌ P2P failed, retrying...")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          setTimeout(() => this.retryP2PConnection(), 5000) // 5 second delay
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
          console.log("⚠️ ICE disconnected, will restart...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "disconnected") {
              this.pc.restartIce()
            }
          }, 2000)
          break

        case "failed":
          console.log("❌ ICE failed, will restart...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "failed") {
              this.pc.restartIce()
            }
          }, 1000)
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
      console.log("📡 Rock-solid data channel opened")
      this.onConnectionStatusChange?.("connected")
      this.connectionState = "connected"
      this.lastSuccessfulConnection = Date.now()
      this.clearConnectionTimeout()

      this.sendDataChannelMessage({
        type: "connection-test",
        timestamp: Date.now(),
        message: "Rock-solid data channel ready",
        capabilities: {
          chunkSize: this.optimalChunkSize,
          concurrentTransfers: this.maxConcurrentTransfers,
          resumableTransfers: this.config.enableResumableTransfers,
          rockSolid: true,
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
      setTimeout(() => this.attemptDataChannelRecovery(), 3000)
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      setTimeout(() => this.attemptDataChannelRecovery(), 5000)
    }

    this.dataChannel.onbufferedamountlow = () => {
      this.processSendBuffer()
    }
  }

  private getOptimalBufferThreshold(): number {
    switch (this.connectionStats.quality) {
      case "excellent":
        return 4 * 1024 * 1024 // 4MB
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
      setTimeout(() => this.retryP2PConnection(), 2000)
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
        setTimeout(() => this.retryP2PConnection(), 2000)
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
      this.onError?.("Failed to handle connection answer")
      setTimeout(() => this.retryP2PConnection(), 2000)
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
    console.log(`🔄 Rock-solid P2P retry (attempt ${this.connectionAttempts})`)

    if (this.connectionAttempts < 20) {
      this.resetP2PConnection()
      const delay = Math.min(2000 * this.connectionAttempts, 10000) // Max 10 second delay
      setTimeout(() => {
        if (this.isInitiator) {
          this.initiateP2PConnection()
        }
      }, delay)
    } else {
      this.onError?.("Connection optimization in progress. The system continues trying automatically.")
      setTimeout(() => {
        this.connectionAttempts = 0
      }, 30000)
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
  }

  private attemptDataChannelRecovery() {
    console.log("🔧 Rock-solid data channel recovery...")

    if (this.pc?.connectionState === "connected" && this.isInitiator) {
      try {
        this.dataChannel = this.pc.createDataChannel("rock-solid-transfer-recovery", {
          ordered: true,
          maxRetransmits: undefined,
        })
        this.setupDataChannelHandlers()
        console.log("✅ Data channel recreated successfully")
      } catch (error) {
        console.error("❌ Failed to recreate data channel:", error)
        setTimeout(() => this.retryP2PConnection(), 2000)
      }
    } else {
      setTimeout(() => this.retryP2PConnection(), 2000)
    }
  }

  private startConnectionMonitoring() {
    const monitorInterval = setInterval(() => {
      if (this.pc?.connectionState !== "connected") {
        clearInterval(monitorInterval)
        return
      }

      this.collectConnectionStats()
    }, 5000) // Every 5 seconds
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

      if (this.throughputHistory.length > 20) {
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

    if (latency < 50 && throughput > 1000000 && jitter < 10) {
      this.connectionStats.quality = "excellent"
    } else if (latency < 100 && throughput > 500000 && jitter < 20) {
      this.connectionStats.quality = "good"
    } else {
      this.connectionStats.quality = "poor"
    }

    this.onConnectionQualityChange?.(this.connectionStats.quality)
  }

  private adaptChunkSize() {
    if (!this.adaptiveChunkSize) return

    const { quality, throughput } = this.connectionStats

    switch (quality) {
      case "excellent":
        this.optimalChunkSize = Math.min(4 * 1024 * 1024, Math.max(2 * 1024 * 1024, throughput / 4))
        break
      case "good":
        this.optimalChunkSize = Math.min(2 * 1024 * 1024, Math.max(1024 * 1024, throughput / 6))
        break
      case "poor":
        this.optimalChunkSize = Math.min(1024 * 1024, Math.max(512 * 1024, throughput / 10))
        break
    }

    this.optimalChunkSize = Math.pow(2, Math.floor(Math.log2(this.optimalChunkSize)))
  }

  private monitorBufferHealth() {
    if (!this.dataChannel) return

    const bufferedAmount = this.dataChannel.bufferedAmount
    const threshold = this.getOptimalBufferThreshold()

    if (bufferedAmount > threshold * 2) {
      console.log("⚠️ Buffer congestion, optimizing...")
      this.dataChannel.bufferedAmountLowThreshold = threshold
    } else if (bufferedAmount < threshold * 0.5) {
      console.log("📡 Buffer optimal")
      this.dataChannel.bufferedAmountLowThreshold = threshold
    }
  }

  private sendDataChannelMessage(message: any) {
    if (this.dataChannel?.readyState === "open") {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending data channel message:", error)
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
          message: "Rock-solid connection confirmed",
          capabilities: {
            chunkSize: this.optimalChunkSize,
            concurrentTransfers: this.maxConcurrentTransfers,
            rockSolid: true,
          },
        })
        break

      case "connection-ack":
        console.log("✅ Rock-solid connection acknowledged")
        this.lastSuccessfulConnection = Date.now()
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
    console.log(`📥 Starting rock-solid file reception: ${message.fileName}`)

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
        fileData.chunks.set(chunkIndex, chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.round((fileData.chunks.size / fileData.totalChunks) * 100)
        transfer.progress = progress

        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed || 0)

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
    console.log(`✅ Chunk ${message.chunkIndex} acknowledged for file ${message.fileId}`)
  }

  private async handleFileEnd(fileId: string) {
    console.log(`📥 Rock-solid file reception complete: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (fileData && transfer) {
      try {
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
    this.sendBuffer.forEach((chunks, fileId) => {
      if (chunks.length > 0 && this.dataChannel?.readyState === "open") {
        const threshold = this.getOptimalBufferThreshold()

        let sentCount = 0
        while (chunks.length > 0 && this.dataChannel.bufferedAmount < threshold && sentCount < 5) {
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

  // Public methods for file transfer
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting rock-solid file transfer: ${files.length} files`)

    this.maintainConnection()

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

      const checksum = await this.calculateChecksum(file)
      transfer.checksum = checksum

      this.sendDataChannelMessage({
        type: "file-start",
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        checksum,
        chunkSize: this.optimalChunkSize,
      })

      await this.sendFileInChunks(file, fileId, transfer)
    } catch (error) {
      console.error("❌ Error sending file:", error)
      this.onError?.("Failed to send file")
    }
  }

  private async sendFileInChunks(file: File, fileId: string, transfer: FileTransfer) {
    const totalChunks = Math.ceil(file.size / this.optimalChunkSize)
    let isTransferring = true

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

        const fileIdBytes = new TextEncoder().encode(fileId)
        const message = new ArrayBuffer(8 + fileIdBytes.length + arrayBuffer.byteLength)
        const view = new DataView(message)

        view.setUint32(0, fileIdBytes.length)
        view.setUint32(4, index)
        new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
        new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

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

        const progress = Math.min(Math.round(((index + 1) / totalChunks) * 100), 100)
        transfer.progress = progress

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

    const maxConcurrent = Math.min(this.maxConcurrentTransfers, totalChunks)
    const sendPromises: Promise<void>[] = []

    for (let i = 0; i < maxConcurrent && i < totalChunks; i++) {
      sendPromises.push(
        (async () => {
          let currentIndex = i
          while (currentIndex < totalChunks && isTransferring) {
            const currentOffset = currentIndex * this.optimalChunkSize
            await sendChunk(currentIndex, currentOffset)
            currentIndex += maxConcurrent
          }
        })(),
      )
    }

    await Promise.all(sendPromises)

    if (isTransferring) {
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
}
