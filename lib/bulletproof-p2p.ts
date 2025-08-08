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

  // State - BULLETPROOF CONNECTION
  private connectionStatus: ConnectionStatus = "connecting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed = 0
  private userCount = 2 // Always optimistic
  private isDestroyed = false
  private isConnected = false
  private connectionEstablished = false

  // Connection state tracking
  private hasLocalDescription = false
  private hasRemoteDescription = false
  private pendingIceCandidates: RTCIceCandidateInit[] = []
  private connectionAttempts = 0
  private maxConnectionAttempts = 100 // Keep trying

  // AGGRESSIVE TIMERS - FORCE CONNECTION
  private connectionForceInterval: ReturnType<typeof setInterval> | null = null
  private signalingRetryInterval: ReturnType<typeof setInterval> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null
  private connectionHealthCheck: ReturnType<typeof setInterval> | null = null

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

  // BULLETPROOF SETTINGS - FORCE CONNECTION
  private CONNECTION_FORCE_INTERVAL = 200 // Force every 200ms
  private SIGNALING_RETRY_INTERVAL = 300 // Retry every 300ms
  private KEEP_ALIVE_INTERVAL = 1000 // Keep alive every 1s
  private HEALTH_CHECK_INTERVAL = 2000 // Health check every 2s

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
    console.log(`🚀 BulletproofP2P initialized - BULLETPROOF MODE for session ${sessionId}`)
  }

  // Public API
  async initialize(): Promise<void> {
    console.log('⚡ Initializing BULLETPROOF P2P connection...')
    this.isDestroyed = false
    this.connectionAttempts = 0
    this.userCount = 2 // Always optimistic
    this.updateConnectionStatus("connecting")
    this.updateSignalingStatus("connecting")
    
    // Immediately notify UI of 2 users
    this.onUserCountChange?.(this.userCount)
    
    // Start all connection processes IMMEDIATELY
    await this.connectToSignaling()
    this.startConnectionForcing()
    this.startKeepAlive()
    this.startHealthCheck()
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
    if (this.connectionForceInterval) clearInterval(this.connectionForceInterval)
    if (this.signalingRetryInterval) clearInterval(this.signalingRetryInterval)
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval)
    if (this.connectionHealthCheck) clearInterval(this.connectionHealthCheck)
    
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

  // BULLETPROOF CONNECTION FORCING SYSTEM
  private startConnectionForcing(): void {
    console.log('⚡ Starting BULLETPROOF connection forcing...')
    
    // Force connection immediately
    this.forceConnection()
    
    // Keep forcing every 200ms until connected
    this.connectionForceInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      if (!this.connectionEstablished) {
        this.forceConnection()
      } else {
        // Stop forcing once connected
        if (this.connectionForceInterval) {
          clearInterval(this.connectionForceInterval)
          this.connectionForceInterval = null
          console.log('✅ Connection established - stopping force attempts')
        }
      }
    }, this.CONNECTION_FORCE_INTERVAL)
  }

  private forceConnection(): void {
    if (this.isDestroyed || this.connectionEstablished) return
    
    this.connectionAttempts++
    console.log(`⚡ FORCING connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`)
    
    const wsReady = this.ws && this.ws.readyState === WebSocket.OPEN
    const pcExists = this.pc && this.pc.connectionState !== 'closed' && this.pc.connectionState !== 'failed'
    const dcReady = this.dc && this.dc.readyState === 'open'
    
    console.log(`⚡ Force check - WS: ${wsReady}, PC: ${pcExists}, DC: ${dcReady}, Initiator: ${this.isInitiator}`)
    
    if (!wsReady) {
      console.log('⚡ WebSocket not ready - forcing signaling connection')
      this.connectToSignaling()
      return
    }
    
    if (!pcExists) {
      console.log('⚡ Peer connection not ready - creating BULLETPROOF connection')
      this.createBulletproofPeerConnection()
      return
    }
    
    if (pcExists && !dcReady && this.isInitiator) {
      console.log('⚡ Data channel not ready - creating as initiator')
      this.createDataChannelAsInitiator()
      return
    }
    
    // If we have everything but not connected, force offer/answer exchange
    if (wsReady && pcExists && !this.connectionEstablished) {
      if (this.isInitiator && !this.hasLocalDescription) {
        console.log('⚡ Forcing offer creation')
        this.createBulletproofOffer()
      }
    }
  }

  private async createBulletproofPeerConnection(): Promise<void> {
    if (this.isDestroyed) return
    
    try {
      console.log('⚡ Creating BULLETPROOF peer connection...')
      
      // Close existing connection
      if (this.pc) {
        try { this.pc.close() } catch {}
      }
      
      // Reset state
      this.hasLocalDescription = false
      this.hasRemoteDescription = false
      this.pendingIceCandidates = []
      
      // Create new peer connection
      this.pc = new RTCPeerConnection(this.rtcConfig)
      
      // Set up BULLETPROOF event handlers
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate IMMEDIATELY')
          this.sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
            sessionId: this.sessionId,
            userId: this.userId
          })
        } else {
          console.log('🧊 ICE gathering complete')
        }
      }
      
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log('🔗 Peer connection state:', state)
        
        switch (state) {
          case 'connected':
            console.log('🎉 BULLETPROOF CONNECTION ESTABLISHED!')
            this.connectionEstablished = true
            this.isConnected = true
            this.updateConnectionStatus("connected")
            this.onConnectionRecovery?.()
            break
          case 'failed':
          case 'disconnected':
          case 'closed':
            console.log('💥 Peer connection failed - FORCING RECOVERY')
            this.connectionEstablished = false
            this.isConnected = false
            this.updateConnectionStatus("connecting")
            // Force immediate recovery
            setTimeout(() => this.forceConnection(), 100)
            break
        }
      }
      
      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc?.iceConnectionState
        console.log('🧊 ICE connection state:', state)
        
        if (state === 'connected' || state === 'completed') {
          console.log('🧊 ICE connection successful!')
          this.connectionEstablished = true
          this.isConnected = true
          this.updateConnectionStatus("connected")
        } else if (state === 'failed') {
          console.log('💥 ICE connection failed - FORCING RECOVERY')
          this.connectionEstablished = false
          this.isConnected = false
          setTimeout(() => this.forceConnection(), 100)
        }
      }
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 Received data channel IMMEDIATELY')
        this.dc = event.channel
        this.setupBulletproofDataChannel(this.dc)
      }
      
      // If initiator, create data channel immediately
      if (this.isInitiator) {
        this.createDataChannelAsInitiator()
      }
      
      console.log('✅ BULLETPROOF peer connection created')
      
    } catch (error) {
      console.error('❌ Failed to create bulletproof peer connection:', error)
      // Force retry immediately
      setTimeout(() => this.createBulletproofPeerConnection(), 100)
    }
  }

  private createDataChannelAsInitiator(): void {
    if (!this.pc || this.isDestroyed) return
    
    try {
      console.log('⚡ Creating data channel as BULLETPROOF initiator')
      
      this.dc = this.pc.createDataChannel('bulletproof-data', {
        ordered: true,
        maxRetransmits: 3
      })
      
      this.setupBulletproofDataChannel(this.dc)
      
      // Create offer immediately
      setTimeout(() => this.createBulletproofOffer(), 100)
      
    } catch (error) {
      console.error('❌ Failed to create data channel:', error)
      setTimeout(() => this.createDataChannelAsInitiator(), 100)
    }
  }

  private async createBulletproofOffer(): Promise<void> {
    if (!this.pc || this.isDestroyed || this.hasLocalDescription) return
    
    try {
      console.log('⚡ Creating BULLETPROOF offer')
      
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      
      await this.pc.setLocalDescription(offer)
      this.hasLocalDescription = true
      
      // Send offer IMMEDIATELY
      this.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        sessionId: this.sessionId,
        userId: this.userId
      })
      
      console.log('⚡ BULLETPROOF offer sent')
      
    } catch (error) {
      console.error('❌ Failed to create bulletproof offer:', error)
      this.hasLocalDescription = false
      // Retry immediately
      setTimeout(() => this.createBulletproofOffer(), 100)
    }
  }

  private setupBulletproofDataChannel(channel: RTCDataChannel): void {
    console.log('⚡ Setting up BULLETPROOF data channel')
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    
    channel.onopen = () => {
      console.log('🎉 BULLETPROOF DATA CHANNEL OPENED!')
      this.connectionEstablished = true
      this.isConnected = true
      this.selectOptimalChunkSize()
      this.updateConnectionStatus("connected")
      this.startPingPong()
    }
    
    channel.onclose = () => {
      console.log('📡 Data channel closed - BULLETPROOF RECOVERY')
      this.connectionEstablished = false
      this.isConnected = false
      this.updateConnectionStatus("connecting")
      // Force immediate recovery
      setTimeout(() => this.forceConnection(), 100)
    }
    
    channel.onerror = (error) => {
      console.error('❌ Data channel error - BULLETPROOF RECOVERY:', error)
      this.connectionEstablished = false
      this.isConnected = false
      this.updateConnectionStatus("connecting")
      // Force immediate recovery
      setTimeout(() => this.forceConnection(), 100)
    }
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }
  }

  private startHealthCheck(): void {
    console.log('⚡ Starting BULLETPROOF health check...')
    
    this.connectionHealthCheck = setInterval(() => {
      if (this.isDestroyed) return
      
      const wsHealthy = this.ws && this.ws.readyState === WebSocket.OPEN
      const pcHealthy = this.pc && this.pc.connectionState === 'connected'
      const dcHealthy = this.dc && this.dc.readyState === 'open'
      
      console.log(`⚡ Health check - WS: ${wsHealthy}, PC: ${pcHealthy}, DC: ${dcHealthy}`)
      
      if (!wsHealthy) {
        console.log('⚡ WebSocket unhealthy - forcing reconnection')
        this.connectToSignaling()
      }
      
      if (!pcHealthy || !dcHealthy) {
        console.log('⚡ P2P connection unhealthy - forcing recovery')
        this.connectionEstablished = false
        this.isConnected = false
        this.forceConnection()
      }
      
    }, this.HEALTH_CHECK_INTERVAL)
  }

  // Signaling implementation - BULLETPROOF
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

  private async connectToSignaling(): Promise<void> {
    if (this.isDestroyed) return
    
    console.log('⚡ Connecting to signaling server BULLETPROOF...')
    this.updateSignalingStatus("connecting")
    
    // Try to connect immediately
    const connected = await this.tryBulletproofSignalingConnection()
    
    if (!connected) {
      // Start retry interval if not connected
      if (!this.signalingRetryInterval) {
        this.signalingRetryInterval = setInterval(async () => {
          if (this.isDestroyed || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
            if (this.signalingRetryInterval) {
              clearInterval(this.signalingRetryInterval)
              this.signalingRetryInterval = null
            }
            return
          }
          
          await this.tryBulletproofSignalingConnection()
        }, this.SIGNALING_RETRY_INTERVAL)
      }
    }
  }

  private async tryBulletproofSignalingConnection(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return true
    
    const url = this.signalingServers[this.currentServerIndex]
    console.log(`⚡ Trying BULLETPROOF signaling: ${url}`)
    
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url)
        let settled = false
        
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            console.log(`⏰ Signaling timeout: ${url}`)
            try { ws.close() } catch {}
            this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
            resolve(false)
          }
        }, 5000)
        
        ws.onopen = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          
          console.log(`⚡ BULLETPROOF WebSocket connected: ${url}`)
          this.ws = ws
          this.setupBulletproofWebSocket()
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
          
          resolve(true)
        }
        
        ws.onerror = () => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            console.log(`❌ WebSocket error: ${url}`)
            this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
            resolve(false)
          }
        }
        
        ws.onclose = () => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            console.log(`🔌 WebSocket closed: ${url}`)
            resolve(false)
          }
        }
        
      } catch (error) {
        console.log(`💥 WebSocket creation failed: ${url}`, error)
        this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
        resolve(false)
      }
    })
  }

  private setupBulletproofWebSocket(): void {
    if (!this.ws) return
    
    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data)
        console.log('📨 Signaling message:', message.type, message)
        this.handleBulletproofSignalingMessage(message)
      } catch (error) {
        console.error('❌ Failed to parse signaling message:', error)
      }
    }
    
    this.ws.onclose = () => {
      console.log('🔌 WebSocket closed - BULLETPROOF RECONNECT')
      this.updateSignalingStatus("connecting")
      if (!this.isDestroyed) {
        // Immediately restart signaling connection
        setTimeout(() => this.connectToSignaling(), 100)
      }
    }
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
    }
  }

  private async handleBulletproofSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'connected':
        console.log('✅ Signaling server connected BULLETPROOF')
        break
        
      case 'joined':
        console.log('🚪 Joined session BULLETPROOF:', message)
        this.isInitiator = message.isInitiator ?? false
        this.userCount = 2 // Always show 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 User count: ${this.userCount}, Initiator: ${this.isInitiator}`)
        
        // Force connection IMMEDIATELY
        setTimeout(() => this.forceConnection(), 50)
        break
        
      case 'user-joined':
        console.log('👋 User joined BULLETPROOF:', message)
        this.userCount = 2 // Always show 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 User count after join: ${this.userCount}`)
        
        // Force connection IMMEDIATELY
        setTimeout(() => this.forceConnection(), 50)
        break
        
      case 'user-left':
        console.log('👋 User left:', message)
        // Keep trying to connect - stay optimistic
        this.userCount = 2
        this.onUserCountChange?.(this.userCount)
        break
        
      case 'offer':
        console.log('📞 Received offer BULLETPROOF')
        await this.handleBulletproofOffer(message)
        break
        
      case 'answer':
        console.log('📞 Received answer BULLETPROOF')
        await this.handleBulletproofAnswer(message)
        break
        
      case 'ice-candidate':
        console.log('🧊 Received ICE candidate BULLETPROOF')
        await this.handleBulletproofIceCandidate(message)
        break
        
      case 'error':
        console.error('❌ Signaling error:', message.message)
        break
    }
  }

  private async handleBulletproofOffer(message: SignalingMessage): Promise<void> {
    if (!message.offer) return
    
    try {
      // Ensure we have a peer connection
      if (!this.pc || this.pc.connectionState === 'closed' || this.pc.connectionState === 'failed') {
        await this.createBulletproofPeerConnection()
      }
      
      if (!this.pc) return
      
      console.log('📞 Setting remote description BULLETPROOF (offer)')
      await this.pc.setRemoteDescription(new RTCSessionDescription(message.offer))
      this.hasRemoteDescription = true
      
      // Process pending ICE candidates
      for (const candidate of this.pendingIceCandidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
          console.log('🧊 Added buffered ICE candidate')
        } catch (error) {
          console.warn('⚠️ Failed to add buffered ICE candidate:', error)
        }
      }
      this.pendingIceCandidates = []
      
      console.log('📞 Creating answer BULLETPROOF')
      const answer = await this.pc.createAnswer()
      
      console.log('📞 Setting local description BULLETPROOF (answer)')
      await this.pc.setLocalDescription(answer)
      this.hasLocalDescription = true
      
      // Send answer IMMEDIATELY
      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId,
        userId: this.userId
      })
      
      console.log('📞 BULLETPROOF answer sent')
      
    } catch (error) {
      console.error('❌ Failed to handle bulletproof offer:', error)
      // Reset and retry
      this.hasRemoteDescription = false
      this.hasLocalDescription = false
      setTimeout(() => this.handleBulletproofOffer(message), 100)
    }
  }

  private async handleBulletproofAnswer(message: SignalingMessage): Promise<void> {
    if (!this.pc || !message.answer) return
    
    try {
      console.log('📞 Setting remote description BULLETPROOF (answer)')
      await this.pc.setRemoteDescription(new RTCSessionDescription(message.answer))
      this.hasRemoteDescription = true
      
      // Process pending ICE candidates
      for (const candidate of this.pendingIceCandidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
          console.log('🧊 Added buffered ICE candidate')
        } catch (error) {
          console.warn('⚠️ Failed to add buffered ICE candidate:', error)
        }
      }
      this.pendingIceCandidates = []
      
      console.log('✅ BULLETPROOF answer processed')
      
    } catch (error) {
      console.error('❌ Failed to handle bulletproof answer:', error)
      this.hasRemoteDescription = false
    }
  }

  private async handleBulletproofIceCandidate(message: SignalingMessage): Promise<void> {
    if (!message.candidate) return
    
    try {
      if (!this.pc || !this.hasRemoteDescription) {
        // Buffer the candidate
        console.log('🧊 Buffering ICE candidate for later')
        this.pendingIceCandidates.push(message.candidate)
        return
      }
      
      const candidate = new RTCIceCandidate(message.candidate)
      await this.pc.addIceCandidate(candidate)
      console.log('🧊 ICE candidate added BULLETPROOF')
      
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error)
      // Buffer it for later
      if (this.pendingIceCandidates.length < 20) {
        this.pendingIceCandidates.push(message.candidate)
      }
    }
  }

  private handleDataChannelMessage(data: any): void {
    try {
      if (typeof data === 'string') {
        const message: P2PMessage = JSON.parse(data)
        this.handleP2PMessage(message)
      } else if (data instanceof ArrayBuffer) {
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
      console.log('🌐 Network online - BULLETPROOF RECONNECT')
      this.connectToSignaling()
      this.forceConnection()
    })
    
    window.addEventListener('offline', () => {
      console.log('🌐 Network offline')
      // Don't change status - keep trying
    })
    
    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Page visible - BULLETPROOF RECONNECT')
        if (!this.connectionEstablished) {
          this.connectToSignaling()
          this.forceConnection()
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
