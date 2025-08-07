interface SignalingMessage {
  type: string
  sessionId?: string
  userId?: string
  clientInfo?: ClientInfo
  message?: string
  isInitiator?: boolean
  userCount?: number
  readyForP2P?: boolean
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidate
  temporary?: boolean
}

interface ClientInfo {
  isMobile: boolean
  browser: string
  timestamp: number
  url: string
}

interface IncomingFileData {
  chunks: Map<number, ArrayBuffer>
  totalChunks: number
  fileName: string
  fileSize: number
  fileType: string
  receivedChunks: number
  startTime: number
  lastChunkTime: number
}

interface FileOfferData {
  fileId: string
  fileName: string
  fileSize: number
  fileType: string
}

interface FileAcceptData {
  fileId: string
}

interface FileCompleteData {
  fileId: string
  fileName?: string
  totalChunks?: number
  fileSize?: number
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
  eta?: number
  startTime?: number
  endTime?: number
  bytesTransferred?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

interface P2PMessage {
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong' | 'file-cancel'
  data: any
  timestamp: number
  id: string
}

type ConnectionStatus = "waiting" | "connecting" | "connected" | "reconnecting"
type ConnectionQuality = "excellent" | "good" | "poor"

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private isInitiator: boolean = false
  
  // Connection state management
  private connectionStatus: ConnectionStatus = "waiting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed: number = 0
  private userCount: number = 0
  
  // Stable connection management
  private isDestroyed: boolean = false
  private connectionStable: boolean = false
  private lastSuccessfulConnection: number = 0
  private connectionRetryTimeout: NodeJS.Timeout | null = null
  private signalingRetryTimeout: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private stabilityCheckInterval: NodeJS.Timeout | null = null
  
  // File transfer state
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private incomingFiles: Map<string, IncomingFileData> = new Map()
  private sendingFiles: Map<string, File> = new Map()
  private activeTransfers: Set<string> = new Set()
  
  // Chat state
  private chatMessages: ChatMessage[] = []
  
  // Callbacks
  public onConnectionStatusChange?: (status: ConnectionStatus) => void
  public onSignalingStatusChange?: (status: ConnectionStatus) => void
  public onUserCountChange?: (count: number) => void
  public onError?: (error: string) => void
  public onConnectionQualityChange?: (quality: ConnectionQuality) => void
  public onSpeedUpdate?: (speed: number) => void
  public onFileTransferUpdate?: (transfers: FileTransfer[]) => void
  public onChatMessage?: (message: ChatMessage) => void
  public onConnectionRecovery?: () => void
  
  // Performance monitoring
  private pingInterval: NodeJS.Timeout | null = null
  private lastPingTime: number = 0
  private connectionLatency: number = 0
  
  // Optimized transfer settings for stability
  private readonly CHUNK_SIZE = 64 * 1024 // 64KB - stable size
  private readonly CHUNK_DELAY = 10 // 10ms delay for stability
  private readonly PROGRESS_UPDATE_INTERVAL = 500 // Update every 500ms
  private readonly CONNECTION_RETRY_DELAY = 5000 // 5 seconds between retries
  private readonly SIGNALING_RETRY_DELAY = 3000 // 3 seconds for signaling
  private readonly STABILITY_CHECK_INTERVAL = 10000 // Check stability every 10 seconds
  private readonly CONNECTION_TIMEOUT = 15000 // 15 second timeout
  
  // Signaling servers
  private signalingServers: string[] = []
  private currentServerIndex: number = 0
  
  // Stable WebRTC Configuration
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  }

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeSignalingServers()
    console.log(`🚀 BulletproofP2P initialized for session ${sessionId}`)
  }

  private initializeSignalingServers(): void {
    const currentDomain = window.location.hostname
    const isLocalhost = currentDomain === 'localhost' || currentDomain === '127.0.0.1'
    
    this.signalingServers = []
    
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.signalingServers.push(process.env.NEXT_PUBLIC_WS_URL)
    }
    
    if (isLocalhost) {
      this.signalingServers.push(
        'ws://localhost:8080',
        'ws://127.0.0.1:8080'
      )
    } else {
      this.signalingServers.push(
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com'
      )
    }
    
    console.log(`🔗 Initialized ${this.signalingServers.length} signaling servers`)
  }

  async initialize(): Promise<void> {
    console.log('🚀 Starting stable P2P initialization...')
    this.isDestroyed = false
    
    await this.connectToSignalingServer()
    this.startStabilityMonitoring()
    this.startPerformanceMonitoring()
    
    console.log('✅ P2P system initialized')
  }

  private async connectToSignalingServer(): Promise<void> {
    if (this.isDestroyed) return
    
    console.log('🔗 Connecting to signaling server...')
    
    for (let attempt = 0; attempt < this.signalingServers.length && !this.isDestroyed; attempt++) {
      const serverUrl = this.signalingServers[this.currentServerIndex]
      
      try {
        console.log(`🔗 Trying server: ${serverUrl}`)
        
        const connected = await this.attemptSignalingConnection(serverUrl)
        
        if (connected) {
          console.log(`✅ Connected to signaling server: ${serverUrl}`)
          this.signalingStatus = "connected"
          this.onSignalingStatusChange?.(this.signalingStatus)
          return
        }
        
      } catch (error) {
        console.log(`❌ Failed to connect to ${serverUrl}:`, error)
      }
      
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Schedule retry if all servers failed
    console.log('🔄 All signaling servers failed, scheduling retry...')
    this.signalingStatus = "reconnecting"
    this.onSignalingStatusChange?.(this.signalingStatus)
    
    this.signalingRetryTimeout = setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectToSignalingServer()
      }
    }, this.SIGNALING_RETRY_DELAY)
  }

  private attemptSignalingConnection(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isDestroyed) {
        resolve(false)
        return
      }
      
      const ws = new WebSocket(url)
      let resolved = false
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          resolve(false)
        }
      }, this.CONNECTION_TIMEOUT)
      
      ws.onopen = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        
        this.ws = ws
        this.setupWebSocketHandlers()
        
        // Join session
        this.sendSignalingMessage({
          type: 'join',
          sessionId: this.sessionId,
          userId: this.userId,
          clientInfo: {
            isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
            browser: this.getBrowserInfo(),
            timestamp: Date.now(),
            url: url
          }
        })
        
        resolve(true)
      }
      
      ws.onerror = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
      }
      
      ws.onclose = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
      }
    })
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleSignalingMessage(message)
      } catch (error) {
        console.error('❌ Failed to parse signaling message:', error)
      }
    }

    this.ws.onclose = (event) => {
      console.log(`🔌 Signaling connection closed: ${event.code}`)
      if (!this.isDestroyed && event.code !== 1000) {
        this.signalingStatus = "reconnecting"
        this.onSignalingStatusChange?.(this.signalingStatus)
        
        this.signalingRetryTimeout = setTimeout(() => {
          if (!this.isDestroyed) {
            this.connectToSignalingServer()
          }
        }, this.SIGNALING_RETRY_DELAY)
      }
    }

    this.ws.onerror = (error) => {
      console.log('❌ Signaling WebSocket error:', error)
    }
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    console.log(`📨 Signaling: ${message.type}`)

    switch (message.type) {
      case 'connected':
        console.log('✅ Server connection confirmed')
        break

      case 'joined':
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        console.log(`✅ Joined as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'}, users: ${this.userCount}`)
        
        // Update connection status based on user count
        if (this.userCount === 1) {
          this.connectionStatus = "waiting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          console.log('⏳ Waiting for another user to join...')
        } else if (this.userCount >= 2) {
          this.connectionStatus = "connecting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          // Wait a bit before attempting P2P connection
          setTimeout(() => this.attemptP2PConnection(), 2000)
        }
        break

      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 User joined, total users: ${this.userCount}`)
        
        if (this.userCount >= 2) {
          this.connectionStatus = "connecting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          // Wait a bit before attempting P2P connection
          setTimeout(() => this.attemptP2PConnection(), 2000)
        }
        break

      case 'user-left':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👋 User left, total users: ${this.userCount}`)
        
        if (this.userCount < 2) {
          this.connectionStatus = "waiting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          this.resetPeerConnection()
        }
        break

      case 'offer':
        await this.handleOffer(message)
        break

      case 'answer':
        await this.handleAnswer(message)
        break

      case 'ice-candidate':
        await this.handleIceCandidate(message)
        break

      case 'error':
        console.log('⚠️ Signaling error:', message.message)
        break
    }
  }

  private async attemptP2PConnection(): Promise<void> {
    if (this.isDestroyed || this.userCount < 2) return
    
    // Don't attempt connection if we already have a stable one
    if (this.connectionStable && this.dataChannel && this.dataChannel.readyState === 'open') {
      console.log('✅ P2P connection already stable, skipping attempt')
      return
    }
    
    try {
      console.log('🔧 Attempting P2P connection...')
      
      // Close existing connection if any
      if (this.pc) {
        this.pc.close()
      }
      
      this.pc = new RTCPeerConnection(this.rtcConfig)
      this.setupPeerConnectionHandlers()
      
      if (this.isInitiator) {
        // Create data channel with stable settings
        this.dataChannel = this.pc.createDataChannel('bulletproof-stable', {
          ordered: true,
          maxRetransmits: 3
        })
        this.setupDataChannel(this.dataChannel)
        
        // Create and send offer
        const offer = await this.pc.createOffer()
        await this.pc.setLocalDescription(offer)
        
        this.sendSignalingMessage({
          type: 'offer',
          offer: offer,
          sessionId: this.sessionId
        })
        
        console.log('📤 P2P offer sent')
      }
      
    } catch (error) {
      console.error('❌ P2P connection attempt failed:', error)
      this.connectionStatus = "reconnecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
      
      // Schedule retry
      this.connectionRetryTimeout = setTimeout(() => {
        if (!this.isDestroyed && this.userCount >= 2) {
          this.attemptP2PConnection()
        }
      }, this.CONNECTION_RETRY_DELAY)
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          sessionId: this.sessionId
        })
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`🔗 P2P Connection state: ${state}`)
      
      if (state === 'connected') {
        this.connectionStatus = "connected"
        this.connectionStable = true
        this.lastSuccessfulConnection = Date.now()
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.onConnectionRecovery?.()
        console.log('✅ P2P connection established and stable!')
      } else if (state === 'failed' || state === 'closed') {
        this.connectionStable = false
        if (this.userCount >= 2) {
          this.connectionStatus = "reconnecting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          console.log('🔄 P2P connection lost, will reconnect...')
          
          // Only retry if we have users and no active transfers
          if (this.activeTransfers.size === 0) {
            this.connectionRetryTimeout = setTimeout(() => {
              if (!this.isDestroyed && this.userCount >= 2) {
                this.attemptP2PConnection()
              }
            }, this.CONNECTION_RETRY_DELAY)
          }
        }
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log('📡 Data channel received')
      this.setupDataChannel(event.channel)
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel

    channel.onopen = () => {
      console.log('✅ Data channel opened!')
      this.connectionStatus = "connected"
      this.connectionStable = true
      this.lastSuccessfulConnection = Date.now()
      this.onConnectionStatusChange?.(this.connectionStatus)
    }

    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.connectionStable = false
      if (this.userCount >= 2 && this.activeTransfers.size === 0) {
        this.connectionStatus = "reconnecting"
        this.onConnectionStatusChange?.(this.connectionStatus)
      }
    }

    channel.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      this.connectionStable = false
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    channel.binaryType = 'arraybuffer'
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) {
        this.pc = new RTCPeerConnection(this.rtcConfig)
        this.setupPeerConnectionHandlers()
      }

      if (!message.offer) return

      await this.pc.setRemoteDescription(message.offer)
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId
      })

      console.log('📤 P2P answer sent')
    } catch (error) {
      console.error('❌ Failed to handle offer:', error)
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.answer) {
        await this.pc.setRemoteDescription(message.answer)
        console.log('✅ P2P answer processed')
      }
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.candidate) {
        await this.pc.addIceCandidate(message.candidate)
      }
    } catch (error) {
      console.error('❌ Failed to handle ICE candidate:', error)
    }
  }

  private handleDataChannelMessage(data: string | ArrayBuffer): void {
    try {
      if (typeof data === 'string') {
        const message: P2PMessage = JSON.parse(data)
        this.handleP2PMessage(message)
      } else {
        this.handleFileChunk(data)
      }
    } catch (error) {
      console.error('❌ Failed to handle data channel message:', error)
    }
  }

  private handleP2PMessage(message: P2PMessage): void {
    switch (message.type) {
      case 'chat-message':
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.data.content,
          sender: message.data.sender,
          timestamp: new Date(message.timestamp),
          type: message.data.type
        }
        this.chatMessages.push(chatMessage)
        this.onChatMessage?.(chatMessage)
        break

      case 'file-offer':
        this.handleFileOffer(message.data)
        break

      case 'file-accept':
        this.handleFileAccept(message.data)
        break

      case 'file-complete':
        this.handleFileComplete(message.data)
        break

      case 'ping':
        this.sendP2PMessage({
          type: 'pong',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
          id: this.generateId()
        })
        break

      case 'pong':
        this.connectionLatency = Date.now() - this.lastPingTime
        this.updateConnectionQuality()
        break
    }
  }

  // Stable file transfer implementation
  async sendFiles(files: File[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.onError?.('Not connected - cannot send files')
      return
    }

    if (!this.connectionStable) {
      this.onError?.('Connection not stable - please wait')
      return
    }

    console.log(`📤 Sending ${files.length} files`)

    for (const file of files) {
      const fileId = this.generateId()
      const transfer: FileTransfer = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "pending",
        direction: "sending",
        speed: 0,
        startTime: Date.now(),
        bytesTransferred: 0
      }

      this.fileTransfers.set(fileId, transfer)
      this.sendingFiles.set(fileId, file)
      this.updateFileTransfers()

      // Send file offer
      this.sendP2PMessage({
        type: 'file-offer',
        data: {
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        },
        timestamp: Date.now(),
        id: this.generateId()
      })
    }
  }

  private async sendFileStable(file: File, fileId: string): Promise<void> {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    // Mark as active transfer to prevent reconnections
    this.activeTransfers.add(fileId)

    transfer.status = "transferring"
    transfer.startTime = Date.now()
    this.updateFileTransfers()

    const chunkSize = this.CHUNK_SIZE
    const totalChunks = Math.ceil(file.size / chunkSize)
    let chunkIndex = 0

    console.log(`📤 Starting stable transfer: ${file.name} (${totalChunks} chunks)`)

    const startTime = Date.now()
    let bytesTransferred = 0
    let lastProgressUpdate = 0

    try {
      while (chunkIndex < totalChunks && transfer.status === "transferring") {
        // Check if connection is still stable
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
          throw new Error('Connection lost during transfer')
        }

        const start = chunkIndex * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunk = file.slice(start, end)

        const arrayBuffer = await chunk.arrayBuffer()
        
        const header = {
          fileId,
          chunkIndex,
          totalChunks,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }

        const headerStr = JSON.stringify(header)
        const headerBytes = new TextEncoder().encode(headerStr)
        const headerLength = headerBytes.length

        const combined = new ArrayBuffer(4 + headerLength + arrayBuffer.byteLength)
        const view = new DataView(combined)
        
        view.setUint32(0, headerLength, true)
        new Uint8Array(combined, 4, headerLength).set(headerBytes)
        new Uint8Array(combined, 4 + headerLength).set(new Uint8Array(arrayBuffer))

        // Send chunk with stability check
        this.dataChannel.send(combined)
        
        chunkIndex++
        bytesTransferred += arrayBuffer.byteLength
        transfer.bytesTransferred = bytesTransferred

        // Update progress
        const now = Date.now()
        if (now - lastProgressUpdate > this.PROGRESS_UPDATE_INTERVAL) {
          const elapsed = (now - startTime) / 1000
          const speed = elapsed > 0 ? Math.round(bytesTransferred / elapsed) : 0
          const eta = speed > 0 ? Math.round((file.size - bytesTransferred) / speed) : 0
          
          transfer.progress = Math.round((chunkIndex / totalChunks) * 100)
          transfer.speed = speed
          transfer.eta = eta
          this.currentSpeed = speed
          
          this.onSpeedUpdate?.(speed)
          this.updateFileTransfers()
          lastProgressUpdate = now

          console.log(`📤 Progress: ${transfer.progress}% (${this.formatSpeed(speed)})`)
        }

        // Stable delay between chunks
        await new Promise(resolve => setTimeout(resolve, this.CHUNK_DELAY))
      }

      // Send completion signal
      this.sendP2PMessage({
        type: 'file-complete',
        data: { 
          fileId,
          fileName: file.name,
          totalChunks,
          fileSize: file.size
        },
        timestamp: Date.now(),
        id: this.generateId()
      })

      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()

      console.log(`✅ File sent successfully: ${file.name}`)

    } catch (error) {
      console.error(`❌ File transfer failed: ${file.name}`, error)
      transfer.status = "error"
      this.updateFileTransfers()
    } finally {
      // Remove from active transfers
      this.activeTransfers.delete(fileId)
    }
  }

  private handleFileChunk(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)
      const headerLength = view.getUint32(0, true)
      
      if (headerLength > 10000) return

      const headerBytes = new Uint8Array(data, 4, headerLength)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunkData = data.slice(4 + headerLength)

      const { fileId, chunkIndex, totalChunks, fileName, fileSize, fileType } = header

      // Initialize incoming file
      if (!this.incomingFiles.has(fileId)) {
        this.incomingFiles.set(fileId, {
          chunks: new Map(),
          totalChunks,
          fileName,
          fileSize,
          fileType,
          receivedChunks: 0,
          startTime: Date.now(),
          lastChunkTime: Date.now()
        })

        const transfer: FileTransfer = {
          id: fileId,
          name: fileName,
          size: fileSize,
          type: fileType,
          progress: 0,
          status: "transferring",
          direction: "receiving",
          speed: 0,
          startTime: Date.now(),
          bytesTransferred: 0
        }
        this.fileTransfers.set(fileId, transfer)
        this.activeTransfers.add(fileId)
        console.log(`📥 Receiving file: ${fileName}`)
      }

      const incomingFile = this.incomingFiles.get(fileId)!
      const transfer = this.fileTransfers.get(fileId)!

      // Store chunk
      if (!incomingFile.chunks.has(chunkIndex)) {
        incomingFile.chunks.set(chunkIndex, chunkData)
        incomingFile.receivedChunks++
        incomingFile.lastChunkTime = Date.now()

        // Update progress
        const progress = Math.round((incomingFile.receivedChunks / totalChunks) * 100)
        transfer.progress = progress
        
        const now = Date.now()
        const elapsed = (now - incomingFile.startTime) / 1000
        const bytesReceived = incomingFile.receivedChunks * chunkData.byteLength
        transfer.bytesTransferred = bytesReceived
        
        if (elapsed > 0) {
          const speed = Math.round(bytesReceived / elapsed)
          transfer.speed = speed
          transfer.eta = speed > 0 ? Math.round((fileSize - bytesReceived) / speed) : 0
        }

        this.updateFileTransfers()

        if (incomingFile.receivedChunks % 50 === 0) {
          console.log(`📥 Received: ${progress}% (${this.formatSpeed(transfer.speed || 0)})`)
        }
      }

    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }

  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ File completion signal: ${data.fileId}`)
    
    const incomingFile = this.incomingFiles.get(data.fileId)
    const transfer = this.fileTransfers.get(data.fileId)

    if (!incomingFile || !transfer) return

    const expectedChunks = data.totalChunks || incomingFile.totalChunks

    if (incomingFile.receivedChunks === expectedChunks) {
      console.log(`✅ All chunks received, assembling file...`)
      this.assembleAndDownloadFile(data.fileId)
    } else {
      console.log(`⏳ Waiting for chunks: ${incomingFile.receivedChunks}/${expectedChunks}`)
      
      setTimeout(() => {
        const currentFile = this.incomingFiles.get(data.fileId)
        if (currentFile && currentFile.receivedChunks === expectedChunks) {
          this.assembleAndDownloadFile(data.fileId)
        } else {
          console.error(`❌ File incomplete: ${currentFile?.receivedChunks}/${expectedChunks}`)
          if (transfer) {
            transfer.status = "error"
            this.updateFileTransfers()
            this.activeTransfers.delete(data.fileId)
          }
        }
      }, 2000)
    }
  }

  private assembleAndDownloadFile(fileId: string): void {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!incomingFile || !transfer) return

    try {
      console.log(`🔧 Assembling file: ${incomingFile.fileName}`)
      
      const chunks: ArrayBuffer[] = []
      let totalSize = 0
      
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        const chunk = incomingFile.chunks.get(i)
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`)
        }
        chunks.push(chunk)
        totalSize += chunk.byteLength
      }

      console.log(`✅ File assembled: ${totalSize} bytes`)

      const blob = new Blob(chunks, { type: incomingFile.fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = incomingFile.fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()

      // Cleanup
      this.incomingFiles.delete(fileId)
      this.activeTransfers.delete(fileId)

      console.log(`✅ File downloaded: ${incomingFile.fileName}`)
      
    } catch (error) {
      console.error('❌ Failed to assemble file:', error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.activeTransfers.delete(fileId)
    }
  }

  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer: ${data.fileName} (${this.formatFileSize(data.fileSize)})`)
    
    // Auto-accept
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
  }

  private handleFileAccept(data: FileAcceptData): void {
    console.log(`✅ File accepted: ${data.fileId}`)
    
    const file = this.sendingFiles.get(data.fileId)
    if (file) {
      this.sendFileStable(file, data.fileId)
    }
  }

  sendMessage(message: ChatMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.onError?.('Not connected - cannot send message')
      return
    }

    this.sendP2PMessage({
      type: 'chat-message',
      data: {
        content: message.content,
        sender: message.sender,
        type: message.type
      },
      timestamp: Date.now(),
      id: message.id
    })
  }

  private startStabilityMonitoring(): void {
    this.stabilityCheckInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      // Check connection stability
      const now = Date.now()
      const timeSinceLastConnection = now - this.lastSuccessfulConnection
      
      // If we haven't had a successful connection in a while and have users
      if (timeSinceLastConnection > 30000 && this.userCount >= 2 && this.activeTransfers.size === 0) {
        console.log('🔍 Connection stability check: attempting reconnection')
        this.connectionStable = false
        this.attemptP2PConnection()
      }
      
      // Update connection quality based on stability
      if (this.connectionStable && this.dataChannel && this.dataChannel.readyState === 'open') {
        this.connectionQuality = "excellent"
      } else {
        this.connectionQuality = "poor"
      }
      
      this.onConnectionQualityChange?.(this.connectionQuality)
    }, this.STABILITY_CHECK_INTERVAL)
  }

  private startPerformanceMonitoring(): void {
    this.pingInterval = setInterval(() => {
      if (!this.isDestroyed && this.dataChannel && this.dataChannel.readyState === 'open') {
        this.lastPingTime = Date.now()
        this.sendP2PMessage({
          type: 'ping',
          data: { timestamp: this.lastPingTime },
          timestamp: this.lastPingTime,
          id: this.generateId()
        })
      }
      
      // Send keep-alive to signaling server
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: 'keep-alive',
          sessionId: this.sessionId,
          userId: this.userId
        })
      }
    }, 30000)
  }

  private updateConnectionQuality(): void {
    if (this.connectionLatency < 100) {
      this.connectionQuality = "excellent"
    } else if (this.connectionLatency < 300) {
      this.connectionQuality = "good"
    } else {
      this.connectionQuality = "poor"
    }
    
    this.onConnectionQualityChange?.(this.connectionQuality)
  }

  private resetPeerConnection(): void {
    console.log('🔄 Resetting peer connection')
    
    this.connectionStable = false
    
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
  }

  private sendP2PMessage(message: P2PMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error('❌ Failed to send P2P message:', error)
      }
    }
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error('❌ Failed to send signaling message:', error)
      }
    }
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return 'Unknown'
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  // Public getters
  getConnectionStatus(): ConnectionStatus { return this.connectionStatus }
  getSignalingStatus(): ConnectionStatus { return this.signalingStatus }
  getConnectionQuality(): ConnectionQuality { return this.connectionQuality }
  getCurrentSpeed(): number { return this.currentSpeed }
  getUserCount(): number { return this.userCount }
  getFileTransfers(): FileTransfer[] { return Array.from(this.fileTransfers.values()) }
  getChatMessages(): ChatMessage[] { return [...this.chatMessages] }

  destroy(): void {
    console.log('🛑 Destroying P2P connection...')
    this.isDestroyed = true

    // Clear all timeouts and intervals
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.connectionRetryTimeout) clearTimeout(this.connectionRetryTimeout)
    if (this.signalingRetryTimeout) clearTimeout(this.signalingRetryTimeout)
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)
    if (this.stabilityCheckInterval) clearInterval(this.stabilityCheckInterval)

    // Close connections
    if (this.dataChannel) this.dataChannel.close()
    if (this.pc) this.pc.close()
    if (this.ws) this.ws.close(1000, 'Client disconnect')

    // Clear state
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.activeTransfers.clear()
    this.chatMessages = []

    console.log('✅ P2P connection destroyed')
  }
}
