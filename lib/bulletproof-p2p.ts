// Bulletproof P2P Connection System - Simplified & Ultra-Reliable

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

  // Simplified connection state
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

  // Simplified ICE handling
  private iceCandidateQueue: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false
  private localDescriptionSet = false
  private p2pAttempting = false

  // Reconnection management
  private wsReconnectAttempts = 0
  private p2pReconnectAttempts = 0
  private maxP2PAttempts = 10
  private reconnectDelay = 2000
  private lastP2PAttempt = 0

  // File transfer management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private chunkSize = 16 * 100 // 16KB chunks

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
    this.initializeUrls()
    console.log("🚀 Bulletproof P2P System initialized - Simplified & Ultra-Reliable")
  }

  private initializeUrls() {
    this.wsUrls = []

    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push("wss://signaling-server-1ckx.onrender.com", "wss://p2p-signaling-backup.herokuapp.com")
    } else {
      this.wsUrls.push("ws://localhost:8080", "ws://127.0.0.1:8080")
    }

    this.wsUrls = [...new Set(this.wsUrls)]
    console.log("🌐 Signaling URLs:", this.wsUrls)
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting bulletproof connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"
    this.onConnectionStatusChange?.("connecting")
    this.onSignalingStatusChange?.("connecting")

    await this.connectWebSocket()
    this.startConnectionMonitoring()
  }

  public destroy() {
    console.log("🛑 Destroying bulletproof P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear all timers
    ;[this.heartbeatTimer, this.reconnectTimer, this.connectionMonitorTimer, this.p2pTimeoutTimer].forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.connectionMonitorTimer = null
    this.p2pTimeoutTimer = null

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
    this.iceCandidateQueue = []
    this.remoteDescriptionSet = false
    this.localDescriptionSet = false
    this.p2pAttempting = false
  }

  private startConnectionMonitoring() {
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      this.checkConnectionHealth()
      this.attemptReconnectionIfNeeded()
    }, 3000) // Every 3 seconds
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
      this.onConnectionStatusChange?.("connected")
      this.p2pReconnectAttempts = 0
      this.p2pAttempting = false
      this.onConnectionRecovery?.()
      console.log("✅ P2P connection established!")
    } else if ((!p2pHealthy || !dataChannelHealthy) && this.connectionState === "connected") {
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
      console.log("⚠️ P2P connection lost")
    }
  }

  private attemptReconnectionIfNeeded() {
    const now = Date.now()

    // WebSocket reconnection
    if (this.ws?.readyState !== WebSocket.OPEN && !this.reconnectTimer) {
      this.connectWebSocket()
    }

    // P2P reconnection - simplified logic
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.userCount === 2 &&
      this.pc?.connectionState !== "connected" &&
      !this.p2pAttempting &&
      now - this.lastP2PAttempt > this.reconnectDelay
    ) {
      console.log("🔄 Attempting P2P reconnection...")
      this.attemptP2PConnection()
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws?.readyState === WebSocket.OPEN) return

    this.wsReconnectAttempts++

    // Try next URL after 3 failed attempts
    if (this.wsReconnectAttempts > 3) {
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      this.wsReconnectAttempts = 1
    }

    const wsUrl = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 WebSocket attempt ${this.wsReconnectAttempts} to ${wsUrl}`)

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
          this.scheduleReconnect()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ WebSocket connected!")
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
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobile(),
            version: "bulletproof-v4",
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
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return

    const delay = Math.min(this.reconnectDelay * Math.pow(1.2, Math.min(this.wsReconnectAttempts, 8)), 20000)
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
    console.log(`📨 Received: ${message.type}`)

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

        // Start P2P when both users are present
        if (message.userCount === 2 && !this.p2pAttempting) {
          console.log("🚀 Both users present - starting P2P...")
          setTimeout(() => this.attemptP2PConnection(), 3000) // 3 second delay
        }
        break

      case "user-reconnected":
        console.log("🔄 Peer reconnected")
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)

        if (message.userCount === 2 && this.connectionState !== "connected" && !this.p2pAttempting) {
          setTimeout(() => this.attemptP2PConnection(), 2000)
        }
        break

      case "pong":
        // Heartbeat response
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
        this.connectionState = "disconnected"
        this.onConnectionStatusChange?.("disconnected")
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async attemptP2PConnection() {
    if (this.isDestroyed || this.p2pAttempting) {
      console.log("⚠️ P2P attempt blocked")
      return
    }

    this.p2pReconnectAttempts++
    if (this.p2pReconnectAttempts > this.maxP2PAttempts) {
      console.log("❌ Max P2P attempts reached")
      this.onError?.("P2P connection failed after multiple attempts")
      return
    }

    this.p2pAttempting = true
    this.lastP2PAttempt = Date.now()
    console.log(`🚀 P2P attempt ${this.p2pReconnectAttempts}`)

    // Wait for WebSocket
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log("⏳ Waiting for WebSocket...")
      this.p2pAttempting = false
      return
    }

    // Only initiator creates offer
    if (this.isInitiator) {
      await this.createOffer()
    } else {
      console.log("⏳ Waiting for offer as receiver...")
      this.p2pAttempting = false
    }
  }

  private async createOffer() {
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

      // Create peer connection with simple config
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
        ],
        iceCandidatePoolSize: 5,
      })

      this.setupPeerConnectionHandlers()

      // Create data channel
      this.dataChannel = this.pc.createDataChannel("bulletproof-data", {
        ordered: true,
      })
      this.setupDataChannelHandlers()

      // Set timeout
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ P2P timeout")
          this.p2pAttempting = false
          this.onError?.("P2P connection timeout - retrying...")
          setTimeout(() => this.attemptP2PConnection(), 5000)
        }
      }, 30000) // 30 second timeout

      // Create offer
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      this.localDescriptionSet = true

      console.log("📤 Sending offer...")
      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error("❌ Create offer error:", error)
      this.p2pAttempting = false
      this.onError?.("Failed to create P2P offer - retrying...")
      setTimeout(() => this.attemptP2PConnection(), 5000)
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
        console.log(`📤 Sending ICE candidate`)
        this.sendMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          timestamp: Date.now(),
        })
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔄 P2P state: ${state}`)

      switch (state) {
        case "connected":
          console.log("✅ P2P connected!")
          this.connectionState = "connected"
          this.onConnectionStatusChange?.("connected")
          this.p2pReconnectAttempts = 0
          this.p2pAttempting = false
          this.clearP2PTimeout()
          this.onConnectionRecovery?.()
          break

        case "connecting":
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
        case "failed":
          console.log(`⚠️ P2P ${state}`)
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.p2pAttempting = false
          this.clearP2PTimeout()
          setTimeout(() => this.attemptP2PConnection(), 5000)
          break

        case "closed":
          console.log("🔌 P2P closed")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.p2pAttempting = false
          this.clearP2PTimeout()
          break
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log(`🧊 ICE state: ${state}`)

      if (state === "failed") {
        console.log("❌ ICE failed - restarting...")
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
      console.log("📡 Data channel opened!")
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
      this.p2pAttempting = false
      this.clearP2PTimeout()

      // Send test message
      this.sendDataChannelMessage({
        type: "connection-test",
        message: "Bulletproof connection ready",
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
      this.connectionState = "disconnected"
      this.onConnectionStatusChange?.("disconnected")
    }

    this.dataChannel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
    }
  }

  private clearP2PTimeout() {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer)
      this.p2pTimeoutTimer = null
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed || this.p2pAttempting) {
      console.log("⚠️ Ignoring offer - busy")
      return
    }

    this.p2pAttempting = true
    console.log("📥 Handling offer")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      // Clean up
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
        ],
        iceCandidatePoolSize: 5,
      })

      this.setupPeerConnectionHandlers()

      // Set timeout
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ Answer timeout")
          this.p2pAttempting = false
          this.onError?.("P2P answer timeout")
        }
      }, 30000)

      // Set remote description
      await this.pc.setRemoteDescription(offer)
      this.remoteDescriptionSet = true

      // Create answer
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.localDescriptionSet = true

      // Send answer
      console.log("📤 Sending answer...")
      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
        timestamp: Date.now(),
      })

      // Process queued ICE candidates
      this.processQueuedICECandidates()
    } catch (error) {
      console.error("❌ Handle offer error:", error)
      this.p2pAttempting = false
      this.onError?.("Failed to handle offer")
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
        console.warn("⚠️ Wrong signaling state:", this.pc.signalingState)
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
          message: "Bulletproof connection confirmed",
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
    }
  }

  // Simplified file transfer methods
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
    if (transfer && transfer.direction === "sending") {
      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(message.fileId, transfer)
      this.updateFileTransfers()
      console.log(`✅ File ${transfer.name} sent`)
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

    // Send chunks
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    for (let i = 0; i < totalChunks; i++) {
      if (this.dataChannel?.readyState !== "open") {
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }

      // Wait for buffer
      while (this.dataChannel.bufferedAmount > 256 * 100) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()

      // Create message
      const fileIdBytes = new TextEncoder().encode(fileId)
      const message = new ArrayBuffer(8 + fileIdBytes.length + arrayBuffer.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, i)
      new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 8 + fileIdBytes.length).set(new Uint8Array(arrayBuffer))

      try {
        this.dataChannel.send(message)

        // Update progress
        const progress = Math.round(((i + 1) / totalChunks) * 100)
        transfer.progress = Math.min(progress, 99)

        if (transfer.startTime) {
          const elapsed = (Date.now() - transfer.startTime) / 1000
          const bytesSent = (i + 1) * this.chunkSize
          transfer.speed = bytesSent / elapsed
        }

        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
      } catch (error) {
        console.error("❌ Send chunk error:", error)
        transfer.status = "error"
        this.fileTransfers.set(fileId, transfer)
        this.updateFileTransfers()
        return
      }
    }

    // Send completion
    this.sendDataChannelMessage({
      type: "file-complete",
      fileId,
      timestamp: Date.now(),
    })

    console.log(`✅ File ${file.name} sent`)
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
