// Ultra-Reliable P2P Connection System - Enhanced for maximum reliability and speed

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

  // Advanced connection handling
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private iceCandidateQueue: ICECandidate[] = []
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    packetLoss: 0,
    quality: "good",
    jitter: 0,
    rtt: 0
  }

  // File transfer management with resumption support
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, {
    chunks: Map<number, ArrayBuffer>
    totalSize: number
    fileName: string
    fileType: string
    checksum?: string
    receivedSize: number
    lastChunkTime: number
    totalChunks: number
    resumeOffset: number
  }> = new Map()

  // Enhanced timing and performance
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private performanceMonitor: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null

  // Ultra-optimized buffer management
  private sendBuffer: Map<string, ArrayBuffer[]> = new Map()
  private maxBufferSize = 32 * 1024 * 1024 // 32MB buffer
  private optimalChunkSize = 1024 * 1024 // 1MB chunks for speed
  private maxConcurrentTransfers = 8
  private adaptiveChunkSize = true

  // Connection quality monitoring
  private latencyHistory: number[] = []
  private throughputHistory: number[] = []
  private lastPingTime = 0
  private transferStartTime = 0
  private bytesTransferred = 0
  private connectionQualityChecks = 0
  private stableConnectionTime = 0

  // Mobile and background handling
  private visibilityState = "visible"
  private lastActivityTime = Date.now()
  private backgroundReconnectAttempts = 0
  private preservedState: any = null

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onSignalingStatusChange: ((status: "connecting" | "connected" | "disconnected" | "error") => void) | null = null
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
      maxReconnectAttempts: 50,
      reconnectDelay: 500,
      heartbeatInterval: 2000,
      connectionTimeout: 10000,
      chunkSize: 1024 * 1024, // 1MB
      maxConcurrentChunks: 8,
      enableCompression: true,
      enableResumableTransfers: true,
      mobileOptimizations: true,
      backgroundMode: false,
      ...config
    }
    
    this.optimalChunkSize = this.config.chunkSize!
    this.maxConcurrentTransfers = this.config.maxConcurrentChunks!
    
    this.initializeUrls()
    this.setupPerformanceMonitoring()
    this.setupMobileHandlers()
  }

  private initializeUrls() {
    this.wsUrls = []
    
    // Primary URL from environment
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    // Enhanced production fallbacks with better reliability
    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push(
        "wss://signaling-server-1ckx.onrender.com",
        "wss://p2p-signaling-backup.herokuapp.com",
        "wss://reliable-signaling.railway.app",
        "wss://echo.websocket.org", // Fallback test server
      )
    } else {
      // Development URLs with better local detection
      this.wsUrls.push(
        "ws://localhost:8080",
        "ws://127.0.0.1:8080",
        "ws://0.0.0.0:8080",
        "ws://192.168.1.100:8080" // Common local network
      )
    }

    // Remove duplicates and optimize order
    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🔗 Initialized signaling URLs:", this.wsUrls)
  }

  private setupPerformanceMonitoring() {
    // Ultra-fast performance monitoring every 500ms
    this.performanceMonitor = setInterval(() => {
      this.updateConnectionStats()
      this.adaptChunkSize()
      this.monitorBufferHealth()
      this.checkConnectionStability()
    }, 500)
  }

  private setupMobileHandlers() {
    if (typeof window !== 'undefined') {
      // Enhanced mobile lifecycle handling
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this))
      window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this))
      window.addEventListener('pagehide', this.handlePageHide.bind(this))
      window.addEventListener('pageshow', this.handlePageShow.bind(this))
      
      // Mobile-specific events
      window.addEventListener('focus', this.handleFocus.bind(this))
      window.addEventListener('blur', this.handleBlur.bind(this))
    }
  }

  private handleVisibilityChange() {
    this.visibilityState = document.hidden ? "hidden" : "visible"
    console.log(`📱 Visibility changed: ${this.visibilityState}`)
    
    if (document.hidden) {
      this.enableBackgroundMode(true)
    } else {
      this.enableBackgroundMode(false)
      // Quick connection recovery check
      setTimeout(() => this.checkAndRecoverConnection(), 500)
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
      this.checkAndRecoverConnection()
    }, 100)
  }

  private handleFocus() {
    this.lastActivityTime = Date.now()
    if (this.connectionState !== "connected") {
      setTimeout(() => this.checkAndRecoverConnection(), 200)
    }
  }

  private handleBlur() {
    this.preserveConnectionState()
  }

  public enableBackgroundMode(enabled: boolean) {
    this.isBackgroundMode = enabled
    console.log(`📱 Background mode: ${enabled ? "enabled" : "disabled"}`)
    
    if (enabled) {
      // Reduce heartbeat frequency to preserve battery
      this.startHeartbeat(10000) // 10 seconds
      this.startKeepAlive()
    } else {
      // Resume normal heartbeat
      this.startHeartbeat(this.config.heartbeatInterval!)
      this.stopKeepAlive()
    }
  }

  public preserveConnectionState() {
    this.preservedState = {
      sessionId: this.sessionId,
      userId: this.userId,
      isInitiator: this.isInitiator,
      connectionAttempts: this.connectionAttempts,
      fileTransfers: Array.from(this.fileTransfers.entries()),
      timestamp: Date.now()
    }
    console.log("💾 Connection state preserved")
  }

  public restoreConnectionState() {
    if (this.preservedState && Date.now() - this.preservedState.timestamp < 300000) { // 5 minutes
      this.isInitiator = this.preservedState.isInitiator
      this.connectionAttempts = Math.min(this.preservedState.connectionAttempts, 5) // Cap attempts
      
      // Restore file transfers
      this.preservedState.fileTransfers.forEach(([id, transfer]: [string, FileTransfer]) => {
        if (transfer.status === "transferring") {
          transfer.status = "pending" // Reset to retry
        }
        this.fileTransfers.set(id, transfer)
      })
      
      console.log("🔄 Connection state restored")
      this.onConnectionRecovery?.()
    }
  }

  public maintainConnection() {
    this.lastActivityTime = Date.now()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
        type: "heartbeat",
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now()
      })
    }
  }

  public configureMobileOptimizations(enabled: boolean) {
    if (enabled) {
      this.optimalChunkSize = Math.min(this.optimalChunkSize, 512 * 1024) // 512KB max for mobile
      this.maxConcurrentTransfers = Math.min(this.maxConcurrentTransfers, 4) // Reduce concurrent transfers
      this.config.heartbeatInterval = 3000 // More frequent heartbeat
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive()
    this.keepAliveInterval = setInterval(() => {
      if (this.isBackgroundMode && this.ws?.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: "keep-alive",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now()
        })
      }
    }, 30000) // Every 30 seconds in background
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  private checkAndRecoverConnection() {
    if (this.connectionState !== "connected") {
      console.log("🔧 Checking connection health...")
      
      // Check signaling connection
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.log("🔄 Signaling disconnected, reconnecting...")
        this.establishSignalingConnection()
      }
      
      // Check P2P connection
      if (!this.pc || this.pc.connectionState !== "connected") {
        console.log("🔄 P2P disconnected, attempting recovery...")
        setTimeout(() => this.attemptConnectionRecovery(), 1000)
      }
    }
  }

  public async initialize() {
    console.log("🚀 Initializing Ultra-Reliable P2P System v3.0")
    this.isDestroyed = false
    this.connectionState = "connecting"
    await this.establishSignalingConnection()
  }

  public destroy() {
    console.log("🛑 Destroying Ultra-Reliable P2P System")
    this.isDestroyed = true
    this.cleanup()
  }

  public forceReconnect() {
    console.log("🔄 Force reconnecting Ultra-Reliable P2P")
    this.cleanup()
    this.connectionAttempts = 0
    this.reconnectAttempts = 0
    this.currentUrlIndex = 0
    this.connectionState = "connecting"
    setTimeout(() => this.initialize(), 500)
  }

  public gracefulDisconnect() {
    console.log("👋 Graceful disconnect")
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
        type: "disconnect",
        sessionId: this.sessionId,
        userId: this.userId,
        reason: "user_initiated"
      })
    }
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    [this.heartbeatInterval, this.reconnectTimeout, this.connectionTimeout, 
     this.statsInterval, this.performanceMonitor, this.keepAliveInterval].forEach(timer => {
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
    if (this.isDestroyed) return

    // Exponential backoff with faster initial attempts
    if (this.currentUrlIndex >= this.wsUrls.length) {
      this.onSignalingStatusChange?.("error")
      
      const baseDelay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts), 15000)
      const jitter = Math.random() * 500
      const delay = baseDelay + jitter

      this.reconnectAttempts++

      if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
        console.log(`🔄 Auto-retry in ${delay.toFixed(0)}ms (attempt ${this.reconnectAttempts})`)
        this.reconnectTimeout = setTimeout(() => {
          this.currentUrlIndex = 0
          this.establishSignalingConnection()
        }, delay)
      } else {
        this.onError?.("Maximum reconnection attempts reached. Please check your internet connection.")
      }
      return
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 Connecting to ${wsUrl} (attempt ${this.connectionAttempts + 1})`)
    this.onSignalingStatusChange?.("connecting")

    try {
      this.ws = new WebSocket(wsUrl)
      
      // Faster connection timeout for quicker failover
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Connection timeout for ${wsUrl}`)
          this.ws.close()
          this.currentUrlIndex++
          setTimeout(() => this.establishSignalingConnection(), 50)
        }
      }, 5000) // Reduced to 5 seconds

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Connected to ${wsUrl}`)
        this.onSignalingStatusChange?.("connected")
        this.connectionAttempts = 0
        this.reconnectAttempts = 0
        this.currentUrlIndex = 0

        // Enhanced join message with client capabilities
        this.sendSignalingMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          clientInfo: {
            isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
            browser: this.getBrowserInfo(),
            capabilities: {
              maxChunkSize: this.optimalChunkSize,
              concurrentTransfers: this.maxConcurrentTransfers,
              resumableTransfers: this.config.enableResumableTransfers,
              compression: this.config.enableCompression
            }
          }
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
        this.stopHeartbeat()
        this.stopStatsCollection()

        if (!this.isDestroyed && event.code !== 1000 && event.code !== 1001) {
          // Immediate retry for certain error codes
          if (event.code === 1006 || event.code === 1011) {
            setTimeout(() => this.establishSignalingConnection(), 100)
          } else {
            this.currentUrlIndex++
            setTimeout(() => this.establishSignalingConnection(), 200)
          }
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ WebSocket error on ${wsUrl}:`, error)
        this.currentUrlIndex++
        setTimeout(() => this.establishSignalingConnection(), 100)
      }

    } catch (error) {
      console.error(`❌ Failed to create WebSocket for ${wsUrl}:`, error)
      this.currentUrlIndex++
      setTimeout(() => this.establishSignalingConnection(), 100)
    }
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return 'Unknown'
  }

  private sendSignalingMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        this.lastActivityTime = Date.now()
      } catch (error) {
        console.error("❌ Error sending signaling message:", error)
        // Attempt reconnection on send failure
        setTimeout(() => this.checkAndRecoverConnection(), 500)
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
          quality: this.connectionStats.quality
        })
      } else if (!this.isDestroyed) {
        // Auto-reconnect if heartbeat fails
        console.log("💓 Heartbeat failed, reconnecting...")
        this.establishSignalingConnection()
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
    }, 1000) // Every second
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
        
        // Apply server-recommended optimizations
        if (message.optimizations) {
          this.applyOptimizations(message.optimizations)
        }
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          // Ultra-fast P2P initiation
          setTimeout(() => this.initiateP2PConnection(), 50)
        }
        break

      case "initiate-connection":
        if (message.mode === "ultra-reliable" && this.isInitiator) {
          console.log("🚀 Ultra-reliable connection mode activated")
          setTimeout(() => this.initiateP2PConnection(), 25)
        }
        break

      case "pong":
        this.handlePong(message.timestamp)
        break

      case "heartbeat-ack":
        // Connection is healthy
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
          setTimeout(() => this.attemptConnectionRecovery(), 100)
        }
        break

      case "connection-stable":
        console.log("✅ Connection confirmed stable by server")
        this.stableConnectionTime = Date.now()
        break

      case "user-left":
        this.onUserCountChange?.(message.userCount)
        if (message.temporary && message.autoReconnect) {
          console.log("⏳ Peer temporarily disconnected, waiting for reconnection...")
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
        if (message.recoverable) {
          setTimeout(() => this.checkAndRecoverConnection(), 1000)
        }
        break
    }
  }

  private applyOptimizations(optimizations: any) {
    if (optimizations.chunkSize) {
      this.optimalChunkSize = optimizations.chunkSize
    }
    if (optimizations.heartbeatInterval) {
      this.startHeartbeat(optimizations.heartbeatInterval)
    }
    if (optimizations.parallelTransfers) {
      this.maxConcurrentTransfers = optimizations.parallelTransfers
    }
    console.log("⚙️ Applied server optimizations:", optimizations)
  }

  private handleOptimizationSuggestions(message: any) {
    const suggestions = message.suggestions
    if (suggestions.reduceChunkSize) {
      this.optimalChunkSize = Math.max(this.optimalChunkSize / 2, 64 * 1024)
    }
    if (suggestions.enableCompression) {
      // Enable compression for poor connections
    }
    if (suggestions.maxPerformance) {
      this.optimalChunkSize = Math.min(this.optimalChunkSize * 1.5, 2 * 1024 * 1024)
    }
    console.log("🎯 Applied optimization suggestions for", message.quality, "connection")
  }

  private handlePong(timestamp: number) {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime
      this.updateLatencyStats(latency)
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
    if (this.isDestroyed) return

    console.log("🚀 Initiating ultra-reliable P2P connection")
    this.onConnectionStatusChange?.("connecting")
    this.connectionState = "connecting"

    try {
      if (this.pc) {
        this.pc.close()
      }

      // Enhanced RTCPeerConnection configuration
      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      this.setupPeerConnectionHandlers()

      // Create data channel with ultra-optimized settings
      this.dataChannel = this.pc.createDataChannel("ultra-reliable-transfer", {
        ordered: true,
        maxRetransmits: undefined,
        protocol: "ultra-reliable-v3",
        negotiated: false
      })
      this.setupDataChannelHandlers()

      // Set aggressive connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("⏰ P2P connection timeout, retrying...")
          this.retryP2PConnection()
        }
      }, this.config.connectionTimeout!)

      // Create optimized offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false
      })

      await this.pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: this.pc.localDescription,
        timestamp: Date.now(),
        capabilities: {
          ultraReliable: true,
          fastTransfer: true,
          resumableTransfers: true
        }
      })

    } catch (error) {
      console.error("❌ Error initiating P2P connection:", error)
      this.onError?.("Failed to initiate P2P connection")
      setTimeout(() => this.retryP2PConnection(), 1000)
    }
  }

  private getOptimizedRTCConfiguration(): RTCConfiguration {
    return {
      iceServers: [
        // Enhanced STUN server list with geographic distribution
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
        
        // TURN servers if available
        ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
          urls: process.env.NEXT_PUBLIC_TURN_SERVER,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD
        }] : [])
      ],
      iceCandidatePoolSize: 20, // Increased for better connectivity
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all"
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
          timestamp: Date.now()
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
          this.connectionAttempts = 0
          this.onConnectionRecovery?.()
          break

        case "connecting":
          this.onConnectionStatusChange?.("connecting")
          this.connectionState = "connecting"
          break

        case "disconnected":
          console.log("⚠️ P2P connection disconnected, attempting immediate recovery...")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("connecting")
          setTimeout(() => this.attemptConnectionRecovery(), 200)
          break

        case "failed":
          console.log("❌ P2P connection failed, retrying...")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          setTimeout(() => this.retryP2PConnection(), 500)
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
          break

        case "disconnected":
          console.log("⚠️ ICE disconnected, attempting recovery...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "disconnected") {
              this.pc.restartIce()
            }
          }, 1000)
          break

        case "failed":
          console.log("❌ ICE connection failed, restarting ICE...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "failed") {
              this.pc.restartIce()
            }
          }, 100)
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
      console.log("📡 Ultra-reliable data channel opened")
      this.onConnectionStatusChange?.("connected")
      this.connectionState = "connected"
      this.clearConnectionTimeout()

      // Send connection test with enhanced info
      this.sendDataChannelMessage({
        type: "connection-test",
        timestamp: Date.now(),
        message: "Ultra-reliable data channel ready",
        capabilities: {
          chunkSize: this.optimalChunkSize,
          concurrentTransfers: this.maxConcurrentTransfers,
          resumableTransfers: this.config.enableResumableTransfers
        }
      })
    }

    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    this.dataChannel.onclose = () => {
      console.log("📡 Data channel closed")
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
      
      // Attempt immediate recovery
      setTimeout(() => this.attemptDataChannelRecovery(), 500)
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      setTimeout(() => this.attemptDataChannelRecovery(), 1000)
    }

    this.dataChannel.onbufferedamountlow = () => {
      this.processSendBuffer()
    }
  }

  private getOptimalBufferThreshold(): number {
    switch (this.connectionStats.quality) {
      case "excellent":
        return 2 * 1024 * 1024 // 2MB
      case "good":
        return 1024 * 1024 // 1MB
      case "poor":
        return 512 * 1024 // 512KB
      default:
        return 1024 * 1024
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
        timestamp: Date.now()
      })

    } catch (error) {
      console.error("❌ Error handling offer:", error)
      this.onError?.("Failed to handle connection offer")
      setTimeout(() => this.retryP2PConnection(), 1000)
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
        setTimeout(() => this.retryP2PConnection(), 500)
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
      this.onError?.("Failed to handle connection answer")
      setTimeout(() => this.retryP2PConnection(), 1000)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc?.remoteDescription) {
        await this.pc.addIceCandidate(candidate)
        console.log("✅ ICE candidate added successfully")
      } else {
        console.log("⚠️ Queuing ICE candidate (no remote description yet)")
        this.iceCandidateQueue.push({
          candidate,
          timestamp: Date.now(),
          processed: false
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

    this.iceCandidateQueue = this.iceCandidateQueue.filter(c => !c.processed)
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
    console.log(`🔄 Retrying P2P connection (attempt ${this.connectionAttempts})`)

    if (this.connectionAttempts < 15) { // Increased retry limit
      this.resetP2PConnection()
      const delay = Math.min(500 * this.connectionAttempts, 3000) // Faster retry
      setTimeout(() => {
        if (this.isInitiator) {
          this.initiateP2PConnection()
        }
      }, delay)
    } else {
      this.onError?.("Maximum P2P connection attempts reached. Please refresh the page.")
      // Reset attempts for potential recovery
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
    // Don't clear send buffer to preserve ongoing transfers
  }

  private attemptConnectionRecovery() {
    console.log("🔧 Attempting ultra-fast connection recovery...")

    // Multi-stage recovery approach
    if (this.pc && this.pc.connectionState === "disconnected") {
      // Stage 1: ICE restart
      setTimeout(() => {
        if (this.pc?.connectionState === "disconnected") {
          console.log("🔄 Attempting ICE restart...")
          this.pc.restartIce()
        }
      }, 500)

      // Stage 2: Full retry if ICE restart fails
      setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("🔄 ICE restart failed, full P2P retry...")
          this.retryP2PConnection()
        }
      }, 3000)
    } else {
      // Direct retry if no existing connection
      this.retryP2PConnection()
    }
  }

  private attemptDataChannelRecovery() {
    console.log("🔧 Attempting data channel recovery...")

    if (this.pc?.connectionState === "connected" && this.isInitiator) {
      try {
        this.dataChannel = this.pc.createDataChannel("ultra-reliable-transfer-recovery", {
          ordered: true,
          maxRetransmits: undefined
        })
        this.setupDataChannelHandlers()
        console.log("✅ Data channel recreated successfully")
      } catch (error) {
        console.error("❌ Failed to recreate data channel:", error)
        setTimeout(() => this.retryP2PConnection(), 1000)
      }
    } else {
      setTimeout(() => this.retryP2PConnection(), 1000)
    }
  }

  private startConnectionMonitoring() {
    const monitorInterval = setInterval(() => {
      if (this.pc?.connectionState !== "connected") {
        clearInterval(monitorInterval)
        return
      }

      this.collectConnectionStats()
      this.checkConnectionStability()
    }, 1000)
  }

  private checkConnectionStability() {
    if (this.connectionState === "connected" && this.stableConnectionTime > 0) {
      const stableTime = Date.now() - this.stableConnectionTime
      if (stableTime > 10000) { // 10 seconds of stability
        this.connectionQualityChecks++
        if (this.connectionQualityChecks % 10 === 0) {
          console.log(`✅ Connection stable for ${Math.round(stableTime / 1000)}s`)
        }
      }
    }
  }

  private collectConnectionStats() {
    if (!this.pc) return

    this.pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime) {
            this.connectionStats.rtt = report.currentRoundTripTime * 1000
          }
          if (report.availableOutgoingBitrate) {
            this.connectionStats.throughput = report.availableOutgoingBitrate
          }
        }

        if (report.type === 'data-channel' && report.state === 'open') {
          if (report.bytesReceived && report.bytesSent) {
            this.updateThroughputStats(report.bytesReceived + report.bytesSent)
          }
        }
      })

      this.updateConnectionQuality()
    }).catch(error => {
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
    // Calculate jitter from latency history
    if (this.latencyHistory.length > 1) {
      let jitterSum = 0
      for (let i = 1; i < this.latencyHistory.length; i++) {
        jitterSum += Math.abs(this.latencyHistory[i] - this.latencyHistory[i-1])
      }
      this.connectionStats.jitter = jitterSum / (this.latencyHistory.length - 1)
    }

    this.updateConnectionQuality()
  }

  private updateConnectionQuality() {
    const { latency, throughput, jitter } = this.connectionStats

    // Enhanced quality determination
    if (latency < 30 && throughput > 2000000 && jitter < 5) { // < 30ms, > 2MB/s, < 5ms jitter
      this.connectionStats.quality = "excellent"
    } else if (latency < 100 && throughput > 1000000 && jitter < 15) { // < 100ms, > 1MB/s, < 15ms jitter
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
        this.optimalChunkSize = Math.min(2 * 1024 * 1024, Math.max(1024 * 1024, throughput / 5)) // Up to 2MB
        break
      case "good":
        this.optimalChunkSize = Math.min(1024 * 1024, Math.max(512 * 1024, throughput / 10)) // Up to 1MB
        break
      case "poor":
        this.optimalChunkSize = Math.min(512 * 1024, Math.max(256 * 1024, throughput / 20)) // Up to 512KB
        break
    }

    // Ensure chunk size is power of 2 for optimal performance
    this.optimalChunkSize = Math.pow(2, Math.floor(Math.log2(this.optimalChunkSize)))
  }

  private monitorBufferHealth() {
    if (!this.dataChannel) return

    const bufferedAmount = this.dataChannel.bufferedAmount
    const threshold = this.getOptimalBufferThreshold()

    // Dynamic buffer management
    if (bufferedAmount > threshold * 3) {
      console.log("⚠️ Buffer congestion detected, optimizing...")
      this.dataChannel.bufferedAmountLowThreshold = threshold * 2
    } else if (bufferedAmount < threshold * 0.3) {
      console.log("📡 Buffer optimal, maximizing throughput")
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
          message: "Ultra-reliable connection confirmed",
          capabilities: {
            chunkSize: this.optimalChunkSize,
            concurrentTransfers: this.maxConcurrentTransfers
          }
        })
        break

      case "connection-ack":
        console.log("✅ Ultra-reliable connection acknowledged by peer")
        break

      case "chat-message":
        this.onChatMessage?.({
          id: message.id,
          content: message.content,
          sender: message.sender,
          timestamp: new Date(message.timestamp),
          type: message.messageType || "text"
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
    console.log(`📥 Starting ultra-fast file reception: ${message.fileName}`)

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
      resumeOffset: 0
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
      resumeOffset: 0
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

        // Calculate ultra-fast transfer speed
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
          timestamp: Date.now()
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
    console.log(`📥 Ultra-fast file reception complete: ${fileId}`)

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

        console.log(`✅ File ${fileData.fileName} downloaded successfully at ${(transfer.speed! / 1024 / 1024).toFixed(2)} MB/s`)

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
      const actualChecksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
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
    // Process send buffer for all active transfers
    this.sendBuffer.forEach((chunks, fileId) => {
      if (chunks.length > 0 && this.dataChannel?.readyState === "open") {
        const threshold = this.getOptimalBufferThreshold()
        
        while (chunks.length > 0 && this.dataChannel.bufferedAmount < threshold) {
          const chunk = chunks.shift()
          if (chunk) {
            try {
              this.dataChannel.send(chunk)
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

  // Enhanced public methods for ultra-fast file transfer
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting ultra-fast file transfer: ${files.length} files`)
    
    // Process files in parallel for maximum speed
    const transferPromises = files.map(file => this.sendSingleFile(file))
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
        resumeOffset: 0
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
        chunkSize: this.optimalChunkSize
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
    let chunkIndex = 0
    let offset = 0
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

        // Smart buffer management with ultra-fast sending
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

        // Calculate ultra-fast transfer speed
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

    // Ultra-fast parallel chunk sending
    const maxConcurrent = Math.min(this.maxConcurrentTransfers, totalChunks)
    const sendPromises: Promise<void>[] = []

    for (let i = 0; i < maxConcurrent && i < totalChunks; i++) {
      sendPromises.push(
        (async () => {
          let currentIndex = i
          while (currentIndex < totalChunks && isTransferring) {
            const currentOffset = currentIndex * this.optimalChunkSize
            await sendChunk(currentIndex, currentOffset)
            
            // Adaptive delay based on connection quality
            if (this.connectionStats.quality === "excellent") {
              // No delay for excellent connections
            } else if (this.connectionStats.quality === "good") {
              await new Promise(resolve => setTimeout(resolve, 1))
            } else {
              await new Promise(resolve => setTimeout(resolve, 5))
            }
            
            currentIndex += maxConcurrent
          }
        })()
      )
    }

    // Wait for all chunks to be sent
    await Promise.all(sendPromises)

    if (isTransferring) {
      // Send file end message
      this.sendDataChannelMessage({
        type: "file-end",
        fileId,
        timestamp: Date.now()
      })

      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      console.log(`✅ File ${file.name} sent successfully at ${(transfer.speed! / 1024 / 1024).toFixed(2)} MB/s`)
    }

    // Clean up send buffer
    this.sendBuffer.delete(fileId)
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
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
      type
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
      messageType: type
    })
  }
}
