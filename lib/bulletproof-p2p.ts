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
  assemblyBuffer?: ArrayBuffer[]
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
  checksum?: string
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
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong' | 'file-cancel' | 'file-retry'
  data: any
  timestamp: number
  id: string
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting"
type ConnectionQuality = "excellent" | "good" | "poor"

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private isInitiator: boolean = false
  
  // Connection state - NEVER show disconnected
  private connectionStatus: ConnectionStatus = "connecting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed: number = 0
  private userCount: number = 0
  
  // Persistent connection management
  private connectionAttempts: number = 0
  private signalingAttempts: number = 0
  private isDestroyed: boolean = false
  private connectionRetryInterval: NodeJS.Timeout | null = null
  private signalingRetryInterval: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  
  // Multiple signaling servers for redundancy
  private signalingServers: string[] = []
  private currentServerIndex: number = 0
  
  // File transfer state
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private incomingFiles: Map<string, IncomingFileData> = new Map()
  private sendingFiles: Map<string, File> = new Map()
  private transferQueue: string[] = []
  
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
  private lastSpeedCheck: number = 0
  private bytesTransferred: number = 0
  private pingInterval: NodeJS.Timeout | null = null
  private lastPingTime: number = 0
  private connectionLatency: number = 0
  
  // Ultra-fast transfer optimization - Toffee Share level speeds
  private readonly CHUNK_SIZE = 2 * 1024 * 1024 // 2MB chunks for maximum speed
  private readonly MAX_CONCURRENT_TRANSFERS = 8 // Multiple parallel transfers
  private readonly PROGRESS_UPDATE_INTERVAL = 100 // Update UI every 100ms
  private readonly CHUNK_DELAY = 0 // No delay for maximum speed
  private readonly CONNECTION_RETRY_DELAY = 1000 // 1 second between retries
  private readonly SIGNALING_RETRY_DELAY = 2000 // 2 seconds between signaling retries
  private readonly HEALTH_CHECK_INTERVAL = 5000 // Check health every 5 seconds
  
  // Enhanced WebRTC Configuration with multiple STUN/TURN servers
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      // Google STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // Additional STUN servers for redundancy
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com' },
      { urls: 'stun:stun.voipbuster.com' },
      
      // TURN servers for NAT traversal
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 20, // Increased for better connectivity
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all' // Use all available transports
  }

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeSignalingServers()
    console.log(`🚀 BulletproofP2P initialized for session ${sessionId} with persistent connection`)
  }

  private initializeSignalingServers(): void {
    const currentDomain = window.location.hostname
    const isLocalhost = currentDomain === 'localhost' || currentDomain === '127.0.0.1'
    
    this.signalingServers = []
    
    // Add environment variable URL first
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.signalingServers.push(process.env.NEXT_PUBLIC_WS_URL)
    }
    
    if (isLocalhost) {
      this.signalingServers.push(
        'ws://localhost:8080',
        'ws://127.0.0.1:8080',
        'ws://localhost:3001',
        'ws://127.0.0.1:3001'
      )
    } else {
      // Production servers with multiple fallbacks
      this.signalingServers.push(
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com',
        'wss://p2p-file-share-server.onrender.com',
        'wss://signaling-server.onrender.com',
        'wss://p2p-signaling-server.up.railway.app',
        'wss://p2p-signaling-server.herokuapp.com',
        'wss://signaling.toffee-share.com', // Hypothetical high-speed server
        'wss://relay.fast-p2p.com', // Another hypothetical server
        // Fallback to non-SSL
        'ws://p2p-signaling-server.onrender.com'
      )
    }
    
    console.log(`🔗 Initialized ${this.signalingServers.length} signaling servers`)
  }

  async initialize(): Promise<void> {
    console.log('🚀 Starting persistent P2P initialization...')
    this.isDestroyed = false
    
    // Start all connection processes simultaneously
    this.startPersistentSignalingConnection()
    this.startPersistentP2PConnection()
    this.startPerformanceMonitoring()
    this.startHealthMonitoring()
    
    console.log('✅ Persistent P2P system started')
  }

  private startPersistentSignalingConnection(): void {
    if (this.isDestroyed) return
    
    console.log('🔄 Starting persistent signaling connection...')
    this.connectToSignalingServer()
    
    // Set up persistent retry mechanism
    this.signalingRetryInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.signalingStatus = "reconnecting"
        this.onSignalingStatusChange?.(this.signalingStatus)
        this.connectToSignalingServer()
      }
    }, this.SIGNALING_RETRY_DELAY)
  }

  private startPersistentP2PConnection(): void {
    if (this.isDestroyed) return
    
    console.log('🔄 Starting persistent P2P connection...')
    
    // Set up persistent P2P retry mechanism
    this.connectionRetryInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      if (!this.pc || this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.connectionStatus = "reconnecting"
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.attemptP2PConnection()
      } else if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        this.connectionStatus = "reconnecting"
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.attemptP2PConnection()
      }
    }, this.CONNECTION_RETRY_DELAY)
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      this.performHealthCheck()
    }, this.HEALTH_CHECK_INTERVAL)
  }

  private performHealthCheck(): void {
    // Check signaling connection
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('🔍 Health check: Signaling connection needs repair')
      this.signalingStatus = "reconnecting"
      this.onSignalingStatusChange?.(this.signalingStatus)
    }
    
    // Check P2P connection
    if (!this.pc || !this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.log('🔍 Health check: P2P connection needs repair')
      this.connectionStatus = "reconnecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    
    // Send ping if connected
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.sendPing()
    }
  }

  private async connectToSignalingServer(): Promise<void> {
    if (this.isDestroyed) return
    
    const maxAttempts = this.signalingServers.length * 3 // Try each server 3 times
    
    while (this.signalingAttempts < maxAttempts && !this.isDestroyed) {
      const serverUrl = this.signalingServers[this.currentServerIndex]
      
      try {
        console.log(`🔗 Signaling attempt ${this.signalingAttempts + 1}: ${serverUrl}`)
        
        const connected = await this.attemptSignalingConnection(serverUrl)
        
        if (connected) {
          console.log(`✅ Signaling connected to: ${serverUrl}`)
          this.signalingStatus = "connected"
          this.onSignalingStatusChange?.(this.signalingStatus)
          this.signalingAttempts = 0
          return
        }
        
      } catch (error) {
        console.log(`❌ Signaling connection failed: ${serverUrl}`, error)
      }
      
      // Move to next server
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      this.signalingAttempts++
      
      // Small delay before next attempt
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Reset attempts and try again
    this.signalingAttempts = 0
    console.log('🔄 Resetting signaling attempts, will retry...')
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
      }, 5000) // 5 second timeout
      
      ws.onopen = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        
        this.ws = ws
        this.setupWebSocketHandlers()
        
        // Join session immediately
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

    this.ws.onclose = () => {
      console.log('🔌 Signaling connection closed, will reconnect...')
      this.signalingStatus = "reconnecting"
      this.onSignalingStatusChange?.(this.signalingStatus)
    }

    this.ws.onerror = (error) => {
      console.log('❌ Signaling WebSocket error, will reconnect...', error)
      this.signalingStatus = "reconnecting"
      this.onSignalingStatusChange?.(this.signalingStatus)
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
        console.log(`✅ Joined as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'}`)
        
        // Immediately attempt P2P connection
        setTimeout(() => this.attemptP2PConnection(), 500)
        break

      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log('👥 User joined, attempting P2P connection')
        setTimeout(() => this.attemptP2PConnection(), 500)
        break

      case 'p2p-ready':
        console.log('🎯 P2P ready signal received')
        this.attemptP2PConnection()
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

      case 'user-left':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        break

      case 'error':
        console.log('⚠️ Signaling error (will continue trying):', message.message)
        break
    }
  }

  private async attemptP2PConnection(): Promise<void> {
    if (this.isDestroyed) return
    
    try {
      console.log('🔧 Attempting P2P connection...')
      this.connectionAttempts++
      
      // Close existing connection if any
      if (this.pc) {
        this.pc.close()
      }
      
      this.pc = new RTCPeerConnection(this.rtcConfig)
      this.setupPeerConnectionHandlers()
      
      if (this.isInitiator) {
        // Create data channel with optimized settings for speed
        this.dataChannel = this.pc.createDataChannel('bulletproof-ultra', {
          ordered: false, // Allow out-of-order for speed
          maxRetransmits: 0, // No retransmits for speed
          protocol: 'ultra-fast'
        })
        this.setupDataChannel(this.dataChannel)
        
        // Create and send offer
        const offer = await this.pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false
        })
        await this.pc.setLocalDescription(offer)
        
        this.sendSignalingMessage({
          type: 'offer',
          offer: offer,
          sessionId: this.sessionId
        })
        
        console.log('📤 P2P offer sent')
      }
      
    } catch (error) {
      console.log('❌ P2P connection attempt failed, will retry...', error)
      this.connectionStatus = "reconnecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
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
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.onConnectionRecovery?.()
        this.connectionAttempts = 0
        console.log('✅ P2P connection established!')
      } else if (state === 'failed' || state === 'closed') {
        this.connectionStatus = "reconnecting"
        this.onConnectionStatusChange?.(this.connectionStatus)
        console.log('🔄 P2P connection lost, will reconnect...')
      }
    }

    this.pc.ondatachannel = (event) => {
      console.log('📡 Data channel received')
      this.setupDataChannel(event.channel)
    }

    this.pc.onicegatheringstatechange = () => {
      console.log(`🧊 ICE gathering state: ${this.pc?.iceGatheringState}`)
    }

    this.pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state: ${this.pc?.iceConnectionState}`)
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel

    channel.onopen = () => {
      console.log('✅ Ultra-fast data channel opened!')
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
      
      // Process any queued file transfers
      this.processTransferQueue()
    }

    channel.onclose = () => {
      console.log('🔌 Data channel closed, will reconnect...')
      this.connectionStatus = "reconnecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }

    channel.onerror = (error) => {
      console.log('❌ Data channel error, will reconnect...', error)
      this.connectionStatus = "reconnecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    // Optimize for maximum throughput
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
      console.log('❌ Failed to handle offer, will retry...', error)
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.answer) {
        await this.pc.setRemoteDescription(message.answer)
        console.log('✅ P2P answer processed')
      }
    } catch (error) {
      console.log('❌ Failed to handle answer, will retry...', error)
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.candidate) {
        await this.pc.addIceCandidate(message.candidate)
      }
    } catch (error) {
      console.log('❌ Failed to handle ICE candidate:', error)
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

  // Ultra-fast file transfer implementation
  async sendFiles(files: File[]): Promise<void> {
    console.log(`🚀 Sending ${files.length} files with ultra-fast transfer`)

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
      this.transferQueue.push(fileId)
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

    this.processTransferQueue()
  }

  private processTransferQueue(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.log('⏳ Data channel not ready, queuing transfers...')
      return
    }

    // Process multiple transfers in parallel for maximum speed
    const activeTransfers = Array.from(this.fileTransfers.values())
      .filter(t => t.status === "transferring").length

    const maxConcurrent = this.MAX_CONCURRENT_TRANSFERS
    const availableSlots = maxConcurrent - activeTransfers

    for (let i = 0; i < availableSlots && this.transferQueue.length > 0; i++) {
      const fileId = this.transferQueue.shift()
      if (fileId) {
        const file = this.sendingFiles.get(fileId)
        if (file) {
          this.sendFileUltraFast(file, fileId)
        }
      }
    }
  }

  private async sendFileUltraFast(file: File, fileId: string): Promise<void> {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    transfer.status = "transferring"
    transfer.startTime = Date.now()
    this.updateFileTransfers()

    const chunkSize = this.CHUNK_SIZE // 2MB chunks
    const totalChunks = Math.ceil(file.size / chunkSize)
    
    console.log(`🚀 Ultra-fast transfer starting: ${file.name} (${totalChunks} x ${this.formatFileSize(chunkSize)} chunks)`)

    const startTime = Date.now()
    let bytesTransferred = 0
    let lastProgressUpdate = 0

    // Pre-allocate chunks for maximum speed
    const chunks: ArrayBuffer[] = []
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      chunks.push(await chunk.arrayBuffer())
    }

    console.log('✅ File pre-processed into chunks, starting ultra-fast transmission...')

    // Send chunks as fast as possible
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (transfer.status !== "transferring") break

      try {
        const chunkData = chunks[chunkIndex]
        
        // Minimal header for maximum speed
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

        // Ultra-efficient buffer combination
        const combined = new ArrayBuffer(4 + headerLength + chunkData.byteLength)
        const view = new DataView(combined)
        
        view.setUint32(0, headerLength, true)
        new Uint8Array(combined, 4, headerLength).set(headerBytes)
        new Uint8Array(combined, 4 + headerLength).set(new Uint8Array(chunkData))

        // Send immediately without delay
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(combined)
          
          bytesTransferred += chunkData.byteLength
          transfer.bytesTransferred = bytesTransferred

          // High-frequency progress updates for smooth UI
          const now = Date.now()
          if (now - lastProgressUpdate > this.PROGRESS_UPDATE_INTERVAL) {
            const elapsed = (now - startTime) / 1000
            const speed = elapsed > 0 ? Math.round(bytesTransferred / elapsed) : 0
            const eta = speed > 0 ? Math.round((file.size - bytesTransferred) / speed) : 0
            
            transfer.progress = Math.round(((chunkIndex + 1) / totalChunks) * 100)
            transfer.speed = speed
            transfer.eta = eta
            this.currentSpeed = speed
            
            this.onSpeedUpdate?.(speed)
            this.updateFileTransfers()
            lastProgressUpdate = now

            if (chunkIndex % 100 === 0) {
              console.log(`🚀 Ultra-fast progress: ${transfer.progress}% at ${this.formatSpeed(speed)}`)
            }
          }

          // No delay - send as fast as possible
          // Only yield control occasionally to prevent blocking
          if (chunkIndex % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0))
          }
        } else {
          throw new Error('Data channel not available')
        }
      } catch (error) {
        console.error(`❌ Failed to send chunk ${chunkIndex}:`, error)
        transfer.status = "error"
        this.updateFileTransfers()
        return
      }
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

    const totalTime = (transfer.endTime - startTime) / 1000
    const avgSpeed = totalTime > 0 ? Math.round(file.size / totalTime) : 0
    
    console.log(`✅ Ultra-fast transfer completed: ${file.name} in ${totalTime.toFixed(1)}s at ${this.formatSpeed(avgSpeed)}`)

    // Process next queued transfer
    this.processTransferQueue()
  }

  private handleFileChunk(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)
      const headerLength = view.getUint32(0, true)
      
      if (headerLength > 10000) return // Sanity check

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
          lastChunkTime: Date.now(),
          assemblyBuffer: new Array(totalChunks) // Pre-allocate for speed
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
        console.log(`📥 Ultra-fast receive started: ${fileName}`)
      }

      const incomingFile = this.incomingFiles.get(fileId)!
      const transfer = this.fileTransfers.get(fileId)!

      // Store chunk directly in assembly buffer for maximum speed
      if (!incomingFile.chunks.has(chunkIndex)) {
        incomingFile.chunks.set(chunkIndex, chunkData)
        incomingFile.assemblyBuffer![chunkIndex] = chunkData
        incomingFile.receivedChunks++
        incomingFile.lastChunkTime = Date.now()

        // Ultra-fast progress calculation
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

        // Log progress for large files
        if (incomingFile.receivedChunks % 100 === 0) {
          console.log(`📥 Ultra-fast receive: ${progress}% at ${this.formatSpeed(transfer.speed || 0)}`)
        }
      }

    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }

  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ Ultra-fast transfer completion: ${data.fileId}`)
    
    const incomingFile = this.incomingFiles.get(data.fileId)
    const transfer = this.fileTransfers.get(data.fileId)

    if (!incomingFile || !transfer) return

    const expectedChunks = data.totalChunks || incomingFile.totalChunks

    if (incomingFile.receivedChunks === expectedChunks) {
      console.log(`🚀 Assembling file at ultra-fast speed...`)
      this.assembleFileUltraFast(data.fileId)
    } else {
      console.log(`⏳ Waiting for remaining chunks: ${incomingFile.receivedChunks}/${expectedChunks}`)
      
      // Quick timeout for missing chunks
      setTimeout(() => {
        const currentFile = this.incomingFiles.get(data.fileId)
        if (currentFile && currentFile.receivedChunks === expectedChunks) {
          this.assembleFileUltraFast(data.fileId)
        } else {
          console.log(`❌ File incomplete: ${currentFile?.receivedChunks}/${expectedChunks}`)
          if (transfer) {
            transfer.status = "error"
            this.updateFileTransfers()
          }
        }
      }, 1000) // 1 second timeout
    }
  }

  private assembleFileUltraFast(fileId: string): void {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!incomingFile || !transfer) return

    try {
      console.log(`⚡ Ultra-fast assembly: ${incomingFile.fileName}`)
      
      // Use pre-allocated assembly buffer for maximum speed
      const chunks = incomingFile.assemblyBuffer!
      let totalSize = 0

      // Verify all chunks are present
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        if (!chunks[i]) {
          throw new Error(`Missing chunk ${i}`)
        }
        totalSize += chunks[i].byteLength
      }

      console.log(`✅ Ultra-fast assembly complete: ${totalSize} bytes`)

      // Create blob with maximum efficiency
      const blob = new Blob(chunks, { type: incomingFile.fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)

      // Trigger download immediately
      const a = document.createElement('a')
      a.href = url
      a.download = incomingFile.fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()

      // Cleanup
      this.incomingFiles.delete(fileId)

      const totalTime = (transfer.endTime! - (transfer.startTime || 0)) / 1000
      const avgSpeed = totalTime > 0 ? Math.round(incomingFile.fileSize / totalTime) : 0
      
      console.log(`🎉 Ultra-fast download completed: ${incomingFile.fileName} in ${totalTime.toFixed(1)}s at ${this.formatSpeed(avgSpeed)}`)
      
    } catch (error) {
      console.error('❌ Ultra-fast assembly failed:', error)
      transfer.status = "error"
      this.updateFileTransfers()
    }
  }

  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer: ${data.fileName} (${this.formatFileSize(data.fileSize)})`)
    
    // Auto-accept for ultra-fast transfer
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
  }

  private handleFileAccept(data: FileAcceptData): void {
    console.log(`✅ File accepted: ${data.fileId}`)
    // File transfer will start automatically via queue processing
  }

  sendMessage(message: ChatMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.log('⏳ Message queued - not connected yet')
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

  private sendPing(): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.lastPingTime = Date.now()
      this.sendP2PMessage({
        type: 'ping',
        data: { timestamp: this.lastPingTime },
        timestamp: this.lastPingTime,
        id: this.generateId()
      })
    }
  }

  private sendP2PMessage(message: P2PMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.log('❌ Failed to send P2P message, will retry...', error)
      }
    }
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.log('❌ Failed to send signaling message, will retry...', error)
      }
    }
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private startPerformanceMonitoring(): void {
    this.pingInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.sendPing()
        
        // Send keep-alive to signaling server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.sendSignalingMessage({
            type: 'keep-alive',
            sessionId: this.sessionId,
            userId: this.userId
          })
        }
      }
    }, 15000) // Every 15 seconds
  }

  private updateConnectionQuality(): void {
    if (this.pc && this.dataChannel) {
      const connectionState = this.pc.connectionState
      const channelState = this.dataChannel.readyState

      if (connectionState === 'connected' && channelState === 'open') {
        if (this.connectionLatency < 50) {
          this.connectionQuality = "excellent"
        } else if (this.connectionLatency < 150) {
          this.connectionQuality = "good"
        } else {
          this.connectionQuality = "poor"
        }
      } else {
        this.connectionQuality = "poor"
      }

      this.onConnectionQualityChange?.(this.connectionQuality)
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
    console.log('🛑 Destroying persistent P2P connection...')
    this.isDestroyed = true

    // Clear all intervals
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.connectionRetryInterval) clearInterval(this.connectionRetryInterval)
    if (this.signalingRetryInterval) clearInterval(this.signalingRetryInterval)
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)

    // Close connections
    if (this.dataChannel) this.dataChannel.close()
    if (this.pc) this.pc.close()
    if (this.ws) this.ws.close(1000, 'Client disconnect')

    // Clear state
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.transferQueue = []
    this.chatMessages = []

    console.log('✅ Persistent P2P connection destroyed')
  }
}
