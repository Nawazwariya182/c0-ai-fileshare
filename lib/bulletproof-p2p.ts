// Bulletproof P2P System - Maximum speed, zero disconnections, instant reconnection
import type { MobileConnectionManager } from "./mobile-connection-manager"

interface ConnectionStats {
  latency: number
  throughput: number
  packetLoss: number
  quality: "excellent" | "good" | "poor"
  jitter: number
  rtt: number
  bytesTransferred: number
  transferStartTime: number
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
  retryCount?: number
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
  retryCount: number
}

interface ConnectionPool {
  primary: RTCPeerConnection | null
  backup: RTCPeerConnection | null
  dataChannels: RTCDataChannel[]
  activeChannel: RTCDataChannel | null
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private mobileManager: MobileConnectionManager

  // Connection pool for redundancy
  private connectionPool: ConnectionPool = {
    primary: null,
    backup: null,
    dataChannels: [],
    activeChannel: null,
  }

  // WebSocket connections with failover
  private wsConnections: WebSocket[] = []
  private activeWs: WebSocket | null = null
  private wsUrls: string[] = []
  private currentUrlIndex = 0

  // Connection state management
  private isInitiator = false
  private connectionAttempts = 0
  private reconnectAttempts = 0
  private isDestroyed = false
  private isInBackground = false

  // Advanced connection handling
  private iceCandidateQueue: ICECandidate[] = []
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    packetLoss: 0,
    quality: "good",
    jitter: 0,
    rtt: 0,
    bytesTransferred: 0,
    transferStartTime: 0,
  }

  // File transfer management with redundancy
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<
    string,
    {
      chunks: ArrayBuffer[]
      totalSize: number
      fileName: string
      fileType: string
      checksum?: string
      receivedSize: number
      lastChunkTime: number
      expectedChunks: number
      receivedChunkIds: Set<number>
    }
  > = new Map()

  // Ultra-fast timing and performance
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private performanceMonitor: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null

  // Maximum speed buffer management
  private sendBuffer: ArrayBuffer[] = []
  private maxBufferSize = 32 * 1024 * 1024 // 32MB buffer for maximum speed
  private optimalChunkSize = 1048576 // 1MB chunks for maximum speed
  private maxConcurrentChunks = 16 // Send multiple chunks simultaneously
  private adaptiveChunkSize = true

  // Connection quality monitoring with mobile optimization
  private latencyHistory: number[] = []
  private throughputHistory: number[] = []
  private lastPingTime = 0
  private transferStartTime = 0
  private bytesTransferred = 0
  private networkChangeCount = 0

  // Instant reconnection system
  private reconnectionQueue: (() => void)[] = []
  private isReconnecting = false
  private lastSuccessfulConnection = 0
  private connectionHealthScore = 100

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
  public onReconnectAttempt: ((attempts: number) => void) | null = null

  constructor(sessionId: string, userId: string, mobileManager: MobileConnectionManager) {
    this.sessionId = sessionId
    this.userId = userId
    this.mobileManager = mobileManager
    this.initializeUrls()
    this.setupPerformanceMonitoring()
    this.setupMobileIntegration()
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
        "ws://signaling-server-1ckx.onrender.com",
        "wss://p2p-signaling.herokuapp.com",
        "wss://ws.postman-echo.com/raw",
      )
    } else {
      // Development URLs
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080", "ws://0.0.0.0:8080")
    }

    // Remove duplicates and optimize order
    this.wsUrls = [...new Set(this.wsUrls)]
    this.optimizeUrlOrder()
  }

  private optimizeUrlOrder() {
    // Put secure WebSocket URLs first for better mobile compatibility
    this.wsUrls.sort((a, b) => {
      if (a.startsWith("wss://") && !b.startsWith("wss://")) return -1
      if (!a.startsWith("wss://") && b.startsWith("wss://")) return 1
      return 0
    })
  }

  private setupPerformanceMonitoring() {
    // Ultra-fast performance monitoring every 500ms
    this.performanceMonitor = setInterval(() => {
      this.updateConnectionStats()
      this.adaptChunkSizeForMaxSpeed()
      this.monitorBufferHealth()
      this.checkConnectionHealth()
    }, 500)
  }

  private setupMobileIntegration() {
    // Register with mobile manager
    this.mobileManager.registerConnection(this.sessionId)

    // Handle mobile-specific events
    this.mobileManager.onNetworkChange = (networkType) => {
      console.log(`📱 Network changed to: ${networkType}`)
      this.networkChangeCount++
      this.handleNetworkChange(networkType)
    }

    this.mobileManager.onConnectionStrengthChange = (strength) => {
      console.log(`📱 Connection strength: ${strength}`)
      this.adaptToConnectionStrength(strength)
    }
  }

  public async initialize() {
    console.log("🚀 Initializing Bulletproof P2P System")
    this.isDestroyed = false
    this.lastSuccessfulConnection = Date.now()

    // Start multiple connection attempts simultaneously for speed
    await Promise.all([
      this.establishSignalingConnections(),
      this.startKeepAliveSystem(),
      this.initializeConnectionPool(),
    ])
  }

  public destroy() {
    console.log("🛑 Destroying Bulletproof P2P System")
    this.isDestroyed = true
    this.mobileManager.unregisterConnection(this.sessionId)
    this.cleanup()
  }

  public forceReconnect() {
    console.log("🔄 Force reconnecting Bulletproof P2P")
    this.reconnectAttempts++
    this.onReconnectAttempt?.(this.reconnectAttempts)
    this.cleanup()
    this.connectionAttempts = 0
    this.currentUrlIndex = 0
    setTimeout(() => this.initialize(), 100) // Immediate reconnection
  }

  public handleBackgroundMode(isBackground: boolean) {
    console.log(`📱 Background mode: ${isBackground}`)
    this.isInBackground = isBackground

    if (isBackground) {
      // Optimize for background operation
      this.optimizeForBackground()
    } else {
      // Restore foreground operation
      this.restoreFromBackground()
    }
  }

  public preserveConnection() {
    console.log("📱 Preserving connection state")
    // Store connection state for quick restoration
    localStorage.setItem(
      `bulletproof-p2p-${this.sessionId}`,
      JSON.stringify({
        userId: this.userId,
        isInitiator: this.isInitiator,
        lastConnection: Date.now(),
        connectionStats: this.connectionStats,
      }),
    )
  }

  public restoreConnection() {
    console.log("📱 Restoring connection state")
    const stored = localStorage.getItem(`bulletproof-p2p-${this.sessionId}`)
    if (stored) {
      try {
        const state = JSON.parse(stored)
        if (Date.now() - state.lastConnection < 300000) {
          // 5 minutes
          console.log("📱 Restoring from preserved state")
          this.forceReconnect()
        }
      } catch (error) {
        console.error("❌ Error restoring connection state:", error)
      }
    }
  }

  private cleanup() {
    // Clear all timers
    const timers = [
      this.heartbeatInterval,
      this.reconnectTimeout,
      this.connectionTimeout,
      this.statsInterval,
      this.performanceMonitor,
      this.keepAliveInterval,
    ]

    timers.forEach((timer) => {
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

    // Close all connections
    this.wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Clean disconnect")
      }
    })
    this.wsConnections = []
    this.activeWs = null

    // Close peer connections
    if (this.connectionPool.primary) {
      this.connectionPool.primary.close()
      this.connectionPool.primary = null
    }
    if (this.connectionPool.backup) {
      this.connectionPool.backup.close()
      this.connectionPool.backup = null
    }

    this.connectionPool.dataChannels = []
    this.connectionPool.activeChannel = null

    // Clear queues and buffers
    this.iceCandidateQueue = []
    this.sendBuffer = []
    this.reconnectionQueue = []
  }

  private async establishSignalingConnections() {
    if (this.isDestroyed) return

    console.log("🔗 Establishing multiple signaling connections for redundancy")

    // Try to establish multiple connections simultaneously
    const connectionPromises = this.wsUrls.slice(0, 3).map((url, index) => this.createWebSocketConnection(url, index))

    try {
      // Wait for at least one successful connection
      await Promise.race(connectionPromises)
    } catch (error) {
      console.error("❌ All signaling connections failed:", error)
      this.handleSignalingFailure()
    }
  }

  private async createWebSocketConnection(url: string, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to ${url} (connection ${index + 1})`)

      const ws = new WebSocket(url)
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Connection timeout for ${url}`)
          ws.close()
          reject(new Error(`Connection timeout: ${url}`))
        }
      }, 5000) // Aggressive 5-second timeout

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Connected to ${url}`)

        this.wsConnections.push(ws)
        if (!this.activeWs) {
          this.activeWs = ws
          this.onSignalingStatusChange?.("connected")
        }

        // Send join message immediately
        this.sendSignalingMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          capabilities: {
            maxChunkSize: this.optimalChunkSize,
            supportedFeatures: ["file-transfer", "chat", "adaptive-chunking", "mobile-optimized"],
            isMobile: this.mobileManager.getNetworkType().includes("cellular"),
            networkType: this.mobileManager.getNetworkType(),
          },
        })

        this.startHeartbeat()
        resolve()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error("❌ Error parsing signaling message:", error)
        }
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason} (${url})`)

        // Remove from connections array
        this.wsConnections = this.wsConnections.filter((connection) => connection !== ws)

        // Switch to backup connection if this was active
        if (this.activeWs === ws) {
          this.activeWs = this.wsConnections[0] || null
          if (!this.activeWs) {
            this.onSignalingStatusChange?.("disconnected")
            this.handleSignalingFailure()
          }
        }

        if (!this.isDestroyed && event.code !== 1000) {
          // Immediate reconnection attempt
          setTimeout(() => this.createWebSocketConnection(url, index), 1000)
        }
      }

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ WebSocket error on ${url}:`, error)
        reject(error)
      }
    })
  }

  private handleSignalingFailure() {
    if (this.isDestroyed) return

    this.onSignalingStatusChange?.("error")
    this.onError?.("All signaling connections failed")

    // Exponential backoff with immediate first retry
    const delay = this.reconnectAttempts === 0 ? 100 : Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000)

    this.reconnectAttempts++
    this.onReconnectAttempt?.(this.reconnectAttempts)

    if (this.reconnectAttempts < 20) {
      // Increased retry limit
      console.log(`🔄 Auto-retry in ${delay}ms (attempt ${this.reconnectAttempts})`)
      this.reconnectTimeout = setTimeout(() => {
        this.establishSignalingConnections()
      }, delay)
    }
  }

  private sendSignalingMessage(message: any) {
    if (this.activeWs?.readyState === WebSocket.OPEN) {
      try {
        this.activeWs.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending signaling message:", error)
        // Try backup connections
        this.tryBackupSignaling(message)
      }
    } else {
      this.tryBackupSignaling(message)
    }
  }

  private tryBackupSignaling(message: any) {
    for (const ws of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN && ws !== this.activeWs) {
        try {
          ws.send(JSON.stringify(message))
          this.activeWs = ws // Switch to working connection
          break
        } catch (error) {
          console.error("❌ Backup signaling failed:", error)
        }
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    // Ultra-fast heartbeat for mobile reliability
    this.heartbeatInterval = setInterval(() => {
      if (this.activeWs?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now()
        this.sendSignalingMessage({
          type: "ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: this.lastPingTime,
          networkType: this.mobileManager.getNetworkType(),
          isBackground: this.isInBackground,
        })
      }
    }, 2000) // Every 2 seconds for maximum reliability
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private startKeepAliveSystem() {
    // Ultra-aggressive keep-alive system
    this.keepAliveInterval = setInterval(() => {
      if (!this.isDestroyed) {
        // Check all connections
        this.checkAllConnections()

        // Mobile-specific keep-alive
        if (this.mobileManager.isInBackground()) {
          this.sendBackgroundKeepAlive()
        }
      }
    }, 1000) // Every second
  }

  private checkAllConnections() {
    // Check WebSocket connections
    if (this.wsConnections.length === 0) {
      console.log("⚠️ No WebSocket connections - reconnecting")
      this.establishSignalingConnections()
    }

    // Check P2P connections
    if (this.connectionPool.primary?.connectionState === "failed") {
      console.log("⚠️ Primary P2P connection failed - switching to backup")
      this.switchToBackupConnection()
    }

    // Check data channels
    if (this.connectionPool.activeChannel?.readyState !== "open") {
      console.log("⚠️ Data channel not open - attempting recovery")
      this.recoverDataChannel()
    }
  }

  private sendBackgroundKeepAlive() {
    // Send keep-alive through all available channels
    this.sendSignalingMessage({
      type: "background-keep-alive",
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now(),
    })

    // Send through data channel if available
    if (this.connectionPool.activeChannel?.readyState === "open") {
      this.sendDataChannelMessage({
        type: "background-keep-alive",
        timestamp: Date.now(),
      })
    }
  }

  private async handleSignalingMessage(message: any) {
    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        this.lastSuccessfulConnection = Date.now()
        this.connectionHealthScore = 100
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          // Immediate P2P initiation for maximum speed
          setTimeout(() => this.initiateP2PConnection(), 10)
        }
        break

      case "pong":
        this.handlePong(message.timestamp)
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

      case "user-left":
        this.onUserCountChange?.(message.userCount)
        this.onConnectionStatusChange?.("disconnected")
        if (message.userCount === 1) {
          this.prepareForReconnection()
        }
        break

      case "error":
        console.error("❌ Signaling error:", message.message)
        this.onError?.(message.message)
        this.connectionHealthScore = Math.max(0, this.connectionHealthScore - 20)
        break
    }
  }

  private handlePong(timestamp: number) {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime
      this.updateLatencyStats(latency)
      this.connectionHealthScore = Math.min(100, this.connectionHealthScore + 1)
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

  private async initializeConnectionPool() {
    console.log("🔗 Initializing connection pool for redundancy")

    // Create primary connection
    this.connectionPool.primary = this.createOptimizedPeerConnection("primary")

    // Create backup connection (for instant failover)
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionPool.backup = this.createOptimizedPeerConnection("backup")
      }
    }, 1000)
  }

  private createOptimizedPeerConnection(type: "primary" | "backup"): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ${type} ICE candidate: ${event.candidate.type}`)
        this.sendSignalingMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          connectionType: type,
          timestamp: Date.now(),
        })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`🔄 ${type} connection state: ${pc.connectionState}`)
      this.handleConnectionStateChange(pc, type)
    }

    pc.ondatachannel = (event) => {
      console.log(`📡 ${type} data channel received:`, event.channel.label)
      this.setupDataChannel(event.channel, type)
    }

    return pc
  }

  private getOptimizedRTCConfiguration(): RTCConfiguration {
    return {
      iceServers: [
        // Optimized STUN servers for mobile
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },

        // TURN servers for mobile networks
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
      iceCandidatePoolSize: 20, // Maximum for mobile reliability
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all",
    }
  }

  private handleConnectionStateChange(pc: RTCPeerConnection, type: "primary" | "backup") {
    switch (pc.connectionState) {
      case "connected":
        console.log(`✅ ${type} P2P connection established`)
        if (type === "primary") {
          this.onConnectionStatusChange?.("connected")
          this.lastSuccessfulConnection = Date.now()
          this.connectionHealthScore = 100
          this.reconnectAttempts = 0
        }
        break

      case "disconnected":
        console.log(`⚠️ ${type} P2P connection disconnected`)
        if (type === "primary") {
          this.onConnectionStatusChange?.("connecting")
          this.switchToBackupConnection()
        }
        break

      case "failed":
        console.log(`❌ ${type} P2P connection failed`)
        if (type === "primary") {
          this.onConnectionStatusChange?.("disconnected")
          this.switchToBackupConnection()
        }
        this.connectionHealthScore = Math.max(0, this.connectionHealthScore - 30)
        break
    }
  }

  private switchToBackupConnection() {
    console.log("🔄 Switching to backup connection")

    if (this.connectionPool.backup?.connectionState === "connected") {
      // Swap primary and backup
      const temp = this.connectionPool.primary
      this.connectionPool.primary = this.connectionPool.backup
      this.connectionPool.backup = temp

      // Update active data channel
      const backupChannel = this.connectionPool.dataChannels.find((ch) => ch.label.includes("backup"))
      if (backupChannel?.readyState === "open") {
        this.connectionPool.activeChannel = backupChannel
        this.onConnectionStatusChange?.("connected")
      }
    } else {
      // Create new backup and retry primary
      this.retryPrimaryConnection()
    }
  }

  private retryPrimaryConnection() {
    console.log("🔄 Retrying primary connection")

    if (this.connectionPool.primary) {
      this.connectionPool.primary.close()
    }

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionPool.primary = this.createOptimizedPeerConnection("primary")
        if (this.isInitiator) {
          this.initiateP2PConnection()
        }
      }
    }, 100) // Immediate retry
  }

  private async initiateP2PConnection() {
    if (this.isDestroyed) return

    console.log("🚀 Initiating bulletproof P2P connection")
    this.onConnectionStatusChange?.("connecting")

    try {
      const pc = this.connectionPool.primary
      if (!pc) {
        throw new Error("No primary connection available")
      }

      // Create multiple data channels for redundancy and speed
      const primaryChannel = pc.createDataChannel("bulletproof-primary", {
        ordered: true,
        maxRetransmits: undefined, // Unlimited for reliability
      })

      const speedChannel = pc.createDataChannel("bulletproof-speed", {
        ordered: false, // Unordered for maximum speed
        maxRetransmits: 0, // No retransmits for speed
      })

      this.setupDataChannel(primaryChannel, "primary")
      this.setupDataChannel(speedChannel, "speed")

      // Create offer with optimal settings
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: pc.localDescription,
        timestamp: Date.now(),
        connectionType: "primary",
      })
    } catch (error) {
      console.error("❌ Error initiating P2P connection:", error)
      this.onError?.("Failed to initiate P2P connection")
      setTimeout(() => this.retryPrimaryConnection(), 500)
    }
  }

  private setupDataChannel(channel: RTCDataChannel, type: string) {
    channel.binaryType = "arraybuffer"

    // Optimize buffer for maximum speed
    channel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()

    this.connectionPool.dataChannels.push(channel)

    channel.onopen = () => {
      console.log(`📡 ${type} data channel opened`)

      // Set as active channel if it's the first or primary
      if (!this.connectionPool.activeChannel || type === "primary") {
        this.connectionPool.activeChannel = channel
        this.onConnectionStatusChange?.("connected")
      }

      // Send connection test
      this.sendDataChannelMessage({
        type: "connection-test",
        channelType: type,
        timestamp: Date.now(),
      })
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    channel.onclose = () => {
      console.log(`📡 ${type} data channel closed`)
      this.connectionPool.dataChannels = this.connectionPool.dataChannels.filter((ch) => ch !== channel)

      if (this.connectionPool.activeChannel === channel) {
        // Switch to another available channel
        this.connectionPool.activeChannel =
          this.connectionPool.dataChannels.find((ch) => ch.readyState === "open") || null
        if (!this.connectionPool.activeChannel) {
          this.onConnectionStatusChange?.("disconnected")
          this.recoverDataChannel()
        }
      }
    }

    channel.onerror = (error) => {
      console.error(`❌ ${type} data channel error:`, error)
      this.recoverDataChannel()
    }

    channel.onbufferedamountlow = () => {
      this.processSendBuffer()
    }
  }

  private getOptimalBufferThreshold(): number {
    const networkType = this.mobileManager.getNetworkType()
    const connectionStrength = this.mobileManager.getConnectionStrength()

    // Optimize based on network type and connection strength
    if (networkType.includes("wifi") && connectionStrength === "excellent") {
      return 2097152 // 2MB for excellent WiFi
    } else if (networkType.includes("4g") && connectionStrength === "excellent") {
      return 1048576 // 1MB for excellent 4G
    } else if (connectionStrength === "good") {
      return 524288 // 512KB for good connections
    } else {
      return 262144 // 256KB for poor connections
    }
  }

  private recoverDataChannel() {
    console.log("🔧 Recovering data channel")

    // Try to create new data channel on existing connection
    if (this.connectionPool.primary?.connectionState === "connected" && this.isInitiator) {
      try {
        const recoveryChannel = this.connectionPool.primary.createDataChannel("bulletproof-recovery", {
          ordered: true,
          maxRetransmits: undefined,
        })
        this.setupDataChannel(recoveryChannel, "recovery")
      } catch (error) {
        console.error("❌ Failed to create recovery data channel:", error)
        this.retryPrimaryConnection()
      }
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed) return

    try {
      console.log("📥 Handling received offer")

      const pc = this.connectionPool.primary
      if (!pc) {
        throw new Error("No primary connection available")
      }

      await pc.setRemoteDescription(offer)
      this.processQueuedICECandidates()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: pc.localDescription,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error("❌ Error handling offer:", error)
      this.onError?.("Failed to handle connection offer")
      setTimeout(() => this.retryPrimaryConnection(), 500)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling received answer")

      const pc = this.connectionPool.primary
      if (pc?.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(answer)
        this.processQueuedICECandidates()
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
      this.onError?.("Failed to handle connection answer")
      setTimeout(() => this.retryPrimaryConnection(), 500)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      const pc = this.connectionPool.primary
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate)
      } else {
        this.iceCandidateQueue.push({
          candidate,
          timestamp: Date.now(),
          processed: false,
          retryCount: 0,
        })
      }
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error)
    }
  }

  private processQueuedICECandidates() {
    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ICE candidates`)

    this.iceCandidateQueue.forEach(async (queuedCandidate) => {
      if (!queuedCandidate.processed && this.connectionPool.primary?.remoteDescription) {
        try {
          await this.connectionPool.primary.addIceCandidate(queuedCandidate.candidate)
          queuedCandidate.processed = true
        } catch (error) {
          console.error("❌ Error processing queued ICE candidate:", error)
          queuedCandidate.retryCount++
        }
      }
    })

    this.iceCandidateQueue = this.iceCandidateQueue.filter((c) => !c.processed && c.retryCount < 3)
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
        console.log(`📨 Connection test from ${message.channelType} channel`)
        this.sendDataChannelMessage({
          type: "connection-ack",
          timestamp: Date.now(),
        })
        break

      case "connection-ack":
        console.log("✅ Connection acknowledged by peer")
        break

      case "background-keep-alive":
        console.log("📱 Background keep-alive received")
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
        this.handleChunkAcknowledgment(message)
        break

      case "file-end":
        this.handleFileEnd(message.fileId)
        break

      case "file-error":
        this.handleFileError(message.fileId, message.error)
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
      retryCount: 0,
    }

    this.fileTransfers.set(message.fileId, transfer)

    const expectedChunks = Math.ceil(message.fileSize / this.optimalChunkSize)
    this.receivedChunks.set(message.fileId, {
      chunks: [],
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
      checksum: message.checksum,
      receivedSize: 0,
      lastChunkTime: Date.now(),
      expectedChunks,
      receivedChunkIds: new Set(),
    })

    this.updateFileTransfers()
  }

  private handleFileChunk(data: ArrayBuffer) {
    try {
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const chunkId = view.getUint32(4)
      const fileId = new TextDecoder().decode(data.slice(8, 8 + fileIdLength))
      const chunkData = data.slice(8 + fileIdLength)

      const fileData = this.receivedChunks.get(fileId)
      const transfer = this.fileTransfers.get(fileId)

      if (fileData && transfer && !fileData.receivedChunkIds.has(chunkId)) {
        // Store chunk at correct position
        fileData.chunks[chunkId] = chunkData
        fileData.receivedChunkIds.add(chunkId)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.round((fileData.receivedChunkIds.size / fileData.expectedChunks) * 100)
        transfer.progress = progress

        // Calculate ultra-fast transfer speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed || 0)

        // Send acknowledgment for reliability
        this.sendDataChannelMessage({
          type: "file-chunk-ack",
          fileId,
          chunkId,
          timestamp: Date.now(),
        })
      }
    } catch (error) {
      console.error("❌ Error handling file chunk:", error)
    }
  }

  private handleChunkAcknowledgment(message: any) {
    // Handle chunk acknowledgment for reliability
    console.log(`✅ Chunk ${message.chunkId} acknowledged for file ${message.fileId}`)
  }

  private async handleFileEnd(fileId: string) {
    console.log(`📥 Ultra-fast file reception complete: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (fileData && transfer) {
      try {
        // Reconstruct file from chunks
        const orderedChunks = []
        for (let i = 0; i < fileData.expectedChunks; i++) {
          if (fileData.chunks[i]) {
            orderedChunks.push(fileData.chunks[i])
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

        this.downloadFile(blob, fileData.fileName)

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.receivedChunks.delete(fileId)
        this.updateFileTransfers()
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

  private sendDataChannelMessage(message: any) {
    if (this.connectionPool.activeChannel?.readyState === "open") {
      try {
        this.connectionPool.activeChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending data channel message:", error)
        this.tryAlternativeDataChannels(message)
      }
    } else {
      this.tryAlternativeDataChannels(message)
    }
  }

  private tryAlternativeDataChannels(message: any) {
    for (const channel of this.connectionPool.dataChannels) {
      if (channel.readyState === "open" && channel !== this.connectionPool.activeChannel) {
        try {
          channel.send(JSON.stringify(message))
          this.connectionPool.activeChannel = channel // Switch to working channel
          break
        } catch (error) {
          console.error("❌ Alternative data channel failed:", error)
        }
      }
    }
  }

  private updateConnectionStats() {
    if (!this.connectionPool.primary) return

    this.connectionPool.primary
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
        })

        this.updateConnectionQuality()
      })
      .catch((error) => {
        console.error("❌ Error collecting connection stats:", error)
      })
  }

  private updateConnectionQuality() {
    const { latency, throughput, jitter } = this.connectionStats
    const networkType = this.mobileManager.getNetworkType()
    const connectionStrength = this.mobileManager.getConnectionStrength()

    // Enhanced quality calculation considering mobile factors
    if (
      latency < 50 &&
      throughput > 2000000 &&
      jitter < 10 &&
      (networkType.includes("wifi") || networkType.includes("4g")) &&
      connectionStrength === "excellent"
    ) {
      this.connectionStats.quality = "excellent"
    } else if (latency < 150 && throughput > 1000000 && jitter < 25 && connectionStrength !== "poor") {
      this.connectionStats.quality = "good"
    } else {
      this.connectionStats.quality = "poor"
    }

    this.onConnectionQualityChange?.(this.connectionStats.quality)
  }

  private adaptChunkSizeForMaxSpeed() {
    if (!this.adaptiveChunkSize) return

    const { quality } = this.connectionStats
    const networkType = this.mobileManager.getNetworkType()
    const isBackground = this.mobileManager.isInBackground()

    // Ultra-aggressive chunk sizing for maximum speed
    if (quality === "excellent" && networkType.includes("wifi") && !isBackground) {
      this.optimalChunkSize = 2097152 // 2MB chunks for maximum speed
      this.maxConcurrentChunks = 32
    } else if (quality === "excellent" && networkType.includes("4g")) {
      this.optimalChunkSize = 1048576 // 1MB chunks for 4G
      this.maxConcurrentChunks = 16
    } else if (quality === "good") {
      this.optimalChunkSize = 524288 // 512KB chunks
      this.maxConcurrentChunks = 8
    } else {
      this.optimalChunkSize = 262144 // 256KB chunks for poor connections
      this.maxConcurrentChunks = 4
    }

    // Background mode optimization
    if (isBackground) {
      this.optimalChunkSize = Math.min(this.optimalChunkSize, 262144) // Limit to 256KB in background
      this.maxConcurrentChunks = Math.min(this.maxConcurrentChunks, 4)
    }
  }

  private monitorBufferHealth() {
    if (!this.connectionPool.activeChannel) return

    const bufferedAmount = this.connectionPool.activeChannel.bufferedAmount
    const threshold = this.getOptimalBufferThreshold()

    if (bufferedAmount > threshold * 3) {
      console.log("⚠️ Severe buffer congestion - reducing send rate")
      this.connectionPool.activeChannel.bufferedAmountLowThreshold = threshold * 2
    } else if (bufferedAmount < threshold * 0.25) {
      console.log("📡 Buffer optimal - maximizing send rate")
      this.connectionPool.activeChannel.bufferedAmountLowThreshold = threshold
    }
  }

  private checkConnectionHealth() {
    const now = Date.now()

    // Check if connection is healthy
    if (now - this.lastSuccessfulConnection > 30000) {
      // 30 seconds without successful activity
      this.connectionHealthScore = Math.max(0, this.connectionHealthScore - 10)
      console.log(`⚠️ Connection health declining: ${this.connectionHealthScore}%`)

      if (this.connectionHealthScore < 20) {
        console.log("❌ Connection health critical - forcing reconnection")
        this.forceReconnect()
      }
    }
  }

  private handleNetworkChange(networkType: string) {
    console.log(`📱 Adapting to network change: ${networkType}`)

    // Immediate adaptation to network change
    this.adaptChunkSizeForMaxSpeed()

    // If network improved significantly, attempt to upgrade connection
    if (networkType.includes("wifi") && this.connectionStats.quality !== "excellent") {
      console.log("📶 WiFi detected - optimizing for maximum speed")
      this.optimizeForWiFi()
    }

    // If network degraded, ensure connection stability
    if (networkType.includes("2g") || networkType.includes("slow")) {
      console.log("📶 Slow network detected - optimizing for reliability")
      this.optimizeForSlowNetwork()
    }
  }

  private optimizeForWiFi() {
    // Maximize settings for WiFi
    this.optimalChunkSize = 2097152 // 2MB
    this.maxConcurrentChunks = 32
    this.maxBufferSize = 64 * 1024 * 1024 // 64MB

    // Create additional data channels for parallel transfer
    if (this.connectionPool.primary?.connectionState === "connected" && this.isInitiator) {
      try {
        const speedChannel = this.connectionPool.primary.createDataChannel("bulletproof-wifi-speed", {
          ordered: false,
          maxRetransmits: 0,
        })
        this.setupDataChannel(speedChannel, "wifi-speed")
      } catch (error) {
        console.error("❌ Failed to create WiFi speed channel:", error)
      }
    }
  }

  private optimizeForSlowNetwork() {
    // Conservative settings for slow networks
    this.optimalChunkSize = 65536 // 64KB
    this.maxConcurrentChunks = 2
    this.maxBufferSize = 4 * 1024 * 1024 // 4MB

    // Use only reliable ordered channels
    this.connectionPool.activeChannel =
      this.connectionPool.dataChannels.find((ch) => ch.label.includes("primary")) || this.connectionPool.activeChannel
  }

  private adaptToConnectionStrength(strength: "excellent" | "good" | "poor") {
    console.log(`📱 Adapting to connection strength: ${strength}`)

    switch (strength) {
      case "excellent":
        this.optimalChunkSize = Math.max(this.optimalChunkSize, 1048576) // At least 1MB
        break
      case "good":
        this.optimalChunkSize = Math.min(this.optimalChunkSize, 524288) // Max 512KB
        break
      case "poor":
        this.optimalChunkSize = Math.min(this.optimalChunkSize, 131072) // Max 128KB
        break
    }
  }

  private optimizeForBackground() {
    console.log("📱 Optimizing for background operation")

    // Reduce resource usage but maintain connection
    this.optimalChunkSize = Math.min(this.optimalChunkSize, 262144) // Max 256KB
    this.maxConcurrentChunks = Math.min(this.maxConcurrentChunks, 4)

    // Increase heartbeat frequency to prevent disconnection
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.activeWs?.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: "background-ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
        })
      }
    }, 1000) // Every second in background
  }

  private restoreFromBackground() {
    console.log("📱 Restoring from background operation")

    // Restore optimal settings
    this.adaptChunkSizeForMaxSpeed()

    // Restore normal heartbeat
    this.startHeartbeat()

    // Check all connections and recover if needed
    this.checkAllConnections()
  }

  private prepareForReconnection() {
    console.log("🔄 Preparing for reconnection")

    // Reset connection pool
    this.initializeConnectionPool()

    // Clear any stale state
    this.iceCandidateQueue = []
    this.sendBuffer = []

    // Reset stats
    this.connectionStats = {
      latency: 0,
      throughput: 0,
      packetLoss: 0,
      quality: "good",
      jitter: 0,
      rtt: 0,
      bytesTransferred: 0,
      transferStartTime: 0,
    }
  }

  private processSendBuffer() {
    if (
      this.sendBuffer.length === 0 ||
      !this.connectionPool.activeChannel ||
      this.connectionPool.activeChannel.readyState !== "open"
    ) {
      return
    }

    const threshold = this.getOptimalBufferThreshold()
    let sentCount = 0

    while (
      this.sendBuffer.length > 0 &&
      this.connectionPool.activeChannel.bufferedAmount < threshold &&
      sentCount < this.maxConcurrentChunks
    ) {
      const chunk = this.sendBuffer.shift()
      if (chunk) {
        try {
          this.connectionPool.activeChannel.send(chunk)
          sentCount++
        } catch (error) {
          console.error("❌ Error sending buffered chunk:", error)
          break
        }
      }
    }
  }

  // Public methods for file transfer
  public async sendFiles(files: File[]) {
    if (!this.connectionPool.activeChannel || this.connectionPool.activeChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting ultra-fast file transfer: ${files.length} files`)

    // Send files in parallel for maximum speed
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
        retryCount: 0,
      }

      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Calculate checksum for integrity
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
      })

      // Send file in ultra-fast chunks
      await this.sendFileInUltraFastChunks(file, fileId, transfer)
    } catch (error) {
      console.error("❌ Error sending file:", error)
      this.onError?.("Failed to send file")
    }
  }

  private async sendFileInUltraFastChunks(file: File, fileId: string, transfer: FileTransfer) {
    const reader = new FileReader()
    let offset = 0
    let chunkId = 0
    let isTransferring = true
    const concurrentReads = new Map<number, Promise<void>>()

    const sendNextChunk = async () => {
      if (
        !isTransferring ||
        !this.connectionPool.activeChannel ||
        this.connectionPool.activeChannel.readyState !== "open"
      ) {
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      if (offset >= file.size) {
        // Wait for all concurrent reads to complete
        await Promise.all(concurrentReads.values())

        // File transfer complete
        this.sendDataChannelMessage({
          type: "file-end",
          fileId,
        })

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        isTransferring = false
        return
      }

      // Read multiple chunks concurrently for maximum speed
      const currentChunkId = chunkId++
      const currentOffset = offset
      offset += this.optimalChunkSize

      const readPromise = new Promise<void>((resolve, reject) => {
        const slice = file.slice(currentOffset, currentOffset + this.optimalChunkSize)
        const chunkReader = new FileReader()

        chunkReader.onload = async (e) => {
          if (!isTransferring || !e.target?.result) {
            resolve()
            return
          }

          const chunk = e.target.result as ArrayBuffer

          // Create chunk with file ID and chunk ID header
          const fileIdBytes = new TextEncoder().encode(fileId)
          const message = new ArrayBuffer(8 + fileIdBytes.length + chunk.byteLength)
          const view = new DataView(message)

          view.setUint32(0, fileIdBytes.length)
          view.setUint32(4, currentChunkId)
          new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
          new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(chunk))

          // Smart buffer management for maximum speed
          const threshold = this.getOptimalBufferThreshold()

          if (this.connectionPool.activeChannel!.bufferedAmount > threshold) {
            this.sendBuffer.push(message)
          } else {
            try {
              this.connectionPool.activeChannel!.send(message)
            } catch (error) {
              console.error("❌ Error sending chunk:", error)
              this.sendBuffer.push(message)
            }
          }

          // Update progress
          const progress = Math.min(Math.round((currentOffset / file.size) * 100), 100)
          transfer.progress = progress

          // Calculate ultra-fast transfer speed
          if (transfer.startTime) {
            const elapsed = (Date.now() - transfer.startTime) / 1000
            transfer.speed = currentOffset / elapsed
          }

          this.fileTransfers.set(fileId, transfer)
          this.updateFileTransfers()
          this.onSpeedUpdate?.(transfer.speed || 0)

          resolve()
        }

        chunkReader.onerror = () => {
          console.error("❌ Error reading chunk")
          reject(new Error("Chunk read error"))
        }

        chunkReader.readAsArrayBuffer(slice)
      })

      concurrentReads.set(currentChunkId, readPromise)

      // Remove completed reads
      readPromise.finally(() => {
        concurrentReads.delete(currentChunkId)
      })

      // Continue with next chunk immediately for maximum speed
      setImmediate(sendNextChunk)
    }

    // Start multiple concurrent chunk reads
    for (let i = 0; i < this.maxConcurrentChunks; i++) {
      sendNextChunk()
    }
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.connectionPool.activeChannel || this.connectionPool.activeChannel.readyState !== "open") {
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
