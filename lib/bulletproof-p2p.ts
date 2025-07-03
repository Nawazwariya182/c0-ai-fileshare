// Simple Bulletproof P2P - Guaranteed to Connect

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
  lastChunkTime: number
  cancelled?: boolean
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  // Simple connection state
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private isInitiator = false
  private isDestroyed = false

  // Connection status
  private wsConnected = false
  private p2pConnected = false
  private userCount = 0
  private connecting = false

  // URLs and reconnection
  private wsUrls: string[] = []
  private currentUrlIndex = 0
  private reconnectAttempts = 0

  // File transfers
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<string, FileChunkData> = new Map()
  private chunkSize = 64 * 1024

  // ICE candidates
  private iceCandidates: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false

  // Timers
  private heartbeatTimer: NodeJS.Timeout | null = null
  private connectionTimer: NodeJS.Timeout | null = null

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
    this.setupUrls()
    console.log("🚀 Simple Bulletproof P2P initialized")
  }

  private setupUrls() {
    this.wsUrls = []
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    if (process.env.NODE_ENV === "production") {
      this.wsUrls.push("wss://signaling-server-1ckx.onrender.com")
    } else {
      this.wsUrls.push("ws://localhost:8080")
    }

    console.log("🌐 WebSocket URLs:", this.wsUrls)
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Initializing connection...")
    this.onConnectionStatusChange?.("connecting")
    this.onSignalingStatusChange?.("connecting")

    await this.connectWebSocket()
    this.startConnectionMonitor()
  }

  public destroy() {
    console.log("🛑 Destroying P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.connectionTimer) clearInterval(this.connectionTimer)

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

    this.wsConnected = false
    this.p2pConnected = false
    this.connecting = false
  }

  private startConnectionMonitor() {
    this.connectionTimer = setInterval(() => {
      if (this.isDestroyed) return

      // Check WebSocket
      if (!this.wsConnected && !this.ws) {
        this.connectWebSocket()
      }

      // Check P2P
      if (this.wsConnected && this.userCount === 2 && !this.p2pConnected && !this.connecting) {
        console.log("🔄 Need P2P connection")
        this.startP2P()
      }

      // Update UI
      this.updateConnectionStatus()
    }, 3000)
  }

  private updateConnectionStatus() {
    // Update signaling status
    const signalingStatus = this.wsConnected ? "connected" : "disconnected"
    this.onSignalingStatusChange?.(signalingStatus)

    // Update P2P status
    let p2pStatus: "connecting" | "connected" | "disconnected"
    if (this.p2pConnected) {
      p2pStatus = "connected"
    } else if (this.connecting || (this.wsConnected && this.userCount === 2)) {
      p2pStatus = "connecting"
    } else {
      p2pStatus = "disconnected"
    }
    this.onConnectionStatusChange?.(p2pStatus)

    // Update quality
    this.onConnectionQualityChange?.(this.p2pConnected ? "excellent" : "poor")
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws) return

    this.reconnectAttempts++
    if (this.reconnectAttempts > 3) {
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length
      this.reconnectAttempts = 1
    }

    const url = this.wsUrls[this.currentUrlIndex]
    console.log(`🔗 Connecting to ${url}`)

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected")
        this.wsConnected = true
        this.reconnectAttempts = 0

        // Join session
        this.send({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          clientInfo: {
            browser: navigator.userAgent.includes("Chrome") ? "Chrome" : "Other",
            isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
          },
        })

        this.startHeartbeat()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error("❌ Message error:", error)
        }
      }

      this.ws.onclose = () => {
        console.log("🔌 WebSocket closed")
        this.wsConnected = false
        this.ws = null
        this.stopHeartbeat()

        if (!this.isDestroyed) {
          setTimeout(() => this.connectWebSocket(), 2000)
        }
      }

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
        this.wsConnected = false
        this.ws = null
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      setTimeout(() => this.connectWebSocket(), 2000)
    }
  }

  private send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "ping", timestamp: Date.now() })
      }
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private handleMessage(message: any) {
    console.log(`📨 Received: ${message.type}`)

    switch (message.type) {
      case "joined":
        this.userCount = message.userCount
        this.isInitiator = message.isInitiator
        this.onUserCountChange?.(message.userCount)
        console.log(`👤 Joined as ${this.isInitiator ? "INITIATOR" : "RECEIVER"} (${message.userCount}/2)`)
        break

      case "user-joined":
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        console.log(`👤 User joined (${message.userCount}/2)`)
        break

      case "start-p2p":
        console.log("🚀 Starting P2P connection")
        this.startP2P()
        break

      case "offer":
        console.log("📥 Received offer")
        this.handleOffer(message.offer)
        break

      case "answer":
        console.log("📥 Received answer")
        this.handleAnswer(message.answer)
        break

      case "ice-candidate":
        console.log("📥 Received ICE candidate")
        this.handleIceCandidate(message.candidate)
        break

      case "user-left":
        this.userCount = message.userCount
        this.onUserCountChange?.(message.userCount)
        this.p2pConnected = false
        console.log("👋 User left")
        break
    }
  }

  private async startP2P() {
    if (this.connecting || this.p2pConnected || this.userCount !== 2) {
      console.log("⚠️ P2P start blocked")
      return
    }

    console.log("🚀 Starting P2P connection")
    this.connecting = true

    try {
      // Clean up existing connection
      if (this.pc) {
        this.pc.close()
      }

      // Create new peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      })

      // Set up handlers
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("📤 Sending ICE candidate")
          this.send({
            type: "ice-candidate",
            sessionId: this.sessionId,
            candidate: event.candidate,
          })
        }
      }

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log(`🔄 P2P state: ${state}`)

        if (state === "connected") {
          console.log("✅ P2P connected!")
          this.p2pConnected = true
          this.connecting = false
          this.onConnectionRecovery?.()
        } else if (state === "failed" || state === "disconnected") {
          console.log("❌ P2P failed/disconnected")
          this.p2pConnected = false
          this.connecting = false
          setTimeout(() => this.startP2P(), 3000)
        }
      }

      this.pc.ondatachannel = (event) => {
        console.log("📡 Received data channel")
        this.dataChannel = event.channel
        this.setupDataChannel()
      }

      if (this.isInitiator) {
        // Create data channel
        this.dataChannel = this.pc.createDataChannel("data", { ordered: true })
        this.setupDataChannel()

        // Create offer
        const offer = await this.pc.createOffer()
        await this.pc.setLocalDescription(offer)

        console.log("📤 Sending offer")
        this.send({
          type: "offer",
          sessionId: this.sessionId,
          offer: offer,
        })
      }

      // Process any queued ICE candidates
      this.processIceCandidates()
    } catch (error) {
      console.error("❌ P2P start error:", error)
      this.connecting = false
      this.onError?.("Failed to start P2P connection")
      setTimeout(() => this.startP2P(), 3000)
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return

    this.dataChannel.binaryType = "arraybuffer"

    this.dataChannel.onopen = () => {
      console.log("📡 Data channel opened!")
      this.p2pConnected = true
      this.connecting = false

      // Send test message
      this.sendDataMessage({
        type: "test",
        message: "Connection established",
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
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.connecting) return

    console.log("📥 Handling offer")
    this.connecting = true

    try {
      if (this.pc) {
        this.pc.close()
      }

      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      })

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("📤 Sending ICE candidate")
          this.send({
            type: "ice-candidate",
            sessionId: this.sessionId,
            candidate: event.candidate,
          })
        }
      }

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log(`🔄 P2P state: ${state}`)

        if (state === "connected") {
          console.log("✅ P2P connected!")
          this.p2pConnected = true
          this.connecting = false
          this.onConnectionRecovery?.()
        } else if (state === "failed" || state === "disconnected") {
          console.log("❌ P2P failed/disconnected")
          this.p2pConnected = false
          this.connecting = false
        }
      }

      this.pc.ondatachannel = (event) => {
        console.log("📡 Received data channel")
        this.dataChannel = event.channel
        this.setupDataChannel()
      }

      // Set remote description
      await this.pc.setRemoteDescription(offer)
      this.remoteDescriptionSet = true

      // Create answer
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      console.log("📤 Sending answer")
      this.send({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
      })

      // Process ICE candidates
      this.processIceCandidates()
    } catch (error) {
      console.error("❌ Handle offer error:", error)
      this.connecting = false
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling answer")
      if (this.pc && this.pc.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
        this.remoteDescriptionSet = true
        console.log("✅ Answer processed")
        this.processIceCandidates()
      }
    } catch (error) {
      console.error("❌ Handle answer error:", error)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.pc && this.remoteDescriptionSet) {
      try {
        await this.pc.addIceCandidate(candidate)
        console.log("✅ ICE candidate added")
      } catch (error) {
        console.error("❌ ICE candidate error:", error)
      }
    } else {
      console.log("⏳ Queuing ICE candidate")
      this.iceCandidates.push(candidate)
    }
  }

  private async processIceCandidates() {
    if (!this.pc || !this.remoteDescriptionSet) return

    console.log(`🧊 Processing ${this.iceCandidates.length} ICE candidates`)
    for (const candidate of this.iceCandidates) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch (error) {
        console.error("❌ Error processing ICE candidate:", error)
      }
    }
    this.iceCandidates = []
  }

  private sendDataMessage(message: any) {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(message))
    }
  }

  private handleDataMessage(message: any) {
    switch (message.type) {
      case "test":
        console.log("📨 Test message received")
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

  // File transfer methods (simplified)
  private handleFileStart(message: any) {
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
        if (!chunk) throw new Error(`Missing chunk ${i}`)
        orderedChunks.push(chunk)
      }

      const blob = new Blob(orderedChunks, { type: fileData.fileType })
      this.downloadFile(blob, fileData.fileName)

      transfer.status = "completed"
      transfer.progress = 100
      this.fileTransfers.set(fileId, transfer)
      this.receivedChunks.delete(fileId)
      this.updateFileTransfers()
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
    }
  }

  private handleFileCancel(message: any) {
    const transfer = this.fileTransfers.get(message.fileId)
    if (transfer) {
      transfer.status = "cancelled"
      transfer.cancelled = true
      this.fileTransfers.set(message.fileId, transfer)
      this.receivedChunks.delete(message.fileId)
      this.updateFileTransfers()
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
    this.sendDataMessage({
      type: "file-start",
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    })

    // Send chunks
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    for (let i = 0; i < totalChunks; i++) {
      if (this.dataChannel?.readyState !== "open") break

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

      this.dataChannel.send(message)

      // Update progress
      const progress = Math.round(((i + 1) / totalChunks) * 100)
      transfer.progress = Math.min(progress, 99)
      if (transfer.startTime) {
        const elapsed = (Date.now() - transfer.startTime) / 1000
        transfer.speed = ((i + 1) * this.chunkSize) / elapsed
      }
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 1))
    }

    // Send completion
    this.sendDataMessage({
      type: "file-complete",
      fileId,
    })
  }

  public cancelFileTransfer(transferId: string) {
    const transfer = this.fileTransfers.get(transferId)
    if (!transfer) return

    transfer.status = "cancelled"
    transfer.cancelled = true
    this.fileTransfers.set(transferId, transfer)

    if (this.dataChannel?.readyState === "open") {
      this.sendDataMessage({
        type: "file-cancel",
        fileId: transferId,
      })
    }

    this.receivedChunks.delete(transferId)
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

    this.sendDataMessage({
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
    return this.p2pConnected ? "connected" : this.connecting ? "connecting" : "disconnected"
  }

  public getSignalingState() {
    return this.wsConnected ? "connected" : "disconnected"
  }

  public isDataChannelOpen() {
    return this.dataChannel?.readyState === "open"
  }
}
