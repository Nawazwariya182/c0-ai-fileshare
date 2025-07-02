// Bulletproof P2P Connection System - Simple & Stable

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

  // Single connection components - no backups, no complexity
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null

  // Simple state management
  private isInitiator = false
  private isDestroyed = false
  private connectionState: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingState: "connecting" | "connected" | "disconnected" = "connecting"

  // Simple connection handling
  private wsUrl = ""
  private connectionStats: ConnectionStats = {
    latency: 0,
    throughput: 0,
    quality: "excellent",
  }

  // File and chat management
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private receivedChunks: Map<
    string,
    { chunks: Map<number, ArrayBuffer>; totalSize: number; fileName: string; fileType: string }
  > = new Map()

  // Simple timers - only what we need
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

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

    // Simple URL setup
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.wsUrl = process.env.NEXT_PUBLIC_WS_URL
    } else if (process.env.NODE_ENV === "production") {
      this.wsUrl = "wss://signaling-server-1ckx.onrender.com"
    } else {
      this.wsUrl = "ws://localhost:8080"
    }

    console.log("🚀 Bulletproof P2P System initialized")
  }

  public async initialize() {
    if (this.isDestroyed) return

    console.log("🔗 Starting bulletproof connection...")
    this.connectionState = "connecting"
    this.signalingState = "connecting"

    await this.connectWebSocket()
  }

  public destroy() {
    console.log("🛑 Destroying bulletproof P2P")
    this.isDestroyed = true
    this.cleanup()
  }

  private cleanup() {
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
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
      this.ws.close()
      this.ws = null
    }
  }

  private async connectWebSocket() {
    if (this.isDestroyed || this.ws) return

    console.log(`🔗 Connecting to ${this.wsUrl}`)

    try {
      this.ws = new WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected")
        this.signalingState = "connected"
        this.onSignalingStatusChange?.("connected")

        // Send join message immediately
        this.sendMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
        })

        // Start simple heartbeat
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
        console.log(`🔌 WebSocket closed: ${event.code}`)
        this.signalingState = "disconnected"
        this.onSignalingStatusChange?.("disconnected")
        this.ws = null

        // Simple reconnect - only if not destroyed
        if (!this.isDestroyed) {
          console.log("🔄 Reconnecting in 3 seconds...")
          this.reconnectTimer = setTimeout(() => {
            this.connectWebSocket()
          }, 3000)
        }
      }

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
      }
    } catch (error) {
      console.error("❌ WebSocket creation failed:", error)
      if (!this.isDestroyed) {
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket()
        }, 3000)
      }
    }
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
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: "ping",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
        })
      }
    }, 30000) // 30 second heartbeat
  }

  private async handleMessage(message: any) {
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
          setTimeout(() => this.initP2P(), 2000)
        }
        break

      case "pong":
        // Connection is alive
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
        break

      case "error":
        console.error("❌ Server error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async initP2P() {
    if (this.isDestroyed || this.pc) return

    console.log("🚀 Initializing P2P connection")
    this.connectionState = "connecting"
    this.onConnectionStatusChange?.("connecting")

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      })

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendMessage({
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
          this.connectionState = "connected"
          this.onConnectionStatusChange?.("connected")
          console.log("✅ P2P connected!")
        } else if (state === "disconnected" || state === "failed") {
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
        }
      }

      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel
        this.setupDataChannel()
      }

      // Create data channel if initiator
      if (this.isInitiator) {
        this.dataChannel = this.pc.createDataChannel("bulletproof", {
          ordered: true,
        })
        this.setupDataChannel()
      }

      // Create and send offer
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      this.sendMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: offer,
      })
    } catch (error) {
      console.error("❌ P2P init error:", error)
      this.onError?.("Failed to initialize P2P connection")
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return

    this.dataChannel.onopen = () => {
      console.log("📡 Data channel opened")
      this.connectionState = "connected"
      this.onConnectionStatusChange?.("connected")
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
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (this.isDestroyed) return

    try {
      console.log("📥 Handling offer")

      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      })

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendMessage({
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
          this.connectionState = "connected"
          this.onConnectionStatusChange?.("connected")
          console.log("✅ P2P connected!")
        } else if (state === "disconnected" || state === "failed") {
          this.connectionState = "disconnected"
          this.onConnectionStatusChange?.("disconnected")
        }
      }

      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel
        this.setupDataChannel()
      }

      await this.pc.setRemoteDescription(offer)
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      this.sendMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: answer,
      })
    } catch (error) {
      console.error("❌ Handle offer error:", error)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log("📥 Handling answer")
      if (this.pc?.signalingState === "have-local-offer") {
        await this.pc.setRemoteDescription(answer)
      }
    } catch (error) {
      console.error("❌ Handle answer error:", error)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc?.remoteDescription) {
        await this.pc.addIceCandidate(candidate)
      }
    } catch (error) {
      console.error("❌ ICE candidate error:", error)
    }
  }

  private handleDataMessage(message: any) {
    switch (message.type) {
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

    const totalChunks = Math.ceil(message.fileSize / (64 * 1024)) // 64KB chunks
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
          }
        }

        const blob = new Blob(orderedChunks, { type: fileData.fileType })
        this.downloadFile(blob, fileData.fileName)

        transfer.status = "completed"
        transfer.progress = 100
        this.fileTransfers.set(fileId, transfer)
        this.receivedChunks.delete(fileId)
        this.updateFileTransfers()
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
      this.onError?.("Not connected")
      return
    }

    for (const file of files) {
      await this.sendFile(file)
    }
  }

  private async sendFile(file: File) {
    const fileId = Math.random().toString(36).substring(2, 15)
    const chunkSize = 64 * 1024 // 64KB chunks

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
    this.dataChannel!.send(
      JSON.stringify({
        type: "file-start",
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      }),
    )

    // Send chunks
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

      this.dataChannel!.send(message)

      // Update progress
      const progress = Math.round(((i + 1) / totalChunks) * 100)
      transfer.progress = progress
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Small delay to prevent overwhelming
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Send file end
    this.dataChannel!.send(
      JSON.stringify({
        type: "file-end",
        fileId,
      }),
    )

    transfer.status = "completed"
    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()
  }

  public sendChatMessage(content: string, type: "text" | "clipboard", sender: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.onError?.("Not connected")
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

    this.dataChannel.send(
      JSON.stringify({
        type: "chat-message",
        id: message.id,
        content: message.content,
        sender: message.sender,
        timestamp: message.timestamp.getTime(),
        messageType: type,
      }),
    )
  }

  // Simple getters
  public getConnectionState() {
    return this.connectionState
  }

  public getSignalingState() {
    return this.signalingState
  }
}
