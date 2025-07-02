// Ultra-Reliable P2P Connection System - Fixed P2P Connection Issues

interface ConnectionStats {
  latency: number
  throughput: number
  quality: "excellent" | "good" | "poor"
}

interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "transferring" | "completed" | "error"
  direction: "sending" | "receiving"
  speed?: number
  startTime?: number
  checksum?: string
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
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  // Connection components
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null

  // Fixed connection state management
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"
  private p2pState:
    | "idle"
    | "creating-offer"
    | "waiting-answer"
    | "creating-answer"
    | "connecting"
    | "connected"
    | "failed" = "idle"

  // Connection handling
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
  }

  // Fixed ICE candidate handling
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private isRemoteDescriptionSet = false
  private isLocalDescriptionSet = false
  private pendingOffer: RTCSessionDescriptionInit | null = null
  private pendingAnswer: RTCSessionDescriptionInit | null = null

  // Reconnection management
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private maxReconnectAttempts = 20
  private reconnectDelay = 3000
  private lastConnectionAttempt = 0
  private connectionTimeout: NodeJS.Timeout | null = null

  // File transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private sendingFiles: Map<string, { file: File; transfer: FileTransfer }> = new Map()
  private chunkSize = 16 * 1024 // 16KB chunks for better reliability
  private maxConcurrentChunks = 4

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private p2pTimeoutTimer: NodeJS.Timeout | null = null

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

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId

    // Initialize URLs with fallbacks
    this.initializeUrls()

    console.log("🚀 Ultra-Reliable P2P System initialized - Fixed P2P Connection")
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
      )
    } else {
      // Development URLs
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080")
    }

    // Remove duplicates
    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🌐 Initialized signaling URLs:", this.wsUrls.length)
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting ultra-reliable connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    this.p2pState = "idle"

    await this.connectWebSocket()
    this.startConnectionMonitoring()
  }

  public destroy() {
    console.log("🛑 Destroying ultra-reliable P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    const timers = [
      this.heartbeatTimer,
      this.reconnectTimer,
      this.connectionMonitorTimer,
      this.p2pTimeoutTimer,
      this.connectionTimeout,
    ]

    timers.forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.connectionMonitorTimer = null
    this.p2pTimeoutTimer = null
    this.connectionTimeout = null

    // Close connections
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    if (this.dataChannel) {
      this.dataChannel = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Clear state
    this.resetP2PState()
  }

  private resetP2PState() {
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false
    this.isLocalDescriptionSet = false
    this.pendingOffer = null
    this.pendingAnswer = null
    this.p2pState = "idle"
  }

  private startConnectionMonitoring() {
    // Monitor connection health every 2 seconds
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      this.checkConnectionHealth()
      this.attemptReconnectionIfNeeded()
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
      console.log("✅ Signaling connected")
    } else if (!wsHealthy && this.signalingState === "connected") {
      this.signalingState = "disconnected"
      this.onSignalingStatusChange?.("disconnected")
      console.log("⚠️ Signaling disconnected")
    }

    // Update P2P state
    if (p2pHealthy && dataChannelHealthy && this.connectionState !== "connected") {
      this.connectionState = "connected"
      this.p2pState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.p2pReconnectAttempts = 0
      this.onConnectionRecovery?.()
      console.log("✅ P2P connection fully established!")
    } else if ((!p2pHealthy || !dataChannelHealthy) && this.connectionState === "connected") {
      this.connectionState = "disconnected"
      this.p2pState = "failed"
      this.onConnectionStatusChange?.("disconnected")
      console.log("⚠️ P2P connection lost")
    }
  }

  private attemptReconnectionIfNeeded() {
    const now = Date.now()
    const timeSinceLastAttempt = now - this.lastConnectionAttempt

    // WebSocket reconnection
    if (this.ws?.readyState !== WebSocket.OPEN && timeSinceLastAttempt > this.reconnectDelay) {
      this.connectWebSocket()
    }

    // P2P reconnection - only if WebSocket is connected and we're not already trying
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.pc?.connectionState !== "connected" &&
      this.p2pState !== "creating-offer" &&
      this.p2pState !== "waiting-answer" &&
      this.p2pState !== "creating-answer" &&
      this.p2pState !== "connecting" &&
      timeSinceLastAttempt > this.reconnectDelay
    ) {
      console.log("🔄 Attempting P2P reconnection...")
      this.attemptP2PConnection()
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws?.readyState === WebSocket.OPEN) return

    this.lastConnectionAttempt = Date.now()
    this.wsReconnectAttempts++

    // Try next URL if current one failed
    if (this.wsReconnectAttempts > 3) {
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      this.wsReconnectAttempts = 1
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 WebSocket connection attempt ${this.wsReconnectAttempts} to ${wsUrl}`)

    try {
      // Close existing connection
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(wsUrl)

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log("⏰ WebSocket connection timeout")
          this.ws.close()
          this.scheduleReconnect()
        }
      }, 8000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ WebSocket connected successfully!")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")
        this.wsReconnectAttempts = 0
        this.currentUrlIndex = 0

        // Send join message
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          reconnect: this.wsReconnectAttempts > 1,
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobile(),
            version: "ultra-reliable-v3",
            p2pCapable: true,
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
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
        this.signalingState = "disconnected"
        this.onSignalingStatusChange?.("disconnected")
        this.ws = null
        this.stopHeartbeat()

        if (!this.isDestroyed && event.code !== 10240) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("❌ WebSocket error:", error)
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return

    const delay = Math.min(this.reconnectDelay * Math.pow(1.2, Math.min(this.wsReconnectAttempts, 8)), 15000)
    console.log(`🔄 Scheduling reconnect in ${delay}ms`)

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

  private isMobile(): boolean {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  private sendMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Send error:", error)
      }
    } else {
      console.log("📤 Cannot send message - WebSocket not open")
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
        })
      }
    }, 102400) // Every 10 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async handleMessage(message: any) {
    console.log(`📨 Received: ${message.type}`)

    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        console.log(`🎯 Role: ${this.isInitiator ? "INITIATOR" : "RECEIVER"}`)
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)

        if (this.isInitiator && message.userCount === 2 && this.p2pState === "idle") {
          console.log("🚀 Starting P2P as initiator...")
          setTimeout(() => this.attemptP2PConnection(), 2000)
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected")
        this.onUserCountChange?.(message.userCount)

        // Restart P2P if needed
        if (this.connectionState !== "connected" && this.isInitiator && this.p2pState === "idle") {
          console.log("🚀 Restarting P2P after peer reconnection")
          setTimeout(() => this.attemptP2PConnection(), 10240)
        }
        break

      case "p2p-ready":
        console.log("🚀 P2P ready signal received")
        if (this.isInitiator && this.p2pState === "idle") {
          setTimeout(() => this.attemptP2PConnection(), 500)
        }
        break

      case "pong":
        // Connection is alive
        break

      case "offer":
        console.log("📥 Received offer")
        await this.handleOffer(message.offer)
        break

      case "answer":
        console.log("📥 Received answer")
        await this.handleAnswer(message.answer)
        break

      case "ice-candidate":
        console.log("📥 Received ICE candidate")
        await this.handleIceCandidate(message.candidate)
        break

      case "user-left":
        console.log("👋 User left")
        this.onUserCountChange?.(message.userCount)
        this.connectionState = "disconnected"
        this.p2pState = "failed"
        this.onConnectionStatusChange?.("disconnected")
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async attemptP2PConnection() {
    if (this.isDestroyed || this.p2pState !== "idle") {
      console.log(`⚠️ P2P attempt blocked - state: ${this.p2pState}`)
      return
    }

    this.p2pReconnectAttempts++
    if (this.p2pReconnectAttempts > this.maxReconnectAttempts) {
      console.log("❌ Max P2P attempts reached")
      this.onError?.("P2P connection failed after multiple attempts")
      return
    }

    this.lastConnectionAttempt = Date.now()
    console.log(`🚀 P2P connection attempt ${this.p2pReconnectAttempts}`)

    // Wait for WebSocket to be ready
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⏳ Waiting for WebSocket...")
      setTimeout(() => this.attemptP2PConnection(), 2000)
      return
    }

    if (this.isInitiator) {
      await this.createOffer()
    }
  }

  private async createOffer() {
    if (this.p2pState !== "idle") return

    this.p2pState = "creating-offer"
    console.log("🚀 Creating P2P offer...")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
        this.pc = null
      }
      this.dataChannel = null
      this.resetP2PState()
      this.p2pState = "creating-offer"

      // Create new peer connection with comprehensive STUN servers
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
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      })

      this.setupPeerConnectionHandlers()

      // Create data channel as initiator
      this.dataChannel = this.pc.createDataChannel("ultra-reliable-data", {
        ordered: true,
        maxRetransmits: 3,
        maxPacketLifeTime: 3000,
        protocol: "ultra-reliable-v3",
      })
      this.setupDataChannelHandlers()

      // Set connection timeout
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.p2pState !== "connected") {
          console.log("⏰ P2P connection timeout")
          this.p2pState = "failed"
          this.onError?.("P2P connection timeout - retrying...")
          setTimeout(() => {
            this.p2pState = "idle"
            this.attemptP2PConnection()
          }, 3000)
        }
      }, 20000) // 20 second timeout

      // Create and send offer
      console.log("📤 Creating offer...")
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await this.pc.setLocalDescription(offer)
      this.isLocalDescriptionSet = true
      this.p2pState = "waiting-answer"

      console.log("📤 Sending offer...")
      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
        initiator: true,
      })
    } catch (error) {
      console.error("❌ Create offer error:", error)
      this.p2pState = "failed"
      this.onError?.("Failed to create P2P offer - retrying...")
      setTimeout(() => {
        this.p2pState = "idle"
        this.attemptP2PConnection()
      }, 3000)
    }
  }

  private setupPeerConnectionHandlers() {
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
      console.log(`🔄 P2P connection state: ${state}`)

      switch (state) {
        case "connected":
          console.log("✅ P2P connection established!")
          this.connectionState = "connected"
          this.p2pState = "connected"
          this.onConnectionStatusChange?.("connected")
          this.p2pReconnectAttempts = 0
          this.clearP2PTimeout()
          this.onConnectionRecovery?.()
          break

        case "connecting":
          this.connectionState = "connecting"
          this.p2pState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
          console.log("⚠️ P2P disconnected")
          this.connectionState = "disconnected"
          this.p2pState = "failed"
          this.onConnectionStatusChange?.("disconnected")
          this.clearP2PTimeout()
          setTimeout(() => {
            if (this.p2pState === "failed") {
              this.p2pState = "idle"
              this.attemptP2PConnection()
            }
          }, 3000)
          break

        case "failed":
          console.log("❌ P2P connection failed")
          this.connectionState = "disconnected"
          this.p2pState = "failed"
          this.onConnectionStatusChange?.("disconnected")
          this.clearP2PTimeout()
          setTimeout(() => {
            if (this.p2pState === "failed") {
              this.p2pState = "idle"
              this.attemptP2PConnection()
            }
          }, 3000)
          break

        case "closed":
          console.log("🔌 P2P connection closed")
          this.connectionState = "disconnected"
          this.p2pState = "idle"
          this.onConnectionStatusChange?.("disconnected")
          this.clearP2PTimeout()
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
          console.log("⚠️ ICE disconnected - restarting...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "disconnected") {
              this.pc.restartIce()
            }
          }, 2000)
          break

        case "failed":
          console.log("❌ ICE connection failed - restarting...")
          setTimeout(() => {
            if (this.pc?.iceConnectionState === "failed") {
              this.pc.restartIce()
            }
          }, 10240)
          break
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log("📡 Received data channel")
      this.dataChannel = event.channel
      this.setupDataChannelHandlers()
    }
  }

  private setupDataChannelHandlers() {
    if (!this.dataChannel) return

    this.dataChannel.binaryType = "arraybuffer"
    this.dataChannel.bufferedAmountLowThreshold = 512 * 1024 // 512KB threshold

    this.dataChannel.onopen = () => {
      console.log("📡 Data channel opened!")
      this.connectionState = "connected"
      this.p2pState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.clearP2PTimeout()

      // Send test message
      this.sendDataChannelMessage({
        type: "connection-test",
        message: "Ultra-reliable data channel ready",
        timestamp: Date.now(),
      })
    }

    this.dataChannel.onmessage = (event) => {
      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data)
          this.handleDataMessage(message)
        } else {
          this.handleFileChunk(event.data)
        }
      } catch (error) {
        console.error("❌ Data channel message error:", error)
      }
    }

    this.dataChannel.onclose = () => {
      console.log("📡 Data channel closed")
      this.connectionState = "disconnected"
      this.p2pState = "failed"
      this.onConnectionStatusChange?.("disconnected")
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      this.p2pState = "failed"
    }

    this.dataChannel.onbufferedamountlow = () => {
      // Resume file transfers when buffer is low
      console.log("📡 Buffer low - resuming transfers")
    }
  }

  private clearP2PTimeout() {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer)
      this.p2pTimeoutTimer = null
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.p2pState !== "idle") {
      console.log(`⚠️ Ignoring offer - state: ${this.p2pState}`)
      return
    }

    this.p2pState = "creating-answer"
    console.log("📥 Handling offer as receiver")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
      }
      this.resetP2PState()
      this.p2pState = "creating-answer"

      // Create new peer connection
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
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      })

      this.setupPeerConnectionHandlers()

      // Set connection timeout
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.p2pState !== "connected") {
          console.log("⏰ P2P answer timeout")
          this.p2pState = "failed"
          this.onError?.("P2P answer timeout")
        }
      }, 20000)

      console.log("📥 Setting remote description...")
      await this.pc.setRemoteDescription(offer)
      this.isRemoteDescriptionSet = true

      console.log("📤 Creating answer...")
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.isLocalDescriptionSet = true

      console.log("📤 Sending answer...")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
        receiver: true,
      })

      this.p2pState = "connecting"

      // Process queued ICE candidates
      this.processQueuedICECandidates()
    } catch (error) {
      console.error("❌ Handle offer error:", error)
      this.p2pState = "failed"
      this.onError?.("Failed to handle P2P offer")
      setTimeout(() => {
        this.p2pState = "idle"
      }, 3000)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.p2pState !== "waiting-answer") {
      console.log(`⚠️ Ignoring answer - state: ${this.p2pState}`)
      return
    }

    try {
      console.log("📥 Handling answer as initiator")

      if (this.pc?.signalingState === "have-local-offer") {
        console.log("📥 Setting remote description...")
        await this.pc.setRemoteDescription(answer)
        this.isRemoteDescriptionSet = true
        this.p2pState = "connecting"
        console.log("✅ Answer processed successfully")

        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Cannot set remote description - wrong signaling state:", this.pc?.signalingState)
        this.p2pState = "failed"
        setTimeout(() => {
          this.p2pState = "idle"
          this.attemptP2PConnection()
        }, 3000)
      }
    } catch (error) {
      console.error("❌ Handle answer error:", error)
      this.p2pState = "failed"
      this.onError?.("Failed to handle P2P answer")
      setTimeout(() => {
        this.p2pState = "idle"
        this.attemptP2PConnection()
      }, 3000)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc && this.isRemoteDescriptionSet) {
        console.log("✅ Adding ICE candidate immediately")
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
    if (!this.pc || !this.isRemoteDescriptionSet) return

    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ICE candidates`)

    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(candidate)
        console.log("✅ Processed queued ICE candidate")
      } catch (error) {
        console.error("❌ Error processing queued ICE candidate:", error)
      }
    }

    this.iceCandidateQueue = []
  }

  private sendDataChannelMessage(message: any) {
    if (this.dataChannel?.readyState === "open") {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Data channel send error:", error)
      }
    }
  }

  private handleDataMessage(message: any) {
    switch (message.type) {
      case "connection-test":
        console.log("📨 Received connection test")
        this.sendDataChannelMessage({
          type: "connection-ack",
          message: "Ultra-reliable connection confirmed",
          timestamp: Date.now(),
        })
        break

      case "connection-ack":
        console.log("✅ Connection acknowledged")
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
    }
  }

  // File transfer methods (simplified for space)
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
      startTime: Date.now(),
      checksum: message.checksum,
    }

    this.fileTransfers.set(message.fileId, transfer)

    const totalChunks = Math.ceil(message.fileSize / this.chunkSize)
    this.receivedChunks.set(message.fileId, {
      chunks: new Map(),
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
      receivedSize: 0,
      totalChunks,
      checksum: message.checksum,
      lastChunkTime: Date.now(),
    })

    this.updateFileTransfers()
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
        fileData.chunks.set(chunkIndex, chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.min(Math.round((fileData.chunks.size / fileData.totalChunks) * 1024), 99)
        transfer.progress = progress

        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 10240
          transfer.speed = fileData.receivedSize / elapsed
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
      console.error("❌ File chunk error:", error)
    }
  }

  private async completeFileReception(fileId: string) {
    console.log(`📥 Completing file reception: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!fileData || !transfer) return

    try {
      const orderedChunks: ArrayBuffer[] = []
      for (let i = 0; i < fileData.totalChunks; i++) {
        const chunk = fileData.chunks.get(i)
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`)
        }
        orderedChunks.push(chunk)
      }

      const blob = new Blob(orderedChunks, { type: fileData.fileType })

      if (blob.size !== fileData.totalSize) {
        throw new Error(`File size mismatch: expected ${fileData.totalSize}, got ${blob.size}`)
      }

      if (fileData.checksum) {
        const calculatedChecksum = await this.calculateChecksum(blob)
        if (calculatedChecksum !== fileData.checksum) {
          throw new Error("File checksum verification failed")
        }
      }

      this.downloadFile(blob, fileData.fileName)

      transfer.status = "completed"
      transfer.progress = 1024
      this.fileTransfers.set(fileId, transfer)
      this.receivedChunks.delete(fileId)
      this.updateFileTransfers()

      this.sendDataChannelMessage({
        type: "file-complete-ack",
        fileId,
        timestamp: Date.now(),
        success: true,
      })

      console.log(`✅ File ${fileData.fileName} completed successfully`)
    } catch (error) {
      console.error("❌ File completion error:", error)
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

  private handleFileChunkAck(message: any) {
    console.log(`✅ Chunk ${message.chunkIndex} acknowledged for file ${message.fileId}`)
  }

  private handleFileComplete(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer && transfer.direction === "sending") {
      transfer.status = "completed"
      transfer.progress = 1024
      this.fileTransfers.set(message.fileId, transfer)
      this.updateFileTransfers()
      console.log(`✅ File ${transfer.name} sent successfully`)
    }
  }

  private handleFileError(message: any) {
    const fileId = message.fileId // Declare the variable here
    const transfer = this.fileTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
      console.error(`❌ File transfer error: ${message.error}`)
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

  // Public methods
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Connection not ready for file transfer")
      return
    }

    console.log(`📤 Starting file transfer: ${files.length} files`)

    for (const file of files) {
      await this.sendFile(file)
    }
  }

  private async sendFile(file: File) {
    const fileId = Math.random().toString(36).substring(2, 15)

    console.log(`📤 Sending file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const transfer: FileTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "transferring",
      direction: "sending",
      startTime: Date.now(),
    }

    this.fileTransfers.set(fileId, transfer)
    this.sendingFiles.set(fileId, { file, transfer })
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
      timestamp: Date.now(),
    })

    await this.sendFileInChunks(fileId, file, transfer)
  }

  private async sendFileInChunks(fileId: string, file: File, transfer: FileTransfer) {
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    let chunksSent = 0

    for (let i = 0; i < totalChunks; i++) {
      if (this.dataChannel?.readyState !== "open") {
        console.log("⚠️ Data channel closed during file transfer")
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      // Wait for buffer to be available
      while (this.dataChannel.bufferedAmount > 512 * 1024) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

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
        chunksSent++

        const progress = Math.min(Math.round((chunksSent / totalChunks) * 1024), 99)
        transfer.progress = progress

        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 10240
          const bytesSent = chunksSent * this.chunkSize
          transfer.speed = bytesSent / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      } catch (error) {
        console.error("❌ Error sending chunk:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }
    }

    this.sendDataChannelMessage({
      type: "file-complete",
      fileId,
      timestamp: Date.now(),
    })

    console.log(`✅ File ${file.name} sent successfully`)
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Connection not ready for chat")
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

  public forceReconnect() {
    console.log("🔄 Force reconnecting...")
    this.cleanup()
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.initialize()
      }
    }, 10240)
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

  public getP2PState() {
    return this.p2pState
  }
}
