// Ultra-Reliable P2P Connection System - Core connection and transfer mechanisms
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

export class UltraReliableP2P {
  private sessionId: string
  private userId: string
  
  // Core connection components
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  
  // Connection state management
  private isInitiator = false
  private connectionAttempts = 0
  private reconnectAttempts = 0
  private isDestroyed = false
  
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
  
  // File transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, {
    chunks: ArrayBuffer[]
    totalSize: number
    fileName: string
    fileType: string
    checksum?: string
    receivedSize: number
    lastChunkTime: number
  }> = new Map()
  
  // Advanced timing and performance
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private connectionTimeout: NodeJS.Timeout | null = null
  private statsInterval: NodeJS.Timeout | null = null
  private performanceMonitor: NodeJS.Timeout | null = null
  
  // Buffer management for optimal throughput
  private sendBuffer: ArrayBuffer[] = []
  private maxBufferSize = 16 * 1024 * 1024 // 16MB buffer
  private optimalChunkSize = 262144 // 256KB chunks
  private adaptiveChunkSize = true
  
  // Connection quality monitoring
  private latencyHistory: number[] = []
  private throughputHistory: number[] = []
  private lastPingTime = 0
  private transferStartTime = 0
  private bytesTransferred = 0

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onSignalingStatusChange: ((status: "connecting" | "connected" | "disconnected" | "error") => void) | null = null
  public onUserCountChange: ((count: number) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onConnectionQualityChange: ((quality: "excellent" | "good" | "poor") => void) | null = null
  public onSpeedUpdate: ((speed: number) => void) | null = null
  public onFileTransferUpdate: ((transfers: FileTransfer[]) => void) | null = null
  public onChatMessage: ((message: ChatMessage) => void) | null = null

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeUrls()
    this.setupPerformanceMonitoring()
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
        "wss://ws.postman-echo.com/raw"
      )
    } else {
      // Development URLs
      this.wsUrls.push(
        "ws://localhost:8080",
        "ws://127.0.0.1:8080",
        "ws://0.0.0.0:8080"
      )
    }

    // Remove duplicates and randomize for load balancing
    this.wsUrls = [...new Set(this.wsUrls)]
    this.shuffleArray(this.wsUrls)
  }

  private shuffleArray(array: string[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]
    }
  }

  private setupPerformanceMonitoring() {
    // Monitor connection performance every second
    this.performanceMonitor = setInterval(() => {
      this.updateConnectionStats()
      this.adaptChunkSize()
      this.monitorBufferHealth()
    }, 1000)
  }

  public async initialize() {
    console.log("🚀 Initializing Ultra-Reliable P2P System")
    this.isDestroyed = false
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
    setTimeout(() => this.initialize(), 1000)
  }

  private cleanup() {
    // Clear all timers
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    if (this.performanceMonitor) {
      clearInterval(this.performanceMonitor)
      this.performanceMonitor = null
    }

    // Close connections
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
    this.sendBuffer = []
  }

  private async establishSignalingConnection() {
    if (this.isDestroyed) return

    if (this.currentUrlIndex >= this.wsUrls.length) {
      this.onSignalingStatusChange?.("error")
      this.onError?.(`Failed to connect to signaling server after trying ${this.wsUrls.length} URLs`)
      
      // Exponential backoff with jitter
      const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      const jitter = Math.random() * 1000
      const delay = baseDelay + jitter
      
      this.reconnectAttempts++
      
      if (this.reconnectAttempts < 15) { // Increased retry limit
        console.log(`🔄 Auto-retry in ${delay.toFixed(0)}ms (attempt ${this.reconnectAttempts})`)
        this.reconnectTimeout = setTimeout(() => {
          this.currentUrlIndex = 0
          this.establishSignalingConnection()
        }, delay)
      }
      return
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 Connecting to ${wsUrl} (attempt ${this.connectionAttempts + 1})`)

    this.onSignalingStatusChange?.("connecting")

    try {
      this.ws = new WebSocket(wsUrl)

      // Aggressive connection timeout for faster failover
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Connection timeout for ${wsUrl}`)
          this.ws.close()
          this.currentUrlIndex++
          setTimeout(() => this.establishSignalingConnection(), 100)
        }
      }, 8000) // Reduced to 8 seconds

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Connected to ${wsUrl}`)
        this.onSignalingStatusChange?.("connected")
        this.connectionAttempts = 0
        this.reconnectAttempts = 0
        this.currentUrlIndex = 0

        // Send join message immediately
        this.sendSignalingMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          capabilities: {
            maxChunkSize: this.optimalChunkSize,
            supportedFeatures: ["file-transfer", "chat", "adaptive-chunking"]
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
          this.currentUrlIndex++
          setTimeout(() => this.establishSignalingConnection(), 500)
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ WebSocket error on ${wsUrl}:`, error)
        this.currentUrlIndex++
        setTimeout(() => this.establishSignalingConnection(), 200)
      }

    } catch (error) {
      console.error(`❌ Failed to create WebSocket for ${wsUrl}:`, error)
      this.currentUrlIndex++
      setTimeout(() => this.establishSignalingConnection(), 200)
    }
  }

  private sendSignalingMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending signaling message:", error)
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now()
        this.sendSignalingMessage({
          type: "ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: this.lastPingTime
        })
      }
    }, 5000) // Every 5 seconds for better responsiveness
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
    }, 2000) // Every 2 seconds
  }

  private stopStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }

  private async handleSignalingMessage(message: any) {
    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          // Immediate P2P initiation for faster connection
          setTimeout(() => this.initiateP2PConnection(), 100)
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
        // Auto-reconnect preparation
        if (message.userCount === 1) {
          this.resetP2PConnection()
        }
        break

      case "error":
        console.error("❌ Signaling error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private handlePong(timestamp: number) {
    if (this.lastPingTime > 0) {
      const latency = Date.now() - this.lastPingTime
      this.updateLatencyStats(latency)
    }
  }

  private updateLatencyStats(latency: number) {
    this.latencyHistory.push(latency)
    if (this.latencyHistory.length > 10) {
      this.latencyHistory.shift()
    }
    
    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    this.connectionStats.latency = avgLatency
    this.connectionStats.rtt = latency
    
    // Update connection quality based on latency
    this.updateConnectionQuality()
  }

  private async initiateP2PConnection() {
    if (this.isDestroyed) return
    
    console.log("🚀 Initiating ultra-reliable P2P connection")
    this.onConnectionStatusChange?.("connecting")

    try {
      // Reset any existing connection
      if (this.pc) {
        this.pc.close()
      }

      // Create peer connection with optimized configuration
      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      
      this.setupPeerConnectionHandlers()
      
      // Create data channel with ultra-reliable settings
      this.dataChannel = this.pc.createDataChannel("ultra-reliable-transfer", {
        ordered: true,
        maxRetransmits: undefined, // Unlimited retransmits for reliability
        protocol: "ultra-reliable-v1"
      })

      this.setupDataChannelHandlers()

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.pc?.connectionState !== "connected") {
          console.log("⏰ P2P connection timeout, retrying...")
          this.retryP2PConnection()
        }
      }, 30000) // 30 second timeout

      // Create and send offer
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
        timestamp: Date.now()
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
        // Primary STUN servers with geographic distribution
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        
        // Additional reliable STUN servers
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.nextcloud.com:443" },
        { urls: "stun:stun.sipgate.net:3478" },
        { urls: "stun:stun.ekiga.net" },
        { urls: "stun:stun.ideasip.com" },
        
        // TURN servers if available
        ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
          urls: process.env.NEXT_PUBLIC_TURN_SERVER,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD
        }] : [])
      ],
      iceCandidatePoolSize: 15, // Increased for better connectivity
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
      } else {
        console.log("🧊 ICE gathering complete")
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔄 P2P connection state: ${state}`)

      switch (state) {
        case "connected":
          this.onConnectionStatusChange?.("connected")
          this.clearConnectionTimeout()
          this.startConnectionMonitoring()
          break
          
        case "connecting":
          this.onConnectionStatusChange?.("connecting")
          break
          
        case "disconnected":
          console.log("⚠️ P2P connection disconnected, attempting recovery...")
          this.onConnectionStatusChange?.("connecting")
          this.attemptConnectionRecovery()
          break
          
        case "failed":
          console.log("❌ P2P connection failed, retrying...")
          this.onConnectionStatusChange?.("disconnected")
          setTimeout(() => this.retryP2PConnection(), 1000)
          break
          
        case "closed":
          console.log("🔌 P2P connection closed")
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
          console.log("⚠️ ICE disconnected, will attempt to reconnect...")
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
    
    // Optimize buffer thresholds based on connection quality
    this.dataChannel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()

    this.dataChannel.onopen = () => {
      console.log("📡 Ultra-reliable data channel opened")
      this.onConnectionStatusChange?.("connected")
      this.clearConnectionTimeout()
      
      // Send connection test
      this.sendDataChannelMessage({
        type: "connection-test",
        timestamp: Date.now(),
        message: "Ultra-reliable data channel ready"
      })
    }

    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    this.dataChannel.onclose = () => {
      console.log("📡 Data channel closed")
      this.onConnectionStatusChange?.("disconnected")
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      this.attemptDataChannelRecovery()
    }

    this.dataChannel.onbufferedamountlow = () => {
      console.log("📡 Buffer low - ready for more data")
      this.processSendBuffer()
    }
  }

  private getOptimalBufferThreshold(): number {
    switch (this.connectionStats.quality) {
      case "excellent":
        return 1048576 // 1MB
      case "good":
        return 524288 // 512KB
      case "poor":
        return 262144 // 256KB
      default:
        return 524288
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed) return
    
    try {
      console.log("📥 Handling received offer")
      
      // Reset any existing connection
      if (this.pc) {
        this.pc.close()
      }

      this.pc = new RTCPeerConnection(this.getOptimizedRTCConfiguration())
      this.setupPeerConnectionHandlers()

      await this.pc.setRemoteDescription(offer)

      // Process queued ICE candidates
      this.processQueuedICECandidates()

      // Create answer
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
      setTimeout(() => this.retryP2PConnection(), 2000)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling received answer")
      
      if (this.pc?.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
        console.log("✅ Answer processed successfully")
        
        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Cannot set remote description - wrong signaling state:", this.pc?.signalingState)
        this.retryP2PConnection()
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

    // Clean up processed candidates
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
    
    if (this.connectionAttempts < 10) {
      this.resetP2PConnection()
      setTimeout(() => {
        if (this.isInitiator) {
          this.initiateP2PConnection()
        }
      }, Math.min(1000 * this.connectionAttempts, 5000))
    } else {
      this.onError?.("Maximum P2P connection attempts reached")
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
    this.sendBuffer = []
  }

  private attemptConnectionRecovery() {
    console.log("🔧 Attempting connection recovery...")
    
    // Try ICE restart first
    if (this.pc && this.pc.connectionState === "disconnected") {
      setTimeout(() => {
        if (this.pc?.connectionState === "disconnected") {
          console.log("🔄 Attempting ICE restart...")
          this.pc.restartIce()
        }
      }, 1000)
    }
    
    // If still not connected after 5 seconds, full retry
    setTimeout(() => {
      if (this.pc?.connectionState !== "connected") {
        console.log("🔄 ICE restart failed, full P2P retry...")
        this.retryP2PConnection()
      }
    }, 5000)
  }

  private attemptDataChannelRecovery() {
    console.log("🔧 Attempting data channel recovery...")
    
    // Try to recreate data channel if P2P connection is still active
    if (this.pc?.connectionState === "connected" && this.isInitiator) {
      try {
        this.dataChannel = this.pc.createDataChannel("ultra-reliable-transfer-recovery", {
          ordered: true,
          maxRetransmits: undefined
        })
        this.setupDataChannelHandlers()
      } catch (error) {
        console.error("❌ Failed to recreate data channel:", error)
        this.retryP2PConnection()
      }
    }
  }

  private startConnectionMonitoring() {
    // Monitor connection health every 2 seconds
    const monitorInterval = setInterval(() => {
      if (this.pc?.connectionState !== "connected") {
        clearInterval(monitorInterval)
        return
      }
      
      this.collectConnectionStats()
    }, 2000)
  }

  private collectConnectionStats() {
    if (!this.pc) return

    this.pc.getStats().then(stats => {
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime) {
            this.connectionStats.rtt = report.currentRoundTripTime * 1000 // Convert to ms
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
    
    const timeDiff = (now - this.transferStartTime) / 1000 // seconds
    const bytesDiff = totalBytes - this.bytesTransferred
    
    if (timeDiff > 0) {
      const throughput = bytesDiff / timeDiff // bytes per second
      this.throughputHistory.push(throughput)
      
      if (this.throughputHistory.length > 10) {
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
    
    // Determine quality based on multiple factors
    if (latency < 50 && throughput > 1000000 && jitter < 10) { // < 50ms, > 1MB/s, < 10ms jitter
      this.connectionStats.quality = "excellent"
    } else if (latency < 150 && throughput > 500000 && jitter < 25) { // < 150ms, > 500KB/s, < 25ms jitter
      this.connectionStats.quality = "good"
    } else {
      this.connectionStats.quality = "poor"
    }
    
    this.onConnectionQualityChange?.(this.connectionStats.quality)
  }

  private adaptChunkSize() {
    if (!this.adaptiveChunkSize) return
    
    const { quality, latency, throughput } = this.connectionStats
    
    // Adapt chunk size based on connection quality
    switch (quality) {
      case "excellent":
        this.optimalChunkSize = Math.min(524288, Math.max(262144, throughput / 10)) // Up to 512KB
        break
      case "good":
        this.optimalChunkSize = Math.min(262144, Math.max(131072, throughput / 20)) // Up to 256KB
        break
      case "poor":
        this.optimalChunkSize = Math.min(131072, Math.max(65536, throughput / 40)) // Up to 128KB
        break
    }
    
    // Ensure chunk size is power of 2 for optimal performance
    this.optimalChunkSize = Math.pow(2, Math.floor(Math.log2(this.optimalChunkSize)))
  }

  private monitorBufferHealth() {
    if (!this.dataChannel) return
    
    const bufferedAmount = this.dataChannel.bufferedAmount
    const threshold = this.getOptimalBufferThreshold()
    
    // Adjust buffer threshold if needed
    if (bufferedAmount > threshold * 2) {
      console.log("⚠️ Buffer congestion detected, reducing send rate")
      this.dataChannel.bufferedAmountLowThreshold = threshold * 1.5
    } else if (bufferedAmount < threshold * 0.5) {
      console.log("📡 Buffer healthy, optimizing send rate")
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
      // Binary data (file chunk)
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
          message: "Connection confirmed"
        })
        break
        
      case "connection-ack":
        console.log("✅ Connection acknowledged by peer")
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
        
      case "file-end":
        this.handleFileEnd(message.fileId)
        break
        
      case "file-error":
        this.handleFileError(message.fileId, message.error)
        break
    }
  }

  private handleFileStart(message: any) {
    console.log(`📥 Starting file reception: ${message.fileName}`)
    
    const transfer: FileTransfer = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
      checksum: message.checksum,
      startTime: Date.now()
    }

    this.fileTransfers.set(message.fileId, transfer)
    this.receivedChunks.set(message.fileId, {
      chunks: [],
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
      checksum: message.checksum,
      receivedSize: 0,
      lastChunkTime: Date.now()
    })

    this.updateFileTransfers()
  }

  private handleFileChunk(data: ArrayBuffer) {
    try {
      // Extract file ID from chunk header
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const fileId = new TextDecoder().decode(data.slice(4, 4 + fileIdLength))
      const chunkData = data.slice(4 + fileIdLength)

      const fileData = this.receivedChunks.get(fileId)
      const transfer = this.fileTransfers.get(fileId)

      if (fileData && transfer) {
        fileData.chunks.push(chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.round((fileData.receivedSize / fileData.totalSize) * 100)
        transfer.progress = progress

        // Calculate transfer speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed || 0)
      }
    } catch (error) {
      console.error("❌ Error handling file chunk:", error)
    }
  }

  private async handleFileEnd(fileId: string) {
    console.log(`📥 File reception complete: ${fileId}`)
    
    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (fileData && transfer) {
      try {
        const blob = new Blob(fileData.chunks, { type: fileData.fileType })

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
    if (this.sendBuffer.length === 0 || !this.dataChannel || this.dataChannel.readyState !== "open") {
      return
    }

    const threshold = this.getOptimalBufferThreshold()
    
    while (this.sendBuffer.length > 0 && this.dataChannel.bufferedAmount < threshold) {
      const chunk = this.sendBuffer.shift()
      if (chunk) {
        try {
          this.dataChannel.send(chunk)
        } catch (error) {
          console.error("❌ Error sending buffered chunk:", error)
          break
        }
      }
    }
  }

  // Public methods for file transfer
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting ultra-reliable file transfer: ${files.length} files`)

    for (const file of files) {
      await this.sendSingleFile(file)
    }
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
        startTime: Date.now()
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
        checksum
      })

      // Send file in optimized chunks
      await this.sendFileInChunks(file, fileId, transfer)

    } catch (error) {
      console.error("❌ Error sending file:", error)
      this.onError?.("Failed to send file")
    }
  }

  private async sendFileInChunks(file: File, fileId: string, transfer: FileTransfer) {
    const reader = new FileReader()
    let offset = 0
    let isTransferring = true

    const sendNextChunk = async () => {
      if (!isTransferring || !this.dataChannel || this.dataChannel.readyState !== "open") {
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      if (offset >= file.size) {
        // File transfer complete
        this.sendDataChannelMessage({
          type: "file-end",
          fileId
        })

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        isTransferring = false
        return
      }

      const slice = file.slice(offset, offset + this.optimalChunkSize)
      reader.readAsArrayBuffer(slice)
    }

    reader.onload = async (e) => {
      if (!isTransferring || !e.target?.result) return

      const chunk = e.target.result as ArrayBuffer

      // Create chunk with file ID header
      const fileIdBytes = new TextEncoder().encode(fileId)
      const message = new ArrayBuffer(4 + fileIdBytes.length + chunk.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      new Uint8Array(message, 4, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 4 + fileIdBytes.length).set(new Uint8Array(chunk))

      // Smart buffer management
      const threshold = this.getOptimalBufferThreshold()
      
      if (this.dataChannel!.bufferedAmount > threshold) {
        // Add to send buffer if channel is congested
        this.sendBuffer.push(message)
      } else {
        // Send immediately if channel is ready
        try {
          this.dataChannel!.send(message)
        } catch (error) {
          console.error("❌ Error sending chunk:", error)
          this.sendBuffer.push(message) // Fallback to buffer
        }
      }

      offset += this.optimalChunkSize

      // Update progress
      const progress = Math.min(Math.round((offset / file.size) * 100), 100)
      transfer.progress = progress

      // Calculate transfer speed
      if (transfer.startTime) {
        const elapsed = (Date.now() - transfer.startTime) / 1000
        transfer.speed = offset / elapsed
      }

      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
      this.onSpeedUpdate?.(transfer.speed || 0)

      // Continue with next chunk (optimized timing)
      if (this.connectionStats.quality === "excellent") {
        setImmediate(sendNextChunk) // Maximum speed for excellent connections
      } else if (this.connectionStats.quality === "good") {
        setTimeout(sendNextChunk, 1) // Minimal delay for good connections
      } else {
        setTimeout(sendNextChunk, 5) // Small delay for poor connections
      }
    }

    reader.onerror = () => {
      console.error("❌ Error reading file")
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
      isTransferring = false
    }

    // Start the transfer
    sendNextChunk()
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
