// Ultra-Persistent P2P Connection System - Never Disconnect Edition

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
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  // Connection components
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null

  // Ultra-persistent state management
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"
  private neverGiveUp = true // This is the key - never stop trying!
  private sessionPersistent = true // Keep session alive forever

  // Connection handling
  private wsUrl = ""
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
  }

  // ICE candidate queue for proper handling
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private isRemoteDescriptionSet = false

  // Ultra-persistent reconnection tracking
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private lastDisconnectTime = 0
  private reconnectBackoff = 1000 // Start with 1 second
  private maxReconnectBackoff = 10000 // Max 10 seconds
  private persistentReconnectEnabled = true

  // File and chat management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<
    string,
    { chunks: Map<number, ArrayBuffer>; totalSize: number; fileName: string; fileType: string }
  > = new Map()

  // Ultra-persistent timers - these never stop!
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private p2pTimeoutTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private persistentReconnectTimer: NodeJS.Timeout | null = null
  private sessionKeepAliveTimer: NodeJS.Timeout | null = null
  private ultraPersistentTimer: NodeJS.Timeout | null = null

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

    // URL setup
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrl = process.env.NEXT_PUBLIC_WS_URL
    } else if (process.env.NODE_ENV === "production") {
      this.wsUrl = "wss://signaling-server-1ckx.onrender.com"
    } else {
      this.wsUrl = "ws://localhost:8080"
    }

    console.log("🚀 Ultra-Persistent P2P System initialized - NEVER DISCONNECT MODE")
    console.log(`🔒 Session ${sessionId} will persist forever`)
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting ultra-persistent connection - NEVER GIVE UP!")
    this.neverGiveUp = true
    this.sessionPersistent = true
    this.persistentReconnectEnabled = true
    
    this.connectionState = "connecting"
    this.signalingState = "connecting"

    await this.connectWebSocket()
    this.startUltraPersistentMonitoring()
    this.startSessionKeepAlive()
  }

  public destroy() {
    console.log("🛑 Destroying ultra-persistent P2P")
    this.isDestroyed = true
    this.neverGiveUp = false
    this.sessionPersistent = false
    this.persistentReconnectEnabled = false
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    const timers = [
      this.heartbeatTimer, 
      this.reconnectTimer, 
      this.p2pTimeoutTimer, 
      this.connectionMonitorTimer,
      this.persistentReconnectTimer,
      this.sessionKeepAliveTimer,
      this.ultraPersistentTimer
    ]

    timers.forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    // Reset timer references
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.p2pTimeoutTimer = null
    this.connectionMonitorTimer = null
    this.persistentReconnectTimer = null
    this.sessionKeepAliveTimer = null
    this.ultraPersistentTimer = null

    // Close connections only if we're truly destroying
    if (this.isDestroyed) {
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
    }

    // Clear queues
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false
  }

  private startUltraPersistentMonitoring() {
    // Ultra-persistent monitoring - checks every 5 seconds and NEVER stops trying
    this.ultraPersistentTimer = setInterval(() => {
      if (!this.neverGiveUp) return

      const now = Date.now()
      const timeSinceLastDisconnect = now - this.lastDisconnectTime

      // Check WebSocket health
      if (this.ws?.readyState !== WebSocket.OPEN) {
        if (this.signalingState !== "connecting") {
          console.log("🔧 WebSocket lost - ULTRA-PERSISTENT RECONNECT!")
          this.signalingState = "connecting"
          this.onSignalingStatusChange?.("connecting")
          this.connectWebSocket()
        }
      }

      // Check P2P health
      if (this.pc?.connectionState === "failed" || 
          this.pc?.connectionState === "disconnected" || 
          this.pc?.connectionState === "closed") {
        if (this.connectionState !== "connecting") {
          console.log("🔧 P2P lost - ULTRA-PERSISTENT P2P RECOVERY!")
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          this.lastDisconnectTime = now
          this.scheduleP2PRecovery()
        }
      }

      // Ultra-aggressive reconnection if disconnected for too long
      if (timeSinceLastDisconnect > 30000 && // 30 seconds
          (this.connectionState === "disconnected" || this.signalingState === "disconnected")) {
        console.log("🚨 ULTRA-PERSISTENT: Force full reconnection after 30s!")
        this.forceFullReconnection()
      }

      // Session persistence - keep the session alive
      this.maintainSessionPersistence()

    }, 5000) // Check every 5 seconds
  }

  private startSessionKeepAlive() {
    // Keep the session alive forever - send keep-alive every 15 seconds
    this.sessionKeepAliveTimer = setInterval(() => {
      if (!this.sessionPersistent) return

      // Send session keep-alive through WebSocket
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: "session-keep-alive",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          persistent: true,
          neverExpire: true
        })
      }

      // Send keep-alive through data channel if available
      if (this.dataChannel?.readyState === "open") {
        this.sendDataChannelMessage({
          type: "session-keep-alive",
          timestamp: Date.now(),
          persistent: true
        })
      }

      console.log("💓 Session keep-alive sent - session will NEVER expire")
    }, 15000) // Every 15 seconds
  }

  private maintainSessionPersistence() {
    // Ensure session never dies
    if (this.sessionPersistent) {
      // Send persistence signal
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: "maintain-session",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          forceKeepAlive: true,
          neverExpire: true
        })
      }
    }
  }

  private async connectWebSocket() {
    if (!this.neverGiveUp || (this.ws?.readyState === WebSocket.OPEN)) return

    console.log(`🔗 Ultra-persistent WebSocket connection attempt ${this.wsReconnectAttempts + 1}`)

    try {
      // Close existing connection
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(this.wsUrl)

      // Connection timeout with retry
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log("⏰ WebSocket timeout - WILL RETRY FOREVER!")
          this.ws.close()
          this.scheduleWebSocketReconnect()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ Ultra-persistent WebSocket connected!")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")
        this.wsReconnectAttempts = 0 // Reset on success
        this.reconnectBackoff = 1000 // Reset backoff

        // Send join message with persistence flag
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          persistent: true,
          neverExpire: true,
          reconnect: this.wsReconnectAttempts > 0,
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobile(),
            ultraPersistent: true
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
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason} - WILL RECONNECT!`)
        this.signalingState = "disconnected"
        this.onSignalingStatusChange?.("disconnected")
        this.ws = null
        this.stopHeartbeat()
        this.lastDisconnectTime = Date.now()

        // ALWAYS reconnect unless destroyed
        if (this.neverGiveUp) {
          this.scheduleWebSocketReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("❌ WebSocket error - WILL RETRY:", error)
        this.scheduleWebSocketReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed - WILL RETRY:", error)
      this.scheduleWebSocketReconnect()
    }
  }

  private scheduleWebSocketReconnect() {
    if (!this.neverGiveUp || this.reconnectTimer) return

    this.wsReconnectAttempts++
    const delay = Math.min(this.reconnectBackoff * Math.pow(1.5, Math.min(this.wsReconnectAttempts, 10)), this.maxReconnectBackoff)
    
    console.log(`🔄 WebSocket reconnect #${this.wsReconnectAttempts} in ${delay}ms - NEVER GIVING UP!`)
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectWebSocket()
    }, delay)
  }

  private scheduleP2PRecovery() {
    if (!this.neverGiveUp) return

    this.p2pReconnectAttempts++
    const delay = Math.min(2000 * Math.pow(1.2, Math.min(this.p2pReconnectAttempts, 8)), 15000) // Max 15s

    console.log(`🔄 P2P recovery #${this.p2pReconnectAttempts} in ${delay}ms - NEVER GIVING UP!`)

    if (this.persistentReconnectTimer) {
      clearTimeout(this.persistentReconnectTimer)
    }

    this.persistentReconnectTimer = setTimeout(() => {
      this.persistentReconnectTimer = null
      this.recoverP2PConnection()
    }, delay)
  }

  private async recoverP2PConnection() {
    if (!this.neverGiveUp) return

    console.log("🚀 Ultra-persistent P2P recovery attempt")

    // Clean up old P2P connection
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    this.dataChannel = null
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false

    // Wait for WebSocket to be ready
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⏳ Waiting for WebSocket before P2P recovery...")
      setTimeout(() => this.recoverP2PConnection(), 2000)
      return
    }

    // Signal both peers to restart P2P
    this.sendMessage({
      type: "force-p2p-restart",
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      reason: "ultra-persistent-recovery"
    })

    // If we're the initiator, start P2P
    if (this.isInitiator) {
      setTimeout(() => this.initP2P(), 1000)
    }
  }

  private forceFullReconnection() {
    console.log("🚨 FORCE FULL RECONNECTION - ULTRA-PERSISTENT MODE!")
    
    // Reset all connection attempts
    this.wsReconnectAttempts = 0
    this.p2pReconnectAttempts = 0
    this.reconnectBackoff = 1000

    // Clear all timers except ultra-persistent ones
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.persistentReconnectTimer) {
      clearTimeout(this.persistentReconnectTimer)
      this.persistentReconnectTimer = null
    }

    // Force reconnect everything
    this.connectWebSocket()
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
      console.log("📤 Cannot send message - WebSocket not open, will retry when connected")
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
          persistent: true
        })
      }
    }, 20000) // Every 20 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async handleMessage(message: any) {
    switch (message.type) {
      case "joined":
        console.log(`👤 Joined ultra-persistent session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        console.log(`🎯 Ultra-persistent role: ${this.isInitiator ? "INITIATOR" : "RECEIVER"}`)
        break

      case "user-joined":
        console.log(`👤 User joined ultra-persistent session! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)

        if (this.isInitiator && message.userCount === 2) {
          console.log("🚀 Starting ultra-persistent P2P as initiator...")
          setTimeout(() => this.initP2P(), 2000)
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected - maintaining ultra-persistent session")
        this.onUserCountChange?.(message.userCount)
        
        // If P2P is not connected, try to reconnect
        if (this.connectionState !== "connected" && this.isInitiator) {
          console.log("🚀 Peer reconnected - restarting P2P connection")
          setTimeout(() => this.initP2P(), 1000)
        }
        break

      case "force-p2p-restart":
        console.log("🔄 Received force P2P restart signal")
        if (message.userId !== this.userId) { // Don't restart on our own signal
          this.recoverP2PConnection()
        }
        break

      case "session-maintained":
        console.log("💓 Session persistence confirmed by server")
        break

      case "pong":
        // Connection is alive
        break

      case "offer":
        console.log("📥 Received ultra-persistent offer")
        await this.handleOffer(message.offer)
        break

      case "answer":
        console.log("📥 Received ultra-persistent answer")
        await this.handleAnswer(message.answer)
        break

      case "ice-candidate":
        console.log("📥 Received ultra-persistent ICE candidate")
        await this.handleIceCandidate(message.candidate)
        break

      case "user-left":
        console.log("👋 User left - but session remains PERSISTENT!")
        this.onUserCountChange?.(message.userCount)
        
        // Don't change connection state to disconnected - keep trying!
        if (this.connectionState === "connected") {
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
        }
        
        // Keep the session alive and wait for reconnection
        console.log("⏳ Waiting for peer to reconnect to ultra-persistent session...")
        break

      case "error":
        console.error("❌ Server error (will retry):", message.message)
        this.onError?.(message.message)
        
        // Even on error, keep trying
        if (this.neverGiveUp) {
          setTimeout(() => this.connectWebSocket(), 3000)
        }
        break
    }
  }

  private async initP2P() {
    if (!this.neverGiveUp || this.pc) {
      console.log("⚠️ P2P already exists or system destroyed")
      return
    }

    console.log("🚀 Initializing ultra-persistent P2P connection as initiator")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Create peer connection with comprehensive STUN servers
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.nextcloud.com:443" },
        ],
        iceCandidatePoolSize: 10,
      })

      this.setupPeerConnectionHandlers()

      // Create data channel as initiator
      this.dataChannel = this.pc.createDataChannel("ultra-persistent-data", {
        ordered: true,
        maxRetransmits: 3,
      })
      this.setupDataChannelHandlers()

      // Set P2P timeout with retry
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ P2P timeout - ULTRA-PERSISTENT RETRY!")
          this.scheduleP2PRecovery()
        }
      }, 30000) // 30 second timeout

      // Create and send offer
      console.log("📤 Creating ultra-persistent offer...")
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })

      await this.pc.setLocalDescription(offer)
      console.log("📤 Sending ultra-persistent offer...")

      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
        persistent: true
      })
    } catch (error) {
      console.error("❌ P2P init error - WILL RETRY:", error)
      this.onError?.("P2P connection failed - retrying automatically...")
      this.scheduleP2PRecovery()
    }
  }

  private setupPeerConnectionHandlers() {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`📤 Sending ultra-persistent ICE candidate: ${event.candidate.type}`)
        this.sendMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          timestamp: Date.now(),
          persistent: true
        })
      } else {
        console.log("✅ Ultra-persistent ICE gathering complete")
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔄 Ultra-persistent P2P connection state: ${state}`)

      switch (state) {
        case "connected":
          console.log("✅ Ultra-persistent P2P connection established!")
          this.connectionState = "connected"
          this.onConnectionStatusChange?.("connected")
          this.clearP2PTimeout()
          this.p2pReconnectAttempts = 0 // Reset on success
          this.onConnectionRecovery?.()
          break

        case "connecting":
          console.log("🔄 Ultra-persistent P2P connecting...")
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
          console.log("⚠️ Ultra-persistent P2P disconnected - WILL RECOVER!")
          this.connectionState = "connecting" // Don't show as disconnected
          this.onConnectionStatusChange?.("connecting")
          this.lastDisconnectTime = Date.now()
          this.scheduleP2PRecovery()
          break

        case "failed":
          console.log("❌ Ultra-persistent P2P failed - WILL RECOVER!")
          this.connectionState = "connecting" // Don't show as disconnected
          this.onConnectionStatusChange?.("connecting")
          this.lastDisconnectTime = Date.now()
          this.scheduleP2PRecovery()
          break

        case "closed":
          console.log("🔌 Ultra-persistent P2P closed - WILL RECOVER!")
          this.connectionState = "connecting" // Don't show as disconnected
          this.onConnectionStatusChange?.("connecting")
          this.lastDisconnectTime = Date.now()
          this.scheduleP2PRecovery()
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 Ultra-persistent ICE connection state: ${state}`)

      if (state === "failed" || state === "disconnected") {
        console.log("❌ Ultra-persistent ICE failed - restarting ICE...")
        this.pc?.restartIce()
        
        // Also schedule P2P recovery as backup
        setTimeout(() => {
          if (this.pc?.iceConnectionState === "failed") {
            this.scheduleP2PRecovery()
          }
        }, 5000)
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log("📡 Received ultra-persistent data channel")
      this.dataChannel = event.channel
      this.setupDataChannelHandlers()
    }
  }

  private setupDataChannelHandlers() {
    if (!this.dataChannel) return

    this.dataChannel.binaryType = "arraybuffer"

    this.dataChannel.onopen = () => {
      console.log("📡 Ultra-persistent data channel opened!")
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.clearP2PTimeout()
      this.p2pReconnectAttempts = 0 // Reset on success

      // Send test message
      this.sendDataChannelMessage({
        type: "connection-test",
        message: "Ultra-persistent data channel ready",
        timestamp: Date.now(),
        persistent: true
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
      console.log("📡 Ultra-persistent data channel closed - WILL RECOVER!")
      this.connectionState = "connecting" // Don't show as disconnected
      this.onConnectionStatusChange?.("connecting")
      this.lastDisconnectTime = Date.now()
      this.scheduleP2PRecovery()
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Ultra-persistent data channel error - WILL RECOVER:", error)
      this.scheduleP2PRecovery()
    }
  }

  private clearP2PTimeout() {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer)
      this.p2pTimeoutTimer = null
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.neverGiveUp) return

    try {
      console.log("📥 Handling ultra-persistent offer as receiver")

      // Create peer connection if not exists
      if (!this.pc) {
        this.pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
            { urls: "stun:stun.nextcloud.com:443" },
          ],
          iceCandidatePoolSize: 10,
        })

        this.setupPeerConnectionHandlers()
      }

      console.log("📥 Setting remote description...")
      await this.pc.setRemoteDescription(offer)
      this.isRemoteDescriptionSet = true

      console.log("📤 Creating ultra-persistent answer...")
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      console.log("📤 Sending ultra-persistent answer...")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
        persistent: true
      })

      // Process queued ICE candidates
      this.processQueuedICECandidates()
    } catch (error) {
      console.error("❌ Handle offer error - WILL RETRY:", error)
      this.onError?.("Failed to handle connection offer - retrying automatically...")
      this.scheduleP2PRecovery()
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling ultra-persistent answer as initiator")

      if (this.pc?.signalingState === "have-local-offer") {
        console.log("📥 Setting remote description...")
        await this.pc.setRemoteDescription(answer)
        this.isRemoteDescriptionSet = true
        console.log("✅ Ultra-persistent answer processed successfully")

        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Cannot set remote description - wrong signaling state:", this.pc?.signalingState)
        // Retry after a delay
        setTimeout(() => this.scheduleP2PRecovery(), 2000)
      }
    } catch (error) {
      console.error("❌ Handle answer error - WILL RETRY:", error)
      this.onError?.("Failed to handle connection answer - retrying automatically...")
      this.scheduleP2PRecovery()
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc && this.isRemoteDescriptionSet) {
        console.log("✅ Adding ultra-persistent ICE candidate immediately")
        await this.pc.addIceCandidate(candidate)
      } else {
        console.log("⏳ Queuing ultra-persistent ICE candidate")
        this.iceCandidateQueue.push(candidate)
      }
    } catch (error) {
      console.error("❌ ICE candidate error:", error)
    }
  }

  private async processQueuedICECandidates() {
    if (!this.pc || !this.isRemoteDescriptionSet) return

    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ultra-persistent ICE candidates`)

    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(candidate)
        console.log("✅ Processed queued ultra-persistent ICE candidate")
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
        console.log("📨 Received ultra-persistent connection test")
        this.sendDataChannelMessage({
          type: "connection-ack",
          message: "Ultra-persistent connection confirmed",
          timestamp: Date.now(),
          persistent: true
        })
        break

      case "connection-ack":
        console.log("✅ Ultra-persistent connection acknowledged")
        break

      case "session-keep-alive":
        console.log("💓 Received session keep-alive")
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

      case "file-end":
        this.handleFileEnd(message.fileId)
        break
    }
  }

  private handleFileStart(message: any) {
    console.log(`📥 Starting ultra-persistent file reception: ${message.fileName}`)

    const transfer: FileTransfer = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
    }

    this.fileTransfers.set(message.fileId, transfer)

    const totalChunks = Math.ceil(message.fileSize / (64 * 1024))
    this.receivedChunks.set(message.fileId, {
      chunks: new Map(),
      totalSize: message.fileSize,
      fileName: message.fileName,
      fileType: message.fileType,
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

        const totalChunks = Math.ceil(fileData.totalSize / (64 * 1024))
        const progress = Math.round((fileData.chunks.size / totalChunks) * 100)
        transfer.progress = progress

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
      }
    } catch (error) {
      console.error("❌ File chunk error:", error)
    }
  }

  private async handleFileEnd(fileId: string) {
    console.log(`📥 Ultra-persistent file reception complete: ${fileId}`)

    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (fileData && transfer) {
      try {
        const totalChunks = Math.ceil(fileData.totalSize / (64 * 1024))
        const orderedChunks: ArrayBuffer[] = []

        for (let i = 0; i < totalChunks; i++) {
          const chunk = fileData.chunks.get(i)
          if (chunk) {
            orderedChunks.push(chunk)
          } else {
            throw new Error(`Missing chunk ${i}`)
          }
        }

        const blob = new Blob(orderedChunks, { type: fileData.fileType })
        this.downloadFile(blob, fileData.fileName)

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.receivedChunks.delete(fileId)
        this.updateFileTransfers()

        console.log(`✅ Ultra-persistent file ${fileData.fileName} downloaded successfully`)
      } catch (error) {
        console.error("❌ File end error:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
      }
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

  // Public methods
  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready - connection will recover automatically")
      return
    }

    console.log(`📤 Starting ultra-persistent file transfer: ${files.length} files`)

    for (const file of files) {
      await this.sendFile(file)
    }
  }

  private async sendFile(file: File) {
    const fileId = Math.random().toString(36).substring(2, 15)
    const chunkSize = 64 * 1024 // 64KB chunks

    console.log(`📤 Sending ultra-persistent file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

    const transfer: FileTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "transferring",
      direction: "sending",
    }

    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()

    // Send file start
    this.sendDataChannelMessage({
      type: "file-start",
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      persistent: true
    })

    // Send chunks with flow control
    const totalChunks = Math.ceil(file.size / chunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

      // Create message with file ID and chunk index
      const fileIdBytes = new TextEncoder().encode(fileId)
      const message = new ArrayBuffer(8 + fileIdBytes.length + arrayBuffer.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, i)
      new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

      // Wait for buffer to be available
      while (this.dataChannel!.bufferedAmount > 16 * 1024 * 1024) {
        // 16MB buffer limit
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      this.dataChannel!.send(message)

      // Update progress
      const progress = Math.round(((i + 1) / totalChunks) * 100)
      transfer.progress = progress
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Small delay for flow control
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    }

    // Send file end
    this.sendDataChannelMessage({
      type: "file-end",
      fileId,
      persistent: true
    })

    transfer.status = "completed"
    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()

    console.log(`✅ Ultra-persistent file ${file.name} sent successfully`)
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Chat not ready - connection will recover automatically")
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
      persistent: true
    })
  }

  // Ultra-persistent connection maintenance methods
  public maintainConnection() {
    this.maintainSessionPersistence()
  }

  public forceReconnect() {
    console.log("🔄 Force reconnecting ultra-persistent system...")
    this.forceFullReconnection()
  }

  // Getters
  public getConnectionState() {
    return this.connectionState
  }

  public getSignalingState() {
    return this.signalingState
  }

  public isDataChannelOpen() {
    return this.dataChannel?.readyState === "open"
  }

  public isUltraPersistent() {
    return this.neverGiveUp && this.sessionPersistent
  }
}
