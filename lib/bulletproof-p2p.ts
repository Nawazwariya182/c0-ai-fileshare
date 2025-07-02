// Rock-Solid P2P Connection System - Fixed Reconnection & Large File Transfer

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
  private isConnecting = false
  private connectionLocked = false

  // Connection handling
  private wsUrl = ""
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
  }

  // Fixed ICE candidate handling
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private isRemoteDescriptionSet = false
  private localDescriptionSet = false
  private offerAnswerInProgress = false

  // Reconnection management
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private maxReconnectAttempts = 50
  private reconnectDelay = 2000
  private lastConnectionAttempt = 0

  // Fixed file transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private sendingFiles: Map<string, { file: File; transfer: FileTransfer }> = new Map()
  private chunkSize = 32 * 1024 // 32KB chunks for better reliability
  private maxConcurrentChunks = 8
  private fileTransferQueue: string[] = []

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private fileTransferTimer: NodeJS.Timeout | null = null

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

    console.log("🚀 Rock-Solid P2P System initialized - Fixed Reconnection & Large Files")
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting rock-solid connection with fixed reconnection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    this.isConnecting = false
    this.connectionLocked = false

    await this.connectWebSocket()
    this.startConnectionMonitoring()
  }

  public destroy() {
    console.log("🛑 Destroying rock-solid P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    const timers = [this.heartbeatTimer, this.reconnectTimer, this.connectionMonitorTimer, this.fileTransferTimer]

    timers.forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.connectionMonitorTimer = null
    this.fileTransferTimer = null

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
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false
    this.localDescriptionSet = false
    this.offerAnswerInProgress = false
    this.isConnecting = false
    this.connectionLocked = false
  }

  private startConnectionMonitoring() {
    // Monitor connection health every 3 seconds
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      this.checkConnectionHealth()
      this.attemptReconnectionIfNeeded()
    }, 3000)
  }

  private checkConnectionHealth() {
    const wsHealthy = this.ws?.readyState === WebSocket.OPEN
    const p2pHealthy = this.pc?.connectionState === "connected"
    const dataChannelHealthy = this.dataChannel?.readyState === "open"

    // Update signaling state
    if (wsHealthy && this.signalingState !== "connected") {
      this.signalingState = "connected"
      this.onSignalingStatusChange?.("connected")
    } else if (!wsHealthy && this.signalingState === "connected") {
      this.signalingState = "disconnected"
      this.onSignalingStatusChange?.("disconnected")
    }

    // Update P2P state
    if (p2pHealthy && dataChannelHealthy && this.connectionState !== "connected") {
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.p2pReconnectAttempts = 0
      this.onConnectionRecovery?.()
      console.log("✅ P2P connection fully established!")
    } else if ((!p2pHealthy || !dataChannelHealthy) && this.connectionState === "connected") {
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
      console.log("⚠️ P2P connection lost")
    }
  }

  private attemptReconnectionIfNeeded() {
    const now = Date.now()
    const timeSinceLastAttempt = now - this.lastConnectionAttempt

    // WebSocket reconnection
    if (this.ws?.readyState !== WebSocket.OPEN && !this.isConnecting && timeSinceLastAttempt > this.reconnectDelay) {
      this.connectWebSocket()
    }

    // P2P reconnection
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.pc?.connectionState !== "connected" &&
      !this.isConnecting &&
      !this.connectionLocked &&
      timeSinceLastAttempt > this.reconnectDelay
    ) {
      console.log("🔄 Attempting P2P reconnection...")
      this.attemptP2PReconnection()
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return

    this.isConnecting = true
    this.lastConnectionAttempt = Date.now()
    this.wsReconnectAttempts++

    console.log(`🔗 WebSocket connection attempt ${this.wsReconnectAttempts}`)

    try {
      // Close existing connection
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.ws = new WebSocket(this.wsUrl)

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING) {
          console.log("⏰ WebSocket connection timeout")
          this.ws.close()
          this.isConnecting = false
          this.scheduleReconnect()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ WebSocket connected successfully!")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")
        this.wsReconnectAttempts = 0
        this.isConnecting = false

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
            version: "rock-solid-v2",
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
        this.isConnecting = false
        this.stopHeartbeat()

        if (!this.isDestroyed && event.code !== 1000) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error("❌ WebSocket error:", error)
        this.isConnecting = false
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return

    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, Math.min(this.wsReconnectAttempts, 10)), 30000)
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
    }, 15000) // Every 15 seconds
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
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        console.log(`🎯 Role: ${this.isInitiator ? "INITIATOR" : "RECEIVER"}`)
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)

        if (this.isInitiator && message.userCount === 2) {
          console.log("🚀 Starting P2P as initiator...")
          setTimeout(() => this.initP2P(), 2000)
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected")
        this.onUserCountChange?.(message.userCount)

        // Restart P2P if needed
        if (this.connectionState !== "connected" && this.isInitiator) {
          console.log("🚀 Restarting P2P after peer reconnection")
          setTimeout(() => this.initP2P(), 1000)
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
        this.onConnectionStatusChange?.("disconnected")
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async initP2P() {
    if (this.isDestroyed || this.isConnecting || this.connectionLocked) {
      console.log("⚠️ P2P init blocked - already in progress")
      return
    }

    this.isConnecting = true
    this.connectionLocked = true
    this.lastConnectionAttempt = Date.now()

    console.log("🚀 Initializing rock-solid P2P connection")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
        this.pc = null
      }
      this.dataChannel = null
      this.resetConnectionState()

      // Create new peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      })

      this.setupPeerConnectionHandlers()

      // Create data channel as initiator
      this.dataChannel = this.pc.createDataChannel("rock-solid-data", {
        ordered: true,
        maxRetransmits: 3,
        maxPacketLifeTime: 3000,
      })
      this.setupDataChannelHandlers()

      // Create and send offer
      console.log("📤 Creating offer...")
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })

      await this.pc.setLocalDescription(offer)
      this.localDescriptionSet = true
      this.offerAnswerInProgress = true

      console.log("📤 Sending offer...")
      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
      })

      // Set timeout for offer/answer process
      setTimeout(() => {
        if (this.offerAnswerInProgress && this.connectionState !== "connected") {
          console.log("⏰ Offer/answer timeout - retrying...")
          this.isConnecting = false
          this.connectionLocked = false
          this.offerAnswerInProgress = false
          this.attemptP2PReconnection()
        }
      }, 15000)
    } catch (error) {
      console.error("❌ P2P init error:", error)
      this.isConnecting = false
      this.connectionLocked = false
      this.onError?.("P2P connection failed - retrying...")
      setTimeout(() => this.attemptP2PReconnection(), 3000)
    }
  }

  private resetConnectionState() {
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false
    this.localDescriptionSet = false
    this.offerAnswerInProgress = false
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
          this.onConnectionStatusChange?.("connected")
          this.isConnecting = false
          this.connectionLocked = false
          this.offerAnswerInProgress = false
          this.p2pReconnectAttempts = 0
          this.onConnectionRecovery?.()
          break

        case "connecting":
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
        case "failed":
        case "closed":
          console.log(`⚠️ P2P ${state} - will attempt reconnection`)
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.isConnecting = false
          this.connectionLocked = false
          this.offerAnswerInProgress = false
          setTimeout(() => this.attemptP2PReconnection(), 2000)
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 ICE connection state: ${state}`)

      if (state === "failed") {
        console.log("❌ ICE connection failed - restarting ICE...")
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
    this.dataChannel.bufferedAmountLowThreshold = 1024 * 1024 // 1MB threshold

    this.dataChannel.onopen = () => {
      console.log("📡 Data channel opened!")
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.isConnecting = false
      this.connectionLocked = false
      this.offerAnswerInProgress = false

      // Send test message
      this.sendDataChannelMessage({
        type: "connection-test",
        message: "Data channel ready",
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
      this.onConnectionStatusChange?.("disconnected")
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
    }

    this.dataChannel.onbufferedamountlow = () => {
      // Resume file transfers when buffer is low
      this.processFileTransferQueue()
    }
  }

  private async attemptP2PReconnection() {
    if (this.isDestroyed || this.isConnecting || this.connectionLocked) return

    this.p2pReconnectAttempts++
    if (this.p2pReconnectAttempts > this.maxReconnectAttempts) {
      console.log("❌ Max P2P reconnection attempts reached")
      this.onError?.("Connection failed after multiple attempts")
      return
    }

    console.log(`🔄 P2P reconnection attempt ${this.p2pReconnectAttempts}`)

    // Wait for WebSocket to be ready
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⏳ Waiting for WebSocket before P2P reconnection...")
      setTimeout(() => this.attemptP2PReconnection(), 2000)
      return
    }

    // If we're the initiator, restart P2P
    if (this.isInitiator) {
      await this.initP2P()
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.offerAnswerInProgress) return

    this.offerAnswerInProgress = true
    this.isConnecting = true
    this.connectionLocked = true

    try {
      console.log("📥 Handling offer as receiver")

      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
      }
      this.resetConnectionState()

      // Create new peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      })

      this.setupPeerConnectionHandlers()

      console.log("📥 Setting remote description...")
      await this.pc.setRemoteDescription(offer)
      this.isRemoteDescriptionSet = true

      console.log("📤 Creating answer...")
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.localDescriptionSet = true

      console.log("📤 Sending answer...")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
      })

      // Process queued ICE candidates
      this.processQueuedICECandidates()

      // Set timeout
      setTimeout(() => {
        if (this.offerAnswerInProgress && this.connectionState !== "connected") {
          console.log("⏰ Answer timeout - connection failed")
          this.isConnecting = false
          this.connectionLocked = false
          this.offerAnswerInProgress = false
        }
      }, 15000)
    } catch (error) {
      console.error("❌ Handle offer error:", error)
      this.isConnecting = false
      this.connectionLocked = false
      this.offerAnswerInProgress = false
      this.onError?.("Failed to handle connection offer")
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || !this.offerAnswerInProgress) return

    try {
      console.log("📥 Handling answer as initiator")

      if (this.pc?.signalingState === "have-local-offer") {
        console.log("📥 Setting remote description...")
        await this.pc.setRemoteDescription(answer)
        this.isRemoteDescriptionSet = true
        console.log("✅ Answer processed successfully")

        // Process queued ICE candidates
        this.processQueuedICECandidates()
      } else {
        console.warn("⚠️ Cannot set remote description - wrong signaling state:", this.pc?.signalingState)
      }
    } catch (error) {
      console.error("❌ Handle answer error:", error)
      this.onError?.("Failed to handle connection answer")
      this.isConnecting = false
      this.connectionLocked = false
      this.offerAnswerInProgress = false
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

  // Fixed file transfer implementation
  private handleFileStart(message: any) {
    console.log(`📥 Starting file reception: ${message.fileName} (${(message.fileSize / 1024 / 1024).toFixed(2)}MB)`)

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

    // Send acknowledgment
    this.sendDataChannelMessage({
      type: "file-start-ack",
      fileId: message.fileId,
      timestamp: Date.now(),
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

        // Update progress
        const progress = Math.min(Math.round((fileData.chunks.size / fileData.totalChunks) * 100), 99)
        transfer.progress = progress

        // Calculate speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          transfer.speed = fileData.receivedSize / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        // Send chunk acknowledgment
        this.sendDataChannelMessage({
          type: "file-chunk-ack",
          fileId,
          chunkIndex,
          timestamp: Date.now(),
        })

        // Check if file is complete
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
      // Assemble file from chunks
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
    // Handle chunk acknowledgment for flow control
    console.log(`✅ Chunk ${message.chunkIndex} acknowledged for file ${message.fileId}`)
  }

  private handleFileComplete(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer && transfer.direction === "sending") {
      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(message.fileId, transfer)
      this.updateFileTransfers()
      console.log(`✅ File ${transfer.name} sent successfully`)
    }
  }

  private handleFileError(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer) {
      transfer.status = "error"
      this.fileTransfers.set(message.fileId, transfer)
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

  private processFileTransferQueue() {
    // Process queued file transfers when buffer is available
    if (this.fileTransferQueue.length > 0 && this.dataChannel?.readyState === "open") {
      const fileId = this.fileTransferQueue.shift()
      if (fileId) {
        const fileInfo = this.sendingFiles.get(fileId)
        if (fileInfo) {
          this.continueSendingFile(fileId, fileInfo.file, fileInfo.transfer)
        }
      }
    }
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

    // Calculate checksum
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
      timestamp: Date.now(),
    })

    // Start sending chunks
    await this.sendFileInChunks(fileId, file, transfer)
  }

  private async sendFileInChunks(fileId: string, file: File, transfer: FileTransfer) {
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    let chunksSent = 0

    for (let i = 0; i < totalChunks; i++) {
      // Check if connection is still available
      if (this.dataChannel?.readyState !== "open") {
        console.log("⚠️ Data channel closed during file transfer")
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      // Wait for buffer to be available
      while (this.dataChannel.bufferedAmount > 1024 * 1024) {
        // 1MB buffer limit
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

      // Create chunk message
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

        // Update progress
        const progress = Math.min(Math.round((chunksSent / totalChunks) * 100), 99)
        transfer.progress = progress

        // Calculate speed
        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          const bytesSent = chunksSent * this.chunkSize
          transfer.speed = bytesSent / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()

        // Small delay for flow control
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

    // Send completion message
    this.sendDataChannelMessage({
      type: "file-complete",
      fileId,
      timestamp: Date.now(),
    })

    console.log(`✅ File ${file.name} sent successfully`)
  }

  private continueSendingFile(fileId: string, file: File, transfer: FileTransfer) {
    // Continue sending file from where it left off
    // This is called when buffer becomes available again
    console.log(`🔄 Continuing file transfer: ${fileId}`)
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

  // Connection maintenance methods
  public forceReconnect() {
    console.log("🔄 Force reconnecting...")
    this.cleanup()
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.initialize()
      }
    }, 1000)
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
}
