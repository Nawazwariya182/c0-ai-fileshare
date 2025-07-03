// Ultra-Reliable Bulletproof P2P Connection System - Never Fails Edition

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
  status: "pending" | "transferring" | "completed" | "error" | "cancelled"
  direction: "sending" | "receiving"
  speed?: number
  startTime?: number
  checksum?: string
  cancelled?: boolean
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
  cancelled?: boolean
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  // Connection components
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null

  // Connection state
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"
  private userCount = 0

  // Connection handling
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
  }

  // P2P state management
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false
  private localDescriptionSet = false
  private p2pConnecting = false
  private p2pConnected = false

  // Reconnection management
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private maxReconnectAttempts = 50 // Much higher limit
  private baseReconnectDelay = 500 // Very fast reconnection

  // File transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private chunkSize = 64 * 1024 // 64KB chunks
  private maxConcurrentChunks = 8

  // Mobile optimization
  private isMobileDevice = false
  private isInBackground = false

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private p2pRetryTimer: NodeJS.Timeout | null = null

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
    this.isMobileDevice = this.detectMobile()
    this.initializeUrls()
    this.setupMobileOptimizations()
    console.log("🚀 Ultra-Reliable Bulletproof P2P System - Never Fails Edition")
  }

  private detectMobile(): boolean {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  private setupMobileOptimizations() {
    if (this.isMobileDevice) {
      console.log("📱 Mobile optimizations enabled")

      // Background/foreground detection
      document.addEventListener("visibilitychange", () => {
        this.isInBackground = document.hidden
        console.log(`📱 ${this.isInBackground ? "Background" : "Foreground"} mode`)

        if (!this.isInBackground) {
          // Force connection check when returning to foreground
          setTimeout(() => this.forceConnectionCheck(), 1000)
        }
      })

      // Prevent connection drops during file selection
      window.addEventListener("focus", () => {
        console.log("📱 Window focused - checking connections")
        this.forceConnectionCheck()
      })
    }
  }

  private initializeUrls() {
    this.wsUrls = []
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push("wss://signaling-server-1ckx.onrender.com")
    } else {
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080")
    }

    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🌐 Signaling URLs:", this.wsUrls)
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Initializing ultra-reliable connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    this.onConnectionStatusChange?.("connecting")
    this.onSignalingStatusChange?.("connecting")

    await this.connectWebSocket()
    this.startConnectionMonitoring()
  }

  public destroy() {
    console.log("🛑 Destroying P2P connection")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    ;[this.heartbeatTimer, this.reconnectTimer, this.connectionMonitorTimer, this.p2pRetryTimer].forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

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

    // Reset state
    this.resetP2PState()
    this.p2pConnecting = false
    this.p2pConnected = false
  }

  private startConnectionMonitoring() {
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      this.checkAndMaintainConnections()
    }, 2000) // Check every 2 seconds
  }

  private checkAndMaintainConnections() {
    const wsHealthy = this.ws?.readyState === WebSocket.OPEN
    const p2pHealthy = this.pc?.connectionState === "connected" && this.dataChannel?.readyState === "open"

    // Update signaling state
    const newSignalingState = wsHealthy ? "connected" : "disconnected"
    if (newSignalingState !== this.signalingState) {
      this.signalingState = newSignalingState
      this.onSignalingStatusChange?.(newSignalingState)
      console.log(`📡 Signaling: ${newSignalingState}`)
    }

    // Update P2P state
    const newConnectionState = p2pHealthy ? "connected" : this.p2pConnecting ? "connecting" : "disconnected"
    if (newConnectionState !== this.connectionState) {
      this.connectionState = newConnectionState
      this.onConnectionStatusChange?.(newConnectionState)
      console.log(`🔗 P2P: ${newConnectionState}`)

      if (newConnectionState === "connected") {
        this.p2pReconnectAttempts = 0
        this.onConnectionRecovery?.()
      }
    }

    // Maintain WebSocket connection
    if (!wsHealthy && !this.reconnectTimer) {
      console.log("🔄 WebSocket needs reconnection")
      this.connectWebSocket()
    }

    // Maintain P2P connection
    if (wsHealthy && this.userCount === 2 && !p2pHealthy && !this.p2pConnecting) {
      console.log("🔄 P2P needs connection/reconnection")
      this.initiateP2PConnection()
    }
  }

  private forceConnectionCheck() {
    console.log("🔍 Force checking all connections")
    this.checkAndMaintainConnections()

    // If we have 2 users but no P2P, force P2P connection
    if (this.userCount === 2 && !this.p2pConnected && !this.p2pConnecting) {
      setTimeout(() => this.initiateP2PConnection(), 500)
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws?.readyState === WebSocket.OPEN) return

    this.wsReconnectAttempts++

    // Cycle through URLs faster
    if (this.wsReconnectAttempts > 2) {
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      this.wsReconnectAttempts = 1
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 WebSocket connecting to ${wsUrl} (attempt ${this.wsReconnectAttempts})`)

    try {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(wsUrl)

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log("⏰ WebSocket timeout")
          this.ws.close()
          this.scheduleWebSocketReconnect()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ WebSocket connected!")
        this.wsReconnectAttempts = 0
        this.currentUrlIndex = 0

        // Join session immediately
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobileDevice,
            version: "never-fails-v1",
          },
        })

        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error("❌ Message parse error:", error)
        }
      }

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 WebSocket closed: ${event.code}`)
        this.ws = null
        this.stopHeartbeat()

        if (!this.isDestroyed && event.code !== 1000) {
          this.scheduleWebSocketReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("❌ WebSocket error:", error)
        this.scheduleWebSocketReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      this.scheduleWebSocketReconnect()
    }
  }

  private scheduleWebSocketReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return

    const delay = Math.min(this.baseReconnectDelay * Math.pow(1.2, Math.min(this.wsReconnectAttempts, 10)), 10000)
    console.log(`🔄 Scheduling WebSocket reconnect in ${delay}ms`)

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
      } catch (error) {
        console.error("❌ Send error:", error)
      }
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
    }, 15000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async handleSignalingMessage(message: any) {
    console.log(`📨 Signaling: ${message.type}`)

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

        // Immediately start P2P when both users are present
        if (message.userCount === 2) {
          console.log("🚀 Both users present - starting P2P immediately!")
          setTimeout(() => this.initiateP2PConnection(), 100) // Very fast
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected")
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        if (message.userCount === 2 && !this.p2pConnected) {
          setTimeout(() => this.initiateP2PConnection(), 100)
        }
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
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        this.p2pConnected = false
        this.connectionState = "disconnected"
        this.onConnectionStatusChange?.("disconnected")
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async initiateP2PConnection() {
    if (this.isDestroyed || this.p2pConnecting || this.p2pConnected) {
      console.log("⚠️ P2P connection blocked - already connecting/connected")
      return
    }

    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⚠️ P2P connection blocked - WebSocket not ready")
      return
    }

    if (this.userCount !== 2) {
      console.log("⚠️ P2P connection blocked - need 2 users")
      return
    }

    this.p2pReconnectAttempts++
    if (this.p2pReconnectAttempts > this.maxReconnectAttempts) {
      console.log("❌ Max P2P attempts reached")
      this.onError?.("P2P connection failed after many attempts")
      return
    }

    console.log(`🚀 Initiating P2P connection (attempt ${this.p2pReconnectAttempts})`)
    this.p2pConnecting = true
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up any existing connection
      if (this.pc) {
        this.pc.close()
        this.pc = null
      }
      this.dataChannel = null
      this.resetP2PState()

      // Create new peer connection with aggressive settings
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.nextcloud.com:443" },
        ],
        iceCandidatePoolSize: 20, // More candidates
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all",
      })

      this.setupPeerConnectionHandlers()

      if (this.isInitiator) {
        // Create data channel for initiator
        this.dataChannel = this.pc.createDataChannel("bulletproof-data", {
          ordered: true,
          maxRetransmits: 3,
        })
        this.setupDataChannelHandlers()

        // Create and send offer
        const offer = await this.pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        })

        await this.pc.setLocalDescription(offer)
        this.localDescriptionSet = true

        console.log("📤 Sending offer")
        this.sendMessage({
          type: "offer",
          sessionId: this.sessionId,
          offer: offer,
          timestamp: Date.now(),
        })
      }

      // Set retry timer
      this.p2pRetryTimer = setTimeout(() => {
        if (!this.p2pConnected) {
          console.log("⏰ P2P connection timeout - retrying")
          this.p2pConnecting = false
          this.initiateP2PConnection()
        }
      }, 15000) // 15 second timeout
    } catch (error) {
      console.error("❌ P2P initiation error:", error)
      this.p2pConnecting = false
      this.onError?.("Failed to initiate P2P connection")

      // Retry after delay
      setTimeout(() => this.initiateP2PConnection(), 2000)
    }
  }

  private resetP2PState() {
    this.iceCandidateQueue = []
    this.remoteDescriptionSet = false
    this.localDescriptionSet = false
  }

  private setupPeerConnectionHandlers() {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("📤 Sending ICE candidate")
        this.sendMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          timestamp: Date.now(),
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
          console.log("✅ P2P connected successfully!")
          this.p2pConnected = true
          this.p2pConnecting = false
          this.p2pReconnectAttempts = 0
          this.clearP2PRetryTimer()
          break

        case "connecting":
          console.log("🔄 P2P connecting...")
          break

        case "disconnected":
        case "failed":
          console.log(`⚠️ P2P ${state} - will retry`)
          this.p2pConnected = false
          this.p2pConnecting = false
          this.clearP2PRetryTimer()
          // Retry immediately
          setTimeout(() => this.initiateP2PConnection(), 1000)
          break

        case "closed":
          console.log("🔌 P2P closed")
          this.p2pConnected = false
          this.p2pConnecting = false
          this.clearP2PRetryTimer()
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 ICE connection state: ${state}`)

      if (state === "failed") {
        console.log("❌ ICE failed - restarting ICE")
        this.pc?.restartIce()
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

    this.dataChannel.onopen = () => {
      console.log("📡 Data channel opened - P2P fully connected!")
      this.p2pConnected = true
      this.p2pConnecting = false
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.clearP2PRetryTimer()

      // Send connection test
      this.sendDataChannelMessage({
        type: "connection-test",
        message: "Bulletproof connection established",
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
        console.error("❌ Data message error:", error)
      }
    }

    this.dataChannel.onclose = () => {
      console.log("📡 Data channel closed")
      this.p2pConnected = false
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
    }
  }

  private clearP2PRetryTimer() {
    if (this.p2pRetryTimer) {
      clearTimeout(this.p2pRetryTimer)
      this.p2pRetryTimer = null
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.p2pConnecting) {
      console.log("⚠️ Ignoring offer - busy")
      return
    }

    console.log("📥 Handling offer")
    this.p2pConnecting = true
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
      }
      this.resetP2PState()

      // Create peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.nextcloud.com:443" },
        ],
        iceCandidatePoolSize: 20,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      })

      this.setupPeerConnectionHandlers()

      // Set remote description
      await this.pc.setRemoteDescription(offer)
      this.remoteDescriptionSet = true
      console.log("✅ Remote description set")

      // Create answer
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.localDescriptionSet = true

      console.log("📤 Sending answer")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
      })

      // Process queued ICE candidates
      this.processQueuedICECandidates()

      // Set timeout
      this.p2pRetryTimer = setTimeout(() => {
        if (!this.p2pConnected) {
          console.log("⏰ Answer timeout - retrying")
          this.p2pConnecting = false
          this.initiateP2PConnection()
        }
      }, 15000)
    } catch (error) {
      console.error("❌ Handle offer error:", error)
      this.p2pConnecting = false
      this.onError?.("Failed to handle offer")
      setTimeout(() => this.initiateP2PConnection(), 2000)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || !this.pc) {
      console.log("⚠️ Ignoring answer")
      return
    }

    try {
      console.log("📥 Handling answer")
      if (this.pc.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
        this.remoteDescriptionSet = true
        console.log("✅ Answer processed")

        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Wrong signaling state for answer:", this.pc.signalingState)
      }
    } catch (error) {
      console.error("❌ Handle answer error:", error)
      this.onError?.("Failed to handle answer")
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

    console.log(`🧊 Processing ${this.iceCandidateQueue.length} queued ICE candidates`)
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(candidate)
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
        console.error("❌ Data send error:", error)
      }
    }
  }

  private handleDataMessage(message: any) {
    switch (message.type) {
      case "connection-test":
        console.log("📨 Connection test received")
        this.sendDataChannelMessage({
          type: "connection-ack",
          message: "Connection confirmed",
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

      case "file-complete":
        this.handleFileComplete(message)
        break

      case "file-cancel":
        this.handleFileCancel(message)
        break
    }
  }

  // File transfer methods (keeping existing implementation)
  private handleFileStart(message: any) {
    console.log(`📥 File start: ${message.fileName}`)

    const transfer: FileTransfer = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
      startTime: Date.now(),
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
      lastChunkTime: Date.now(),
      cancelled: false,
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

      if (fileData && transfer && !fileData.cancelled && !transfer.cancelled) {
        fileData.chunks.set(chunkIndex, chunkData)
        fileData.receivedSize += chunkData.byteLength
        fileData.lastChunkTime = Date.now()

        const progress = Math.round((fileData.chunks.size / fileData.totalChunks) * 100)
        transfer.progress = Math.min(progress, 99)

        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        // Check if complete
        if (fileData.chunks.size === fileData.totalChunks) {
          this.completeFileReception(fileId)
        }
      }
    } catch (error) {
      console.error("❌ File chunk error:", error)
    }
  }

  private async completeFileReception(fileId: string) {
    const fileData = this.receivedChunks.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!fileData || !transfer || fileData.cancelled || transfer.cancelled) return

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
      this.downloadFile(blob, fileData.fileName)

      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(fileId, transfer)
      this.receivedChunks.delete(fileId)

      this.updateFileTransfers()
      console.log(`✅ File ${fileData.fileName} completed`)
    } catch (error) {
      console.error("❌ File completion error:", error)
      transfer.status = "error"
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
    }
  }

  private handleFileComplete(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer && transfer.direction === "sending" && !transfer.cancelled) {
      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(message.fileId, transfer)
      this.updateFileTransfers()
      console.log(`✅ File ${transfer.name} sent`)
    }
  }

  private handleFileCancel(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    const fileData = this.receivedChunks.get(message.fileId)

    if (transfer) {
      transfer.status = "cancelled"
      transfer.cancelled = true
      this.fileTransfers.set(message.fileId, transfer)
    }

    if (fileData) {
      fileData.cancelled = true
      this.receivedChunks.delete(message.fileId)
    }

    this.updateFileTransfers()
    console.log(`❌ File transfer ${message.fileId} cancelled`)
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
      this.onError?.("Connection not ready")
      return
    }

    for (const file of files) {
      await this.sendFile(file)
    }
  }

  private async sendFile(file: File) {
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
      cancelled: false,
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
      timestamp: Date.now(),
    })

    // Send chunks with parallel processing
    const totalChunks = Math.ceil(file.size / this.chunkSize)

    for (let i = 0; i < totalChunks; i += this.maxConcurrentChunks) {
      const batchEnd = Math.min(i + this.maxConcurrentChunks, totalChunks)
      const batchPromises: Promise<void>[] = []

      for (let j = i; j < batchEnd; j++) {
        batchPromises.push(this.sendChunk(file, fileId, j))
      }

      await Promise.all(batchPromises)

      // Check if cancelled
      const currentTransfer = this.fileTransfers.get(fileId)
      if (currentTransfer?.cancelled) {
        console.log(`❌ File transfer ${fileId} cancelled`)
        return
      }

      // Update progress
      const progress = Math.round((batchEnd / totalChunks) * 100)
      transfer.progress = Math.min(progress, 99)

      if (transfer.startTime) {
        const elapsed = (Date.now() - transfer.startTime) / 1000
        const bytesSent = batchEnd * this.chunkSize
        transfer.speed = bytesSent / elapsed
      }

      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
    }

    // Send completion
    const finalTransfer = this.fileTransfers.get(fileId)
    if (finalTransfer && !finalTransfer.cancelled) {
      this.sendDataChannelMessage({
        type: "file-complete",
        fileId,
        timestamp: Date.now(),
      })
      console.log(`✅ File ${file.name} sent`)
    }
  }

  private async sendChunk(file: File, fileId: string, chunkIndex: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const transfer = this.fileTransfers.get(fileId)
        if (transfer?.cancelled) {
          resolve()
          return
        }

        // Wait for buffer space
        while (this.dataChannel && this.dataChannel.bufferedAmount > 256 * 1024) {
          await new Promise((r) => setTimeout(r, 10))
        }

        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
          reject(new Error("Data channel not available"))
          return
        }

        const start = chunkIndex * this.chunkSize
        const end = Math.min(start + this.chunkSize, file.size)
        const chunk = file.slice(start, end)
        const arrayBuffer = await chunk.arrayBuffer()

        // Create message
        const fileIdBytes = new TextEncoder().encode(fileId)
        const message = new ArrayBuffer(8 + fileIdBytes.length + arrayBuffer.byteLength)
        const view = new DataView(message)

        view.setUint32(0, fileIdBytes.length)
        view.setUint32(4, chunkIndex)
        new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
        new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

        this.dataChannel.send(message)
        resolve()
      } catch (error) {
        console.error("❌ Send chunk error:", error)
        reject(error)
      }
    })
  }

  public cancelFileTransfer(transferId: string) {
    const transfer = this.fileTransfers.get(transferId)
    if (!transfer) return

    console.log(`❌ Cancelling file transfer: ${transfer.name}`)

    transfer.status = "cancelled"
    transfer.cancelled = true
    this.fileTransfers.set(transferId, transfer)

    // Notify peer
    if (this.dataChannel?.readyState === "open") {
      this.sendDataChannelMessage({
        type: "file-cancel",
        fileId: transferId,
        timestamp: Date.now(),
      })
    }

    // Clean up
    if (transfer.direction === "receiving") {
      const fileData = this.receivedChunks.get(transferId)
      if (fileData) {
        fileData.cancelled = true
        this.receivedChunks.delete(transferId)
      }
    }

    this.updateFileTransfers()
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Connection not ready")
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
    console.log("🔄 Force reconnect")
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
}
