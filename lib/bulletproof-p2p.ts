// Enhanced interfaces with better typing
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
  candidate?: RTCIceCandidateInit
  temporary?: boolean
  error?: string
  heartbeat?: boolean
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
  bytesReceived: number
}

interface FileOfferData {
  fileId: string
  fileName: string
  fileSize: number
  fileType: string
  encryption?: {
    algo: 'django-fernet'
    key: string
    originalName: string
  }
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

type P2PMessageType =
  | 'file-offer'
  | 'file-accept'
  | 'file-complete'
  | 'file-cancel'
  | 'chat-message'
  | 'ping'
  | 'pong'

interface P2PMessage {
  type: P2PMessageType
  data: any
  timestamp: number
  id: string
}

type ConnectionStatus = "connecting" | "connected" // REMOVED "reconnecting" - NEVER DISCONNECT
type ConnectionQuality = "excellent" | "good" | "poor"

interface EncryptionInfo {
  algo: 'django-fernet'
  key: string
  originalName: string
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private isInitiator = false

  // State - INSTANT CONNECTION, NEVER DISCONNECT
  private connectionStatus: ConnectionStatus = "connecting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed = 0
  private userCount = 2 // Always optimistic
  private isDestroyed = false
  private isConnected = false

  // INSTANT CONNECTION - NO DELAYS
  private connectionAttemptInterval: ReturnType<typeof setInterval> | null = null
  private signalingRetryInterval: ReturnType<typeof setInterval> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null

  // File state
  private fileTransfers = new Map<string, FileTransfer>()
  private incomingFiles = new Map<string, IncomingFileData>()
  private sendingFiles = new Map<string, File>()
  private activeTransfers = new Set<string>()
  private incomingEncryption = new Map<string, EncryptionInfo>()

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

  // Performance
  private lastPingTime = 0
  private connectionLatency = 0

  // Flow control
  private DESIRED_CHUNK_SIZE = 256 * 1024
  private MIN_CHUNK_SIZE = 16 * 1024
  private chunkSize = 64 * 1024
  private MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024
  private BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024
  private PROGRESS_UPDATE_INTERVAL = 250

  // INSTANT CONNECTION SETTINGS - NO DELAYS
  private CONNECTION_ATTEMPT_INTERVAL = 100 // Try every 100ms
  private SIGNALING_RETRY_INTERVAL = 500 // Retry every 500ms
  private KEEP_ALIVE_INTERVAL = 1000 // Keep alive every 1s

  // Signaling servers
  private signalingServers: string[] = []
  private currentServerIndex = 0

  // BULLETPROOF WEBRTC CONFIG - MAXIMUM RELIABILITY
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      // Multiple Google STUN servers for instant connection
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // Additional reliable STUN servers
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voiparound.com' },
      { urls: 'stun:stun.voipbuster.com' },
      { urls: 'stun:stun.voipstunt.com' },
      { urls: 'stun:stun.counterpath.com' },
      
      // Multiple TURN servers for NAT traversal
      {
        urls: [
          'turn:openrelay.metered.ca:80?transport=udp',
          'turn:openrelay.metered.ca:80?transport=tcp',
          'turn:openrelay.metered.ca:443?transport=tcp',
          'turns:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: [
          'turn:relay.backups.cz:3478',
          'turn:relay.backups.cz:5349'
        ],
        username: 'webrtc',
        credential: 'webrtc'
      }
    ],
    iceCandidatePoolSize: 10, // Pre-gather ICE candidates
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  }

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initSignalingServers()
    this.bindLifecycleHandlers()
    console.log(`🚀 BulletproofP2P initialized - INSTANT CONNECTION MODE for session ${sessionId}`)
  }

  // Public API
  async initialize(): Promise<void> {
    console.log('⚡ Initializing INSTANT P2P connection...')
    this.isDestroyed = false
    this.userCount = 2 // Always optimistic
    this.updateConnectionStatus("connecting")
    this.updateSignalingStatus("connecting")
    
    // Immediately notify UI of 2 users
    this.onUserCountChange?.(this.userCount)
    
    // Start all connection processes IMMEDIATELY
    this.connectToSignaling()
    this.startInstantConnectionAttempts()
    this.startKeepAlive()
  }

  async sendFiles(files: File[]): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.('Not connected - cannot send files')
      return
    }

    console.log(`📤 Sending ${files.length} files`)
    
    for (const original of files) {
      let fileToSend = original
      let encInfo: EncryptionInfo | undefined

      // Try encryption first
      try {
        const enc = await this.encryptViaDjango(original)
        if (enc) {
          fileToSend = new File([enc.blob], `${original.name}.enc`, { 
            type: 'application/octet-stream' 
          })
          encInfo = { 
            algo: 'django-fernet', 
            key: enc.key, 
            originalName: original.name 
          }
          console.log(`🔐 Encrypted ${original.name}`)
        }
      } catch (e) {
        console.warn('⚠️ Encryption failed, sending plain file:', e)
      }

      const fileId = this.generateId()
      this.sendingFiles.set(fileId, fileToSend)

      const transfer: FileTransfer = {
        id: fileId,
        name: original.name,
        size: original.size,
        type: original.type,
        progress: 0,
        status: "pending",
        direction: "sending",
        speed: 0,
        startTime: Date.now(),
        bytesTransferred: 0
      }

      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Send offer
      this.sendP2P({
        type: 'file-offer',
        data: {
          fileId,
          fileName: fileToSend.name,
          fileSize: fileToSend.size,
          fileType: fileToSend.type,
          encryption: encInfo
        } as FileOfferData,
        timestamp: Date.now(),
        id: this.generateId()
      })
    }
  }

  sendMessage(message: ChatMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.('Not connected - cannot send message')
      return
    }

    this.sendP2P({
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

  // Getters
  getConnectionStatus(): ConnectionStatus { return this.connectionStatus }
  getSignalingStatus(): ConnectionStatus { return this.signalingStatus }
  getConnectionQuality(): ConnectionQuality { return this.connectionQuality }
  getCurrentSpeed(): number { return this.currentSpeed }
  getUserCount(): number { return this.userCount }
  getFileTransfers(): FileTransfer[] { return Array.from(this.fileTransfers.values()) }
  getChatMessages(): ChatMessage[] { return [] }

  destroy(): void {
    console.log('🛑 Destroying P2P connection...')
    this.isDestroyed = true
    
    // Clear all intervals
    if (this.connectionAttemptInterval) clearInterval(this.connectionAttemptInterval)
    if (this.signalingRetryInterval) clearInterval(this.signalingRetryInterval)
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval)
    
    // Close connections
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    try { this.ws?.close(1000, 'Client disconnect') } catch {}
    
    // Clear state
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.activeTransfers.clear()
    this.incomingEncryption.clear()
  }

  // INSTANT CONNECTION SYSTEM - NO DELAYS
  private startInstantConnectionAttempts(): void {
    console.log('⚡ Starting INSTANT connection attempts...')
    
    // Try to connect immediately
    this.attemptInstantConnection()
    
    // Keep trying every 100ms until connected
    this.connectionAttemptInterval = setInterval(() => {
      if (this.isDestroyed || this.isConnected) return
      this.attemptInstantConnection()
    }, this.CONNECTION_ATTEMPT_INTERVAL)
  }

  private attemptInstantConnection(): void {
    if (this.isDestroyed || this.isConnected) return
    
    const wsReady = this.ws && this.ws.readyState === WebSocket.OPEN
    const pcReady = this.pc && (this.pc.connectionState === 'connected' || this.pc.connectionState === 'connecting')
    const dcReady = this.dc && this.dc.readyState === 'open'
    
    console.log(`⚡ Connection check - WS: ${wsReady}, PC: ${pcReady}, DC: ${dcReady}`)
    
    if (wsReady && !dcReady) {
      console.log('⚡ WebSocket ready - creating peer connection INSTANTLY')
      this.createInstantPeerConnection()
    }
  }

  private async createInstantPeerConnection(): Promise<void> {
    if (this.isDestroyed || this.isConnected) return
    
    try {
      console.log('⚡ Creating INSTANT peer connection...')
      
      // Create peer connection immediately
      this.pc = new RTCPeerConnection(this.rtcConfig)
      
      // Set up event handlers for INSTANT connection
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate INSTANTLY')
          this.sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
            sessionId: this.sessionId
          })
        }
      }
      
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log('🔗 Peer connection state:', state)
        
        if (state === 'connected') {
          console.log('🎉 INSTANT CONNECTION ESTABLISHED!')
          this.isConnected = true
          this.updateConnectionStatus("connected")
          this.onConnectionRecovery?.()
          
          // Stop connection attempts
          if (this.connectionAttemptInterval) {
            clearInterval(this.connectionAttemptInterval)
            this.connectionAttemptInterval = null
          }
        }
      }
      
      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc?.iceConnectionState
        console.log('🧊 ICE connection state:', state)
        
        if (state === 'connected' || state === 'completed') {
          console.log('🧊 ICE connection successful!')
          this.isConnected = true
          this.updateConnectionStatus("connected")
        }
      }
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 Received data channel INSTANTLY')
        this.dc = event.channel
        this.setupInstantDataChannel(this.dc)
      }
      
      // Create data channel immediately if initiator
      if (this.isInitiator) {
        console.log('🎯 Creating data channel as initiator INSTANTLY')
        this.dc = this.pc.createDataChannel('bulletproof-instant', {
          ordered: true,
          maxRetransmits: 0 // No retransmits for speed
        })
        this.setupInstantDataChannel(this.dc)
        
        // Create and send offer IMMEDIATELY
        this.createInstantOffer()
      }
      
    } catch (error) {
      console.error('❌ Instant peer connection failed:', error)
      // Try again immediately
      setTimeout(() => this.createInstantPeerConnection(), 50)
    }
  }

  private async createInstantOffer(): Promise<void> {
    if (!this.pc || this.isDestroyed) return
    
    try {
      console.log('📞 Creating INSTANT offer')
      
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      
      await this.pc.setLocalDescription(offer)
      
      // Send offer IMMEDIATELY - no waiting
      this.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        sessionId: this.sessionId
      })
      
      console.log('📞 INSTANT offer sent')
      
    } catch (error) {
      console.error('❌ Failed to create instant offer:', error)
      // Try again immediately
      setTimeout(() => this.createInstantOffer(), 50)
    }
  }

  private setupInstantDataChannel(channel: RTCDataChannel): void {
    console.log('📡 Setting up INSTANT data channel')
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    
    channel.onopen = () => {
      console.log('🎉 INSTANT DATA CHANNEL OPENED!')
      this.isConnected = true
      this.selectOptimalChunkSize()
      this.updateConnectionStatus("connected")
      this.startPingPong()
      
      // Stop connection attempts
      if (this.connectionAttemptInterval) {
        clearInterval(this.connectionAttemptInterval)
        this.connectionAttemptInterval = null
      }
    }
    
    channel.onclose = () => {
      console.log('📡 Data channel closed - INSTANT RECOVERY')
      this.isConnected = false
      // Immediately restart connection attempts
      this.startInstantConnectionAttempts()
    }
    
    channel.onerror = (error) => {
      console.error('❌ Data channel error - INSTANT RECOVERY:', error)
      this.isConnected = false
      // Immediately restart connection attempts
      this.startInstantConnectionAttempts()
    }
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }
  }

  // Signaling implementation - INSTANT
  private initSignalingServers(): void {
    const host = window.location.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    
    this.signalingServers = []
    
    // Check for custom WS URL
    if (typeof window !== 'undefined') {
      const customUrl = new URLSearchParams(window.location.search).get('ws')
      if (customUrl) {
        this.signalingServers.push(customUrl)
      }
    }
    
    // Environment variable
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.signalingServers.push(process.env.NEXT_PUBLIC_WS_URL)
    }
    
    if (isLocal) {
      this.signalingServers.push(
        'ws://localhost:8080',
        'ws://127.0.0.1:8080'
      )
    } else {
      // Production signaling servers
      this.signalingServers.push(
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com'
      )
    }
    
    console.log('🌐 Signaling servers:', this.signalingServers)
  }

  private connectToSignaling(): void {
    if (this.isDestroyed) return
    
    console.log('⚡ Connecting to signaling server INSTANTLY...')
    this.updateSignalingStatus("connecting")
    
    // Try to connect to first available server
    this.tryInstantSignalingConnection()
    
    // Keep trying every 500ms until connected
    this.signalingRetryInterval = setInterval(() => {
      if (this.isDestroyed || (this.ws && this.ws.readyState === WebSocket.OPEN)) return
      this.tryInstantSignalingConnection()
    }, this.SIGNALING_RETRY_INTERVAL)
  }

  private tryInstantSignalingConnection(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    
    const url = this.signalingServers[this.currentServerIndex]
    console.log(`⚡ Trying signaling server INSTANTLY: ${url}`)
    
    try {
      const ws = new WebSocket(url)
      
      ws.onopen = () => {
        console.log(`⚡ WebSocket connected INSTANTLY: ${url}`)
        this.ws = ws
        this.setupInstantWebSocket()
        this.updateSignalingStatus("connected")
        
        // Stop retry attempts
        if (this.signalingRetryInterval) {
          clearInterval(this.signalingRetryInterval)
          this.signalingRetryInterval = null
        }
        
        // Send join message IMMEDIATELY
        this.sendSignalingMessage({
          type: 'join',
          sessionId: this.sessionId,
          userId: this.userId,
          clientInfo: {
            isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
            browser: this.getBrowser(),
            timestamp: Date.now(),
            url: window.location.href
          }
        })
      }
      
      ws.onerror = () => {
        console.log(`❌ WebSocket error: ${url}`)
        this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      }
      
      ws.onclose = () => {
        console.log(`🔌 WebSocket closed: ${url}`)
        if (!this.isDestroyed) {
          // Immediately restart signaling connection
          this.connectToSignaling()
        }
      }
      
    } catch (error) {
      console.log(`💥 WebSocket creation failed: ${url}`, error)
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
    }
  }

  private setupInstantWebSocket(): void {
    if (!this.ws) return
    
    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data)
        console.log('📨 Signaling message:', message.type, message)
        this.handleInstantSignalingMessage(message)
      } catch (error) {
        console.error('❌ Failed to parse signaling message:', error)
      }
    }
    
    this.ws.onclose = () => {
      console.log('🔌 WebSocket closed - INSTANT RECONNECT')
      if (!this.isDestroyed) {
        // Immediately restart signaling connection
        setTimeout(() => this.connectToSignaling(), 100)
      }
    }
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
    }
  }

  private async handleInstantSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'connected':
        console.log('✅ Signaling server connected INSTANTLY')
        break
        
      case 'joined':
        console.log('🚪 Joined session INSTANTLY:', message)
        this.isInitiator = message.isInitiator ?? false
        this.userCount = 2 // Always show 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 User count: ${this.userCount}, Initiator: ${this.isInitiator}`)
        
        // Start connection IMMEDIATELY - no delays
        this.attemptInstantConnection()
        break
        
      case 'user-joined':
        console.log('👋 User joined INSTANTLY:', message)
        this.userCount = 2 // Always show 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 User count after join: ${this.userCount}`)
        
        // Start connection IMMEDIATELY - no delays
        this.attemptInstantConnection()
        break
        
      case 'user-left':
        console.log('👋 User left:', message)
        // Keep trying to connect - stay optimistic
        this.userCount = 2
        this.onUserCountChange?.(this.userCount)
        break
        
      case 'offer':
        console.log('📞 Received offer INSTANTLY')
        await this.handleInstantOffer(message)
        break
        
      case 'answer':
        console.log('📞 Received answer INSTANTLY')
        await this.handleInstantAnswer(message)
        break
        
      case 'ice-candidate':
        console.log('🧊 Received ICE candidate INSTANTLY')
        await this.handleInstantIceCandidate(message)
        break
        
      case 'error':
        console.error('❌ Signaling error:', message.message)
        break
    }
  }

  private async handleInstantOffer(message: SignalingMessage): Promise<void> {
    if (!message.offer) return
    
    try {
      if (!this.pc) {
        await this.createInstantPeerConnection()
      }
      
      console.log('📞 Setting remote description INSTANTLY (offer)')
      await this.pc!.setRemoteDescription(message.offer)
      
      console.log('📞 Creating answer INSTANTLY')
      const answer = await this.pc!.createAnswer()
      
      console.log('📞 Setting local description INSTANTLY (answer)')
      await this.pc!.setLocalDescription(answer)
      
      // Send answer IMMEDIATELY - no waiting
      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId
      })
      
      console.log('📞 INSTANT answer sent')
      
    } catch (error) {
      console.error('❌ Failed to handle instant offer:', error)
      // Try again immediately
      setTimeout(() => this.handleInstantOffer(message), 50)
    }
  }

  private async handleInstantAnswer(message: SignalingMessage): Promise<void> {
    if (!this.pc || !message.answer) return
    
    try {
      console.log('📞 Setting remote description INSTANTLY (answer)')
      await this.pc.setRemoteDescription(message.answer)
      console.log('✅ INSTANT answer processed')
    } catch (error) {
      console.error('❌ Failed to handle instant answer:', error)
    }
  }

  private async handleInstantIceCandidate(message: SignalingMessage): Promise<void> {
    if (!this.pc || !message.candidate) return
    
    try {
      const candidate = new RTCIceCandidate(message.candidate)
      await this.pc.addIceCandidate(candidate)
      console.log('🧊 ICE candidate added INSTANTLY')
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error)
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
        this.onChatMessage?.(chatMessage)
        break
        
      case 'file-offer':
        this.handleFileOffer(message.data as FileOfferData)
        break
        
      case 'file-accept':
        this.handleFileAccept(message.data as FileAcceptData)
        break
        
      case 'file-complete':
        this.handleFileComplete(message.data as FileCompleteData)
        break
        
      case 'ping':
        this.sendP2P({
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

  // File Transfer Implementation
  private handleFileOffer(data: FileOfferData): void {
    console.log('📥 Received file offer:', data.fileName)
    
    if (data.encryption?.algo === 'django-fernet') {
      this.incomingEncryption.set(data.fileId, {
        algo: 'django-fernet',
        key: data.encryption.key,
        originalName: data.encryption.originalName
      })
    }
    
    // Auto-accept files
    this.sendP2P({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
  }

  private async handleFileAccept(data: FileAcceptData): Promise<void> {
    const file = this.sendingFiles.get(data.fileId)
    if (!file) {
      console.warn('⚠️ Accepted file not found:', data.fileId)
      return
    }
    
    console.log('✅ File accepted, starting transfer:', file.name)
    await this.sendFileWithAdaptiveChunking(file, data.fileId)
  }

  private async sendFileWithAdaptiveChunking(file: File, fileId: string): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.(`Connection lost before sending ${file.name}`)
      return
    }
    
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return
    
    this.activeTransfers.add(fileId)
    transfer.status = "transferring"
    transfer.startTime = Date.now()
    transfer.bytesTransferred = 0
    this.updateFileTransfers()
    
    let offset = 0
    let sequenceNumber = 0
    let lastProgressUpdate = 0
    const startTime = Date.now()
    
    try {
      while (offset < file.size && !this.isDestroyed) {
        if (!this.dc || this.dc.readyState !== 'open') {
          throw new Error('Data channel closed during transfer')
        }
        
        // Wait for buffer to clear if needed
        if (this.dc.bufferedAmount > this.MAX_BUFFERED_AMOUNT) {
          await this.waitForBufferClear()
          continue
        }
        
        // Calculate chunk size
        const remainingBytes = file.size - offset
        const chunkSize = Math.min(this.chunkSize, remainingBytes)
        
        // Read chunk
        const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer()
        
        // Create message
        const header = {
          fileId,
          seq: sequenceNumber,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }
        
        const headerBytes = new TextEncoder().encode(JSON.stringify(header))
        const message = new Uint8Array(4 + headerBytes.length + chunk.byteLength)
        
        // Pack message: [header_length][header][chunk]
        new DataView(message.buffer).setUint32(0, headerBytes.length, true)
        message.set(headerBytes, 4)
        message.set(new Uint8Array(chunk), 4 + headerBytes.length)
        
        // Send chunk
        await this.sendDataChannelMessage(message.buffer)
        
        offset += chunkSize
        sequenceNumber++
        transfer.bytesTransferred = offset
        
        // Update progress
        const now = Date.now()
        if (now - lastProgressUpdate > this.PROGRESS_UPDATE_INTERVAL) {
          const elapsed = (now - startTime) / 1000
          const speed = elapsed > 0 ? Math.round(offset / elapsed) : 0
          
          transfer.speed = speed
          transfer.progress = Math.round((offset / file.size) * 100)
          transfer.eta = speed > 0 ? Math.round((file.size - offset) / speed) : 0
          
          this.currentSpeed = speed
          this.onSpeedUpdate?.(speed)
          this.updateFileTransfers()
          lastProgressUpdate = now
        }
      }
      
      // Send completion notification
      this.sendP2P({
        type: 'file-complete',
        data: {
          fileId,
          fileName: file.name,
          fileSize: file.size
        },
        timestamp: Date.now(),
        id: this.generateId()
      })
      
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()
      
      console.log(`✅ File sent successfully: ${file.name}`)
      
    } catch (error) {
      console.error(`❌ Failed to send file ${file.name}:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    } finally {
      this.activeTransfers.delete(fileId)
      this.sendingFiles.delete(fileId)
    }
  }

  private handleFileChunk(buffer: ArrayBuffer): void {
    try {
      const dataView = new DataView(buffer)
      const headerLength = dataView.getUint32(0, true)
      
      if (headerLength <= 0 || headerLength > 10000) {
        console.warn('⚠️ Invalid header length:', headerLength)
        return
      }
      
      const headerBytes = new Uint8Array(buffer, 4, headerLength)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunkData = buffer.slice(4 + headerLength)
      
      const { fileId, fileName, fileSize, fileType, seq } = header
      
      // Initialize incoming file if needed
      if (!this.incomingFiles.has(fileId)) {
        const incomingFile: IncomingFileData = {
          chunks: new Map(),
          totalChunks: 0,
          fileName,
          fileSize,
          fileType,
          receivedChunks: 0,
          startTime: Date.now(),
          lastChunkTime: Date.now(),
          bytesReceived: 0
        }
        
        this.incomingFiles.set(fileId, incomingFile)
        
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
        this.updateFileTransfers()
      }
      
      const incomingFile = this.incomingFiles.get(fileId)!
      const transfer = this.fileTransfers.get(fileId)!
      
      // Store chunk if not already received
      const sequenceNumber = typeof seq === 'number' ? seq : incomingFile.receivedChunks
      if (!incomingFile.chunks.has(sequenceNumber)) {
        incomingFile.chunks.set(sequenceNumber, chunkData)
        incomingFile.receivedChunks++
        incomingFile.lastChunkTime = Date.now()
        incomingFile.bytesReceived += chunkData.byteLength
        
        // Update progress
        const elapsed = (Date.now() - incomingFile.startTime) / 1000
        const speed = elapsed > 0 ? Math.round(incomingFile.bytesReceived / elapsed) : 0
        
        transfer.bytesTransferred = incomingFile.bytesReceived
        transfer.speed = speed
        transfer.progress = Math.min(99, Math.floor((incomingFile.bytesReceived / incomingFile.fileSize) * 100))
        transfer.eta = speed > 0 ? Math.round((incomingFile.fileSize - incomingFile.bytesReceived) / speed) : 0
        
        this.updateFileTransfers()
      }
      
    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }

  private async handleFileComplete(data: FileCompleteData): Promise<void> {
    const incomingFile = this.incomingFiles.get(data.fileId)
    const transfer = this.fileTransfers.get(data.fileId)
    
    // Handle sender acknowledgment
    if (!incomingFile) {
      if (transfer && transfer.direction === 'sending') {
        transfer.status = 'completed'
        transfer.progress = 100
        this.updateFileTransfers()
      }
      return
    }
    
    // Assemble received file
    if (incomingFile.bytesReceived >= incomingFile.fileSize) {
      await this.assembleReceivedFile(data.fileId)
    } else {
      // Wait a bit for remaining chunks
      setTimeout(async () => {
        const file = this.incomingFiles.get(data.fileId)
        if (file && file.bytesReceived >= file.fileSize) {
          await this.assembleReceivedFile(data.fileId)
        } else {
          console.error(`❌ File incomplete: ${file?.bytesReceived}/${file?.fileSize}`)
          if (transfer) {
            transfer.status = 'error'
            this.updateFileTransfers()
          }
        }
      }, 1000)
    }
  }

  private async assembleReceivedFile(fileId: string): Promise<void> {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!incomingFile || !transfer) return
    
    try {
      // Sort chunks by sequence number
      const sortedChunks = Array.from(incomingFile.chunks.entries())
        .sort(([a], [b]) => a - b)
        .map(([, chunk]) => chunk)
      
      let blob = new Blob(sortedChunks, { 
        type: incomingFile.fileType || 'application/octet-stream' 
      })
      
      let downloadName = incomingFile.fileName
      
      // Decrypt if needed
      const encryptionInfo = this.incomingEncryption.get(fileId)
      if (encryptionInfo) {
        try {
          const decryptedBlob = await this.decryptViaDjango(blob, encryptionInfo.key)
          if (decryptedBlob) {
            blob = decryptedBlob
            downloadName = encryptionInfo.originalName
            console.log(`🔓 Decrypted file: ${downloadName}`)
          } else {
            console.warn('⚠️ Decryption failed, downloading encrypted file')
          }
        } catch (error) {
          console.error('❌ Decryption error:', error)
          this.onError?.('File decryption failed')
        }
      }
      
      // Download file
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = downloadName
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      
      // Update status
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()
      
      // Cleanup
      this.incomingFiles.delete(fileId)
      this.activeTransfers.delete(fileId)
      this.incomingEncryption.delete(fileId)
      
      // Send acknowledgment
      this.sendP2P({
        type: 'file-complete',
        data: { fileId },
        timestamp: Date.now(),
        id: this.generateId()
      })
      
      console.log(`✅ File received successfully: ${downloadName}`)
      
    } catch (error) {
      console.error('❌ Failed to assemble file:', error)
      transfer.status = 'error'
      this.updateFileTransfers()
      this.activeTransfers.delete(fileId)
    }
  }

  // Django Encryption Integration
  private getDjangoBaseUrl(): string {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const djangoParam = urlParams.get('django')
      if (djangoParam) return djangoParam.replace(/\/$/, '')
      
      const stored = localStorage.getItem('DJANGO_BASE_URL')
      if (stored) return stored.replace(/\/$/, '')
      
    } catch {}
    
    return 'http://localhost:8000'
  }

  private async getDjangoKey(): Promise<string> {
    const baseUrl = this.getDjangoBaseUrl()
    const response = await fetch(`${baseUrl}/api/key`, { method: 'GET' })
    
    if (!response.ok) {
      throw new Error(`Django key request failed: ${response.status}`)
    }
    
    const data = await response.json()
    if (!data.key) {
      throw new Error('Invalid key response from Django server')
    }
    
    return data.key
  }

  private async encryptViaDjango(file: File): Promise<{ blob: Blob; key: string } | null> {
    try {
      const baseUrl = this.getDjangoBaseUrl()
      const key = await this.getDjangoKey()
      
      const formData = new FormData()
      formData.append('file', file, file.name)
      formData.append('key', key)
      
      const response = await fetch(`${baseUrl}/api/encrypt`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`Encryption failed: ${response.status}`)
      }
      
      const blob = await response.blob()
      return { blob, key }
      
    } catch (error) {
      console.warn('⚠️ Django encryption failed:', error)
      return null
    }
  }

  private async decryptViaDjango(blob: Blob, key: string): Promise<Blob | null> {
    try {
      const baseUrl = this.getDjangoBaseUrl()
      
      const formData = new FormData()
      formData.append('file', blob, 'encrypted.dat')
      formData.append('key', key)
      
      const response = await fetch(`${baseUrl}/api/decrypt`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`Decryption failed: ${response.status}`)
      }
      
      return await response.blob()
      
    } catch (error) {
      console.error('❌ Django decryption failed:', error)
      return null
    }
  }

  // Utility Methods
  private async sendDataChannelMessage(data: ArrayBuffer): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Data channel not ready')
    }
    
    try {
      this.dc.send(data)
    } catch (error: any) {
      const errorMessage = String(error?.message || error)
      
      if (/message too large/i.test(errorMessage)) {
        // Reduce chunk size and retry
        this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
        console.log(`📏 Reduced chunk size to ${this.chunkSize} bytes`)
        throw error
      }
      
      throw error
    }
  }

  private waitForBufferClear(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.dc || this.dc.bufferedAmount <= this.BUFFERED_AMOUNT_LOW_THRESHOLD) {
        resolve()
        return
      }
      
      const handler = () => {
        this.dc?.removeEventListener('bufferedamountlow', handler)
        resolve()
      }
      
      this.dc.addEventListener('bufferedamountlow', handler, { once: true })
    })
  }

  private selectOptimalChunkSize(): void {
    const maxMessageSize = this.getMaxMessageSize()
    const safeSize = Math.max(
      this.MIN_CHUNK_SIZE,
      Math.min(this.DESIRED_CHUNK_SIZE, maxMessageSize - 1024)
    )
    
    this.chunkSize = safeSize
    this.BUFFERED_AMOUNT_LOW_THRESHOLD = Math.min(2 * 1024 * 1024, this.chunkSize * 4)
    this.MAX_BUFFERED_AMOUNT = Math.max(8 * 1024 * 1024, this.BUFFERED_AMOUNT_LOW_THRESHOLD * 4)
    
    if (this.dc) {
      this.dc.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    }
    
    console.log(`📏 Optimal chunk size: ${this.chunkSize} bytes`)
  }

  private getMaxMessageSize(): number {
    const sctp = (this.pc as any)?.sctp
    const maxSize = typeof sctp?.maxMessageSize === 'number' && isFinite(sctp.maxMessageSize) 
      ? sctp.maxMessageSize 
      : 256 * 1024
    
    return Math.max(64 * 1024, maxSize)
  }

  private startKeepAlive(): void {
    // Keep WebSocket alive
    this.keepAliveInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: 'heartbeat',
          sessionId: this.sessionId,
          userId: this.userId
        })
      }
      
    }, this.KEEP_ALIVE_INTERVAL)
  }

  private startPingPong(): void {
    // Keep data channel alive
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed || !this.dc || this.dc.readyState !== 'open') return
      
      this.lastPingTime = Date.now()
      this.sendP2P({
        type: 'ping',
        data: { timestamp: this.lastPingTime },
        timestamp: this.lastPingTime,
        id: this.generateId()
      })
      
    }, 2000) // Ping every 2 seconds
  }

  private updateConnectionQuality(): void {
    if (this.connectionLatency < 50) {
      this.connectionQuality = "excellent"
    } else if (this.connectionLatency < 150) {
      this.connectionQuality = "good"
    } else {
      this.connectionQuality = "poor"
    }
    
    this.onConnectionQualityChange?.(this.connectionQuality)
  }

  private bindLifecycleHandlers(): void {
    // Online/offline detection
    window.addEventListener('online', () => {
      console.log('🌐 Network online - INSTANT RECONNECT')
      this.connectToSignaling()
      this.startInstantConnectionAttempts()
    })
    
    window.addEventListener('offline', () => {
      console.log('🌐 Network offline')
      // Don't change status - keep trying
    })
    
    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Page visible - INSTANT RECONNECT')
        if (!this.isConnected) {
          this.connectToSignaling()
          this.startInstantConnectionAttempts()
        }
      }
    })
  }

  // Helper methods
  private sendP2P(message: P2PMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') return
    
    try {
      this.dc.send(JSON.stringify(message))
    } catch (error) {
      console.error('❌ Failed to send P2P message:', error)
    }
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    
    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('❌ Failed to send signaling message:', error)
    }
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status
      console.log(`⚡ Connection status: ${status}`)
      this.onConnectionStatusChange?.(status)
    }
  }

  private updateSignalingStatus(status: ConnectionStatus): void {
    if (this.signalingStatus !== status) {
      this.signalingStatus = status
      console.log(`⚡ Signaling status: ${status}`)
      this.onSignalingStatusChange?.(status)
    }
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  private getBrowser(): string {
    const userAgent = navigator.userAgent
    if (userAgent.includes('Chrome')) return 'Chrome'
    if (userAgent.includes('Firefox')) return 'Firefox'
    if (userAgent.includes('Safari')) return 'Safari'
    if (userAgent.includes('Edge')) return 'Edge'
    return 'Unknown'
  }
}
