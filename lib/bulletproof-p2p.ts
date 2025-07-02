// Enhanced Bulletproof P2P with Stable P2P Connection

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

  // State management
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"

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

  // File and chat management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<
    string,
    { chunks: Map<number, ArrayBuffer>; totalSize: number; fileName: string; fileType: string }
  > = new Map()

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private p2pTimeoutTimer: NodeJS.Timeout | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null

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

    console.log("🚀 Enhanced Bulletproof P2P System initialized")
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting enhanced bulletproof connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"

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
    const timers = [this.heartbeatTimer, this.reconnectTimer, this.p2pTimeoutTimer, this.connectionMonitorTimer]

    timers.forEach((timer) => {
      if (timer) {
        clearInterval(timer)
        clearTimeout(timer)
      }
    })

    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.p2pTimeoutTimer = null
    this.connectionMonitorTimer = null

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

    // Clear queues
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false
  }

  private startConnectionMonitoring() {
    // Monitor connection health every 10 seconds
    this.connectionMonitorTimer = setInterval(() => {
      if (this.isDestroyed) return

      // Check WebSocket health
      if (this.ws?.readyState !== WebSocket.OPEN && this.signalingState === "connected") {
        console.log("🔧 WebSocket connection lost, reconnecting...")
        this.signalingState = "disconnected"
        this.onSignalingStatusChange?.("disconnected")
        this.connectWebSocket()
      }

      // Check P2P health
      if (this.pc?.connectionState === "failed" || this.pc?.connectionState === "disconnected") {
        console.log("🔧 P2P connection lost, attempting recovery...")
        this.connectionState = "disconnected"
        this.onConnectionStatusChange?.("disconnected")

        // Attempt P2P recovery if we have 2 users
        setTimeout(() => {
          if (this.isInitiator && this.signalingState === "connected") {
            this.initP2P()
          }
        }, 3000)
      }
    }, 10000)
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws?.readyState === WebSocket.OPEN) return

    console.log(`🔗 Connecting to ${this.wsUrl}`)

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
          this.scheduleReconnect()
        }
      }, 10000)

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log("✅ WebSocket connected")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")

        // Send join message
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          clientInfo: {
            browser: this.getBrowserInfo(),
            isMobile: this.isMobile(),
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

    console.log("🔄 Scheduling reconnect in 3 seconds...")
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectWebSocket()
    }, 3000)
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
    }, 30000)
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
          // Wait a bit for both clients to be ready
          setTimeout(() => this.initP2P(), 2000)
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
    if (this.isDestroyed || this.pc) {
      console.log("⚠️ P2P already exists or destroyed")
      return
    }

    console.log("🚀 Initializing P2P connection as initiator")
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
        ],
        iceCandidatePoolSize: 10,
      })

      this.setupPeerConnectionHandlers()

      // Create data channel as initiator
      this.dataChannel = this.pc.createDataChannel("bulletproof-data", {
        ordered: true,
        maxRetransmits: 3,
      })
      this.setupDataChannelHandlers()

      // Set P2P timeout
      this.p2pTimeoutTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          console.log("⏰ P2P connection timeout, retrying...")
          this.retryP2PConnection()
        }
      }, 30000) // 30 second timeout

      // Create and send offer
      console.log("📤 Creating offer...")
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })

      await this.pc.setLocalDescription(offer)
      console.log("📤 Sending offer...")

      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error("❌ P2P init error:", error)
      this.onError?.("Failed to initialize P2P connection")
      this.retryP2PConnection()
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
          this.onConnectionStatusChange?.("connected")
          this.clearP2PTimeout()
          break

        case "connecting":
          console.log("🔄 P2P connecting...")
          this.connectionState = "connecting"
          this.onConnectionStatusChange?.("connecting")
          break

        case "disconnected":
          console.log("⚠️ P2P disconnected")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          break

        case "failed":
          console.log("❌ P2P connection failed")
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
          this.retryP2PConnection()
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

      if (state === "failed") {
        console.log("❌ ICE connection failed, restarting ICE...")
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
      this.clearP2PTimeout()

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
  }

  private clearP2PTimeout() {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer)
      this.p2pTimeoutTimer = null
    }
  }

  private retryP2PConnection() {
    console.log("🔄 Retrying P2P connection...")

    this.clearP2PTimeout()

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.dataChannel = null
    this.iceCandidateQueue = []
    this.isRemoteDescriptionSet = false

    // Retry after 3 seconds
    setTimeout(() => {
      if (this.isInitiator && !this.isDestroyed) {
        this.initP2P()
      }
    }, 3000)
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed) return

    try {
      console.log("📥 Handling offer as receiver")

      // Create peer connection if not exists
      if (!this.pc) {
        this.pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
          ],
          iceCandidatePoolSize: 10,
        })

        this.setupPeerConnectionHandlers()
      }

      console.log("📥 Setting remote description...")
      await this.pc.setRemoteDescription(offer)
      this.isRemoteDescriptionSet = true

      console.log("📤 Creating answer...")
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

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
      this.onError?.("Failed to handle connection offer")
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
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

      case "file-end":
        this.handleFileEnd(message.fileId)
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
    console.log(`📥 File reception complete: ${fileId}`)

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

        console.log(`✅ File ${fileData.fileName} downloaded successfully`)
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
      this.onError?.("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting file transfer: ${files.length} files`)

    for (const file of files) {
      await this.sendFile(file)
    }
  }

  private async sendFile(file: File) {
    const fileId = Math.random().toString(36).substring(2, 15)
    const chunkSize = 64 * 1024 // 64KB chunks

    console.log(`📤 Sending file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`)

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
    })

    transfer.status = "completed"
    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()

    console.log(`✅ File ${file.name} sent successfully`)
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Data channel not ready for chat")
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
  public maintainConnection() {
    // Send keep-alive through WebSocket
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: "keep-alive",
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now(),
      })
    }

    // Send keep-alive through data channel
    if (this.dataChannel?.readyState === "open") {
      this.sendDataChannelMessage({
        type: "keep-alive",
        timestamp: Date.now(),
      })
    }
  }

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
