interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "transferring" | "completed" | "error"
  direction: "sending" | "receiving"
  speed?: number
  file?: File
  chunks?: ArrayBuffer[]
  totalChunks?: number
  receivedChunks?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

export class BulletproofP2P {
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private sessionId: string
  private userId: string
  private isInitiator = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private fileTransfers = new Map<string, FileTransfer>()
  private pendingICECandidates: RTCIceCandidate[] = []
  private connectionStartTime = 0
  private lastSpeedUpdate = 0
  private bytesTransferred = 0
  private chunkSize = 64 * 1024 // 64KB chunks
  private maxConcurrentTransfers = 3

  // Event handlers
  public onConnectionStatusChange?: (status: "connecting" | "connected" | "disconnected") => void
  public onSignalingStatusChange?: (status: "connecting" | "connected" | "disconnected") => void
  public onUserCountChange?: (count: number) => void
  public onError?: (error: string) => void
  public onConnectionQualityChange?: (quality: "excellent" | "good" | "poor") => void
  public onSpeedUpdate?: (speed: number) => void
  public onFileTransferUpdate?: (transfers: FileTransfer[]) => void
  public onChatMessage?: (message: ChatMessage) => void
  public onConnectionRecovery?: () => void

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    console.log(`🚀 BulletproofP2P initialized for session ${sessionId}`)
  }

  public async initialize() {
    try {
      await this.connectToSignalingServer()
    } catch (error) {
      console.error("❌ Failed to initialize P2P:", error)
      this.onError?.("Failed to initialize connection")
    }
  }

  private async connectToSignalingServer() {
    const wsUrl = process.env.NODE_ENV === 'production' 
      ? 'wss://bulletproof-signaling-server.onrender.com'
      : 'ws://localhost:8080'

    console.log(`🔗 Connecting to signaling server: ${wsUrl}`)
    this.onSignalingStatusChange?.("connecting")

    try {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log("✅ WebSocket connected")
        this.onSignalingStatusChange?.("connected")
        this.reconnectAttempts = 0
        this.joinSession()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error("❌ Failed to parse signaling message:", error)
        }
      }

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
        this.onSignalingStatusChange?.("disconnected")
        this.handleWebSocketClose()
      }

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
        this.onSignalingStatusChange?.("disconnected")
        this.onError?.("Signaling server connection failed")
      }

    } catch (error) {
      console.error("❌ WebSocket connection failed:", error)
      this.onSignalingStatusChange?.("disconnected")
      this.scheduleReconnect()
    }
  }

  private joinSession() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        type: "join",
        sessionId: this.sessionId,
        userId: this.userId,
        clientInfo: {
          isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
          browser: this.getBrowserInfo(),
          timestamp: Date.now()
        }
      }
      
      console.log("📤 Joining session:", message)
      this.ws.send(JSON.stringify(message))
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

  private async handleSignalingMessage(message: any) {
    console.log(`📨 Signaling message: ${message.type}`)

    switch (message.type) {
      case "joined":
        this.isInitiator = message.isInitiator
        this.onUserCountChange?.(message.userCount)
        console.log(`✅ Joined session as ${this.isInitiator ? 'initiator' : 'receiver'}`)
        break

      case "user-joined":
        this.onUserCountChange?.(message.userCount)
        if (message.readyForP2P) {
          console.log("🚀 Ready for P2P - starting connection")
          await this.startP2PConnection()
        }
        break

      case "p2p-ready":
        if (this.isInitiator) {
          console.log("🎯 Initiating P2P connection")
          await this.createOffer()
        }
        break

      case "offer":
        if (!this.isInitiator) {
          console.log("📥 Received offer")
          await this.handleOffer(message)
        }
        break

      case "answer":
        if (this.isInitiator) {
          console.log("📥 Received answer")
          await this.handleAnswer(message)
        }
        break

      case "ice-candidate":
        console.log("🧊 Received ICE candidate")
        await this.handleICECandidate(message)
        break

      case "error":
        console.error("❌ Signaling error:", message.message)
        this.onError?.(message.message)
        break

      case "user-left":
        this.onUserCountChange?.(message.userCount)
        if (!message.temporary) {
          this.onConnectionStatusChange?.("disconnected")
        }
        break
    }
  }

  private async startP2PConnection() {
    try {
      console.log("🔧 Setting up P2P connection")
      this.onConnectionStatusChange?.("connecting")
      
      // Create peer connection with STUN servers
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      })

      // Set up event handlers
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("🧊 Sending ICE candidate")
          this.sendSignalingMessage({
            type: "ice-candidate",
            candidate: event.candidate
          })
        }
      }

      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log(`🔗 P2P connection state: ${state}`)
        
        switch (state) {
          case "connected":
            this.onConnectionStatusChange?.("connected")
            this.onConnectionQualityChange?.("excellent")
            this.connectionStartTime = Date.now()
            this.onConnectionRecovery?.()
            break
          case "disconnected":
          case "failed":
            this.onConnectionStatusChange?.("disconnected")
            this.onConnectionQualityChange?.("poor")
            this.handleP2PDisconnection()
            break
          case "connecting":
            this.onConnectionStatusChange?.("connecting")
            break
        }
      }

      this.pc.ondatachannel = (event) => {
        console.log("📡 Data channel received")
        this.setupDataChannel(event.channel)
      }

      // Process any pending ICE candidates
      for (const candidate of this.pendingICECandidates) {
        await this.pc.addIceCandidate(candidate)
      }
      this.pendingICECandidates = []

    } catch (error) {
      console.error("❌ Failed to start P2P connection:", error)
      this.onError?.("Failed to establish P2P connection")
    }
  }

  private async createOffer() {
    if (!this.pc) return

    try {
      // Create data channel for file transfers and chat
      this.dataChannel = this.pc.createDataChannel("bulletproof", {
        ordered: true,
        maxRetransmits: 3
      })
      this.setupDataChannel(this.dataChannel)

      console.log("📤 Creating offer")
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "offer",
        offer: offer
      })
    } catch (error) {
      console.error("❌ Failed to create offer:", error)
      this.onError?.("Failed to create connection offer")
    }
  }

  private async handleOffer(message: any) {
    if (!this.pc) return

    try {
      console.log("📥 Processing offer")
      await this.pc.setRemoteDescription(message.offer)
      
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: "answer",
        answer: answer
      })
    } catch (error) {
      console.error("❌ Failed to handle offer:", error)
      this.onError?.("Failed to process connection offer")
    }
  }

  private async handleAnswer(message: any) {
    if (!this.pc) return

    try {
      console.log("📥 Processing answer")
      await this.pc.setRemoteDescription(message.answer)
    } catch (error) {
      console.error("❌ Failed to handle answer:", error)
      this.onError?.("Failed to process connection answer")
    }
  }

  private async handleICECandidate(message: any) {
    try {
      const candidate = new RTCIceCandidate(message.candidate)
      
      if (this.pc && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(candidate)
      } else {
        // Store for later if remote description isn't set yet
        this.pendingICECandidates.push(candidate)
      }
    } catch (error) {
      console.error("❌ Failed to handle ICE candidate:", error)
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    console.log("🔧 Setting up data channel")
    this.dataChannel = channel

    channel.onopen = () => {
      console.log("✅ Data channel opened")
      this.onConnectionStatusChange?.("connected")
    }

    channel.onclose = () => {
      console.log("🔌 Data channel closed")
      this.onConnectionStatusChange?.("disconnected")
    }

    channel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      this.onError?.("Data channel error")
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }
  }

  private handleDataChannelMessage(data: string | ArrayBuffer) {
    try {
      if (typeof data === 'string') {
        const message = JSON.parse(data)
        this.handleP2PMessage(message)
      } else {
        // Handle binary data (file chunks)
        this.handleFileChunk(data)
      }
    } catch (error) {
      console.error("❌ Failed to handle data channel message:", error)
    }
  }

  private handleP2PMessage(message: any) {
    switch (message.type) {
      case "chat":
        console.log("💬 Received chat message")
        this.onChatMessage?.(message.data)
        break

      case "file-offer":
        console.log("📁 Received file offer")
        this.handleFileOffer(message.data)
        break

      case "file-accept":
        console.log("✅ File transfer accepted")
        this.startFileTransfer(message.transferId)
        break

      case "file-chunk-ack":
        console.log("📦 Chunk acknowledged")
        this.handleChunkAck(message.transferId, message.chunkIndex)
        break

      case "file-complete":
        console.log("✅ File transfer complete")
        this.handleFileComplete(message.transferId)
        break

      case "ping":
        this.sendP2PMessage({ type: "pong", timestamp: Date.now() })
        break

      case "pong":
        this.updateConnectionQuality(message.timestamp)
        break
    }
  }

  public async sendFiles(files: File[]) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.onError?.("No active P2P connection")
      return
    }

    console.log(`📤 Sending ${files.length} files`)

    for (const file of files) {
      const transferId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      const transfer: FileTransfer = {
        id: transferId,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "pending",
        direction: "sending",
        file: file,
        totalChunks: Math.ceil(file.size / this.chunkSize),
        receivedChunks: 0
      }

      this.fileTransfers.set(transferId, transfer)
      this.updateFileTransfers()

      // Send file offer
      this.sendP2PMessage({
        type: "file-offer",
        data: {
          transferId,
          name: file.name,
          size: file.size,
          type: file.type,
          totalChunks: transfer.totalChunks
        }
      })
    }
  }

  private handleFileOffer(data: any) {
    const { transferId, name, size, type, totalChunks } = data
    
    console.log(`📥 File offer: ${name} (${(size / 1024 / 1024).toFixed(1)}MB)`)

    const transfer: FileTransfer = {
      id: transferId,
      name,
      size,
      type,
      progress: 0,
      status: "pending",
      direction: "receiving",
      chunks: new Array(totalChunks),
      totalChunks,
      receivedChunks: 0
    }

    this.fileTransfers.set(transferId, transfer)
    this.updateFileTransfers()

    // Auto-accept file transfers
    this.sendP2PMessage({
      type: "file-accept",
      transferId
    })

    transfer.status = "transferring"
    this.updateFileTransfers()
  }

  private async startFileTransfer(transferId: string) {
    const transfer = this.fileTransfers.get(transferId)
    if (!transfer || !transfer.file) return

    console.log(`🚀 Starting file transfer: ${transfer.name}`)
    transfer.status = "transferring"
    this.updateFileTransfers()

    const file = transfer.file
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.chunkSize
      const end = Math.min(start + this.chunkSize, file.size)
      const chunk = file.slice(start, end)
      
      try {
        const arrayBuffer = await chunk.arrayBuffer()
        
        // Send chunk header
        this.sendP2PMessage({
          type: "file-chunk-header",
          transferId,
          chunkIndex,
          chunkSize: arrayBuffer.byteLength
        })

        // Send chunk data
        if (this.dataChannel?.readyState === 'open') {
          this.dataChannel.send(arrayBuffer)
          
          // Update progress
          transfer.progress = Math.round(((chunkIndex + 1) / totalChunks) * 100)
          this.updateTransferSpeed(arrayBuffer.byteLength)
          this.updateFileTransfers()

          // Small delay to prevent overwhelming the connection
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      } catch (error) {
        console.error(`❌ Failed to send chunk ${chunkIndex}:`, error)
        transfer.status = "error"
        this.updateFileTransfers()
        return
      }
    }

    transfer.status = "completed"
    transfer.progress = 100
    this.updateFileTransfers()

    this.sendP2PMessage({
      type: "file-complete",
      transferId
    })

    console.log(`✅ File transfer completed: ${transfer.name}`)
  }

  private handleFileChunk(data: ArrayBuffer) {
    // Find the transfer expecting this chunk
    // This is a simplified version - in practice you'd need better chunk tracking
    for (const [transferId, transfer] of this.fileTransfers) {
      if (transfer.direction === "receiving" && transfer.status === "transferring") {
        if (transfer.chunks && transfer.receivedChunks !== undefined) {
          const chunkIndex = transfer.receivedChunks
          transfer.chunks[chunkIndex] = data
          transfer.receivedChunks++
          
          transfer.progress = Math.round((transfer.receivedChunks / (transfer.totalChunks || 1)) * 100)
          this.updateTransferSpeed(data.byteLength)
          this.updateFileTransfers()

          // Check if file is complete
          if (transfer.receivedChunks === transfer.totalChunks) {
            this.completeFileReceive(transferId)
          }
          break
        }
      }
    }
  }

  private completeFileReceive(transferId: string) {
    const transfer = this.fileTransfers.get(transferId)
    if (!transfer || !transfer.chunks) return

    console.log(`✅ File received: ${transfer.name}`)

    // Combine chunks into blob
    const blob = new Blob(transfer.chunks, { type: transfer.type })
    
    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = transfer.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    transfer.status = "completed"
    transfer.progress = 100
    this.updateFileTransfers()
  }

  public sendChatMessage(message: ChatMessage) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.onError?.("No active P2P connection for chat")
      return
    }

    console.log("💬 Sending chat message")
    this.sendP2PMessage({
      type: "chat",
      data: message
    })
  }

  private sendP2PMessage(message: any) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message))
    }
  }

  private sendSignalingMessage(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        ...message,
        sessionId: this.sessionId,
        userId: this.userId
      }))
    }
  }

  private updateTransferSpeed(bytes: number) {
    this.bytesTransferred += bytes
    const now = Date.now()
    
    if (now - this.lastSpeedUpdate > 1000) { // Update every second
      const speed = this.bytesTransferred / ((now - this.lastSpeedUpdate) / 1000)
      this.onSpeedUpdate?.(speed)
      this.bytesTransferred = 0
      this.lastSpeedUpdate = now
    }
  }

  private updateConnectionQuality(pingTimestamp: number) {
    const latency = Date.now() - pingTimestamp
    let quality: "excellent" | "good" | "poor"
    
    if (latency < 100) quality = "excellent"
    else if (latency < 300) quality = "good"
    else quality = "poor"
    
    this.onConnectionQualityChange?.(quality)
  }

  private updateFileTransfers() {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private handleP2PDisconnection() {
    console.log("🔌 P2P connection lost - attempting recovery")
    this.onConnectionStatusChange?.("disconnected")
    
    // Attempt to reconnect
    setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.startP2PConnection()
      }
    }, 2000)
  }

  private handleWebSocketClose() {
    this.onSignalingStatusChange?.("disconnected")
    this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)
      
      console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connectToSignalingServer()
      }, delay)
    } else {
      console.error("❌ Max reconnection attempts reached")
      this.onError?.("Connection failed - please refresh the page")
    }
  }

  public reconnect() {
    console.log("🔄 Manual reconnect triggered")
    this.reconnectAttempts = 0
    this.destroy()
    setTimeout(() => {
      this.initialize()
    }, 1000)
  }

  public destroy() {
    console.log("🛑 Destroying P2P connection")
    
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.fileTransfers.clear()
  }

  // Additional methods for chunk acknowledgment and error handling
  private handleChunkAck(transferId: string, chunkIndex: number) {
    // Implementation for chunk acknowledgment
    console.log(`✅ Chunk ${chunkIndex} acknowledged for transfer ${transferId}`)
  }

  private handleFileComplete(transferId: string) {
    const transfer = this.fileTransfers.get(transferId)
    if (transfer) {
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()
      console.log(`✅ File transfer completed: ${transfer.name}`)
    }
  }
}
