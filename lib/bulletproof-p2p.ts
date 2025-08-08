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

type ConnectionStatus = "connecting" | "connected" | "reconnecting" // REMOVED "waiting"
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

  // State - AGGRESSIVE CONNECTION MODE
  private connectionStatus: ConnectionStatus = "connecting" // Always start connecting
  private signalingStatus: ConnectionStatus = "connecting" // Always start connecting
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed = 0
  private userCount = 2 // ASSUME 2 USERS IMMEDIATELY - be optimistic
  private isDestroyed = false
  private lastSuccessfulConnection = 0

  // Timers - MORE AGGRESSIVE
  private connectionRetryTimeout: ReturnType<typeof setTimeout> | null = null
  private signalingRetryTimeout: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private aggressiveConnectInterval: ReturnType<typeof setInterval> | null = null

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

  // AGGRESSIVE RECOVERY SETTINGS
  private ICE_RECOVERY_DELAY = 500 // Faster recovery
  private AGGRESSIVE_CONNECT_INTERVAL = 2000 // Try every 2 seconds
  private CONNECTION_TIMEOUT = 15000 // Shorter timeout

  // Signaling with aggressive retry
  private signalingServers: string[] = []
  private currentServerIndex = 0
  private backoffAttempts = 0
  private SIGNALING_RETRY_BASE = 500 // Faster retry
  private SIGNALING_RETRY_MAX = 3000 // Shorter max delay

  // Enhanced STUN/TURN configuration
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
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
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  }

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initSignalingServers()
    this.bindLifecycleHandlers()
    console.log(`🚀 BulletproofP2P initialized - AGGRESSIVE MODE for session ${sessionId}`)
  }

  // Public API
  async initialize(): Promise<void> {
    console.log('🔄 Initializing AGGRESSIVE P2P connection...')
    this.isDestroyed = false
    this.backoffAttempts = 0
    this.userCount = 2 // OPTIMISTIC: assume 2 users
    this.updateConnectionStatus("connecting")
    this.updateSignalingStatus("connecting")
    
    // Immediately notify UI of 2 users
    this.onUserCountChange?.(this.userCount)
    
    await this.connectToSignaling()
    this.startAggressiveConnection()
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
    
    // Clear all timers
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.aggressiveConnectInterval) clearInterval(this.aggressiveConnectInterval)
    if (this.connectionRetryTimeout) clearTimeout(this.connectionRetryTimeout)
    if (this.signalingRetryTimeout) clearTimeout(this.signalingRetryTimeout)
    
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

  // AGGRESSIVE CONNECTION LOGIC
  private startAggressiveConnection(): void {
    console.log('🔥 Starting AGGRESSIVE connection mode')
    
    // Try to connect immediately
    this.attemptPeerConnection()
    
    // Keep trying every 2 seconds
    this.aggressiveConnectInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      if (this.connectionStatus !== 'connected') {
        console.log('🔥 AGGRESSIVE: Attempting peer connection...')
        this.attemptPeerConnection()
      }
    }, this.AGGRESSIVE_CONNECT_INTERVAL)
  }

  private attemptPeerConnection(): void {
    console.log(`🔗 Attempting peer connection - Status: ${this.connectionStatus}, WS: ${this.ws?.readyState}`)
    
    // Always try to connect if we have signaling
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.initiatePeerConnection()
    }
  }

  // Signaling implementation
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
    
    console.log('🔌 Connecting to signaling server...')
    this.updateSignalingStatus("connecting")
    
    // Try each server
    for (let attempt = 0; attempt < this.signalingServers.length && !this.isDestroyed; attempt++) {
      const url = this.signalingServers[this.currentServerIndex]
      console.log(`🔗 Trying signaling server: ${url}`)
      
      const connected = await this.trySignalingConnection(url)
      if (connected) {
        console.log(`✅ Connected to signaling server: ${url}`)
        this.backoffAttempts = 0
        this.updateSignalingStatus("connected")
        return
      }
      
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      await this.sleep(200) // Faster retry
    }
    
    // All servers failed, schedule retry
    this.scheduleSignalingRetry()
  }

  private trySignalingConnection(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url)
        let settled = false
        
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            console.log(`⏰ Signaling connection timeout: ${url}`)
            try { ws.close() } catch {}
            resolve(false)
          }
        }, 8000) // Shorter timeout
        
        ws.onopen = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          
          console.log(`🎯 WebSocket opened: ${url}`)
          this.ws = ws
          this.setupWebSocket()
          
          // Send join message immediately
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
        
        ws.onerror = (error) => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            console.log(`❌ WebSocket error: ${url}`, error)
            resolve(false)
          }
        }
        
        ws.onclose = (event) => {
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            console.log(`🔌 WebSocket closed: ${url}`, event.code, event.reason)
            resolve(false)
          }
        }
        
      } catch (error) {
        console.log(`💥 WebSocket creation failed: ${url}`, error)
        resolve(false)
      }
    })
  }

  private setupWebSocket(): void {
    if (!this.ws) return
    
    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data)
        console.log('📨 Signaling message:', message.type, message)
        this.handleSignalingMessage(message)
      } catch (error) {
        console.error('❌ Failed to parse signaling message:', error)
      }
    }
    
    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket closed:', event.code, event.reason)
      if (!this.isDestroyed) {
        this.updateSignalingStatus("reconnecting")
        setTimeout(() => this.connectToSignaling(), 500) // Faster reconnect
      }
    }
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
      this.onError?.('Signaling connection error')
    }
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'connected':
        console.log('✅ Signaling server connected')
        break
        
      case 'joined':
        console.log('🚪 Joined session:', message)
        this.isInitiator = message.isInitiator ?? false
        
        // FORCE 2 USERS - be optimistic
        this.userCount = 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 FORCED User count: ${this.userCount}, Initiator: ${this.isInitiator}`)
        
        // IMMEDIATELY start connection attempt
        console.log('🤝 IMMEDIATELY attempting P2P connection')
        this.updateConnectionStatus("connecting")
        this.initiatePeerConnection()
        break
        
      case 'user-joined':
        console.log('👋 User joined:', message)
        
        // FORCE 2 USERS
        this.userCount = 2
        this.onUserCountChange?.(this.userCount)
        
        console.log(`👥 FORCED User count after join: ${this.userCount}`)
        
        // IMMEDIATELY attempt connection
        console.log('🤝 IMMEDIATELY attempting P2P after user join')
        this.updateConnectionStatus("connecting")
        this.initiatePeerConnection()
        break
        
      case 'user-left':
        console.log('👋 User left:', message)
        // Keep trying to connect even if user left
        this.userCount = 2 // Stay optimistic
        this.onUserCountChange?.(this.userCount)
        console.log(`👥 Keeping user count at: ${this.userCount}`)
        
        // Keep trying to connect
        this.updateConnectionStatus("connecting")
        setTimeout(() => this.initiatePeerConnection(), 1000)
        break
        
      case 'offer':
        console.log('📞 Received offer')
        await this.handleOffer(message)
        break
        
      case 'answer':
        console.log('📞 Received answer')
        await this.handleAnswer(message)
        break
        
      case 'ice-candidate':
        console.log('🧊 Received ICE candidate')
        await this.handleIceCandidate(message)
        break
        
      case 'error':
        console.error('❌ Signaling error:', message.message)
        // Don't give up, keep trying
        setTimeout(() => this.initiatePeerConnection(), 1000)
        break
        
      default:
        console.log('❓ Unknown signaling message:', message.type, message)
    }
  }

  private scheduleSignalingRetry(): void {
    if (this.backoffAttempts >= 10) { // More attempts
      console.log('🔄 Resetting backoff attempts')
      this.backoffAttempts = 0 // Reset and keep trying
    }
    
    const delay = Math.min(
      this.SIGNALING_RETRY_BASE * Math.pow(1.5, this.backoffAttempts), // Gentler backoff
      this.SIGNALING_RETRY_MAX
    ) + Math.random() * 500
    
    console.log(`🔄 Scheduling signaling retry in ${Math.round(delay)}ms (attempt ${this.backoffAttempts + 1})`)
    this.backoffAttempts++
    this.updateSignalingStatus("reconnecting")
    
    this.signalingRetryTimeout = setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectToSignaling()
      }
    }, delay)
  }

  // WebRTC Peer Connection - AGGRESSIVE MODE
  private async initiatePeerConnection(): Promise<void> {
    console.log('🔗 AGGRESSIVE: Initiating peer connection...')
    
    // Always try to create connection
    this.createPeerConnection()
    
    if (this.isInitiator) {
      console.log('🎯 Creating data channel as initiator')
      this.dc = this.pc!.createDataChannel('bulletproof-data', {
        ordered: true,
        maxRetransmits: 3
      })
      this.setupDataChannel(this.dc)
      
      // Create offer immediately
      this.createAndSendOffer()
    }
  }

  private createPeerConnection(): void {
    if (this.pc) {
      const currentState = this.pc.connectionState
      if (currentState === 'connected') {
        console.log('✅ Peer connection already connected')
        return
      }
      console.log(`🔄 Closing existing peer connection (state: ${currentState})`)
      try { this.pc.close() } catch {}
    }
    
    console.log('🏗️ Creating new peer connection')
    this.pc = new RTCPeerConnection(this.rtcConfig)
    
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate')
        this.sendSignalingMessage({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
          sessionId: this.sessionId
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
          this.updateConnectionStatus("connected")
          this.onConnectionRecovery?.()
          console.log('🎉 BULLETPROOF CONNECTION ESTABLISHED!')
          break
        case 'disconnected':
        case 'failed':
          console.log('💔 Peer connection failed/disconnected - AGGRESSIVE RECOVERY')
          this.updateConnectionStatus("reconnecting")
          // AGGRESSIVE: Try to restart immediately
          setTimeout(() => {
            if (!this.isDestroyed && this.activeTransfers.size === 0) {
              this.initiatePeerConnection()
            }
          }, this.ICE_RECOVERY_DELAY)
          break
        case 'connecting':
        case 'new':
          this.updateConnectionStatus("connecting")
          break
      }
    }
    
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState
      console.log('🧊 ICE connection state:', state)
      
      if (state === 'failed' || state === 'disconnected') {
        console.log('🔄 ICE failed - restarting and retrying')
        try { this.pc?.restartIce() } catch {}
        // Also try creating new connection
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.initiatePeerConnection()
          }
        }, 1000)
      }
    }
    
    this.pc.ondatachannel = (event) => {
      console.log('📡 Received data channel')
      this.dc = event.channel
      this.setupDataChannel(this.dc)
    }
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return
    
    try {
      console.log('📞 Creating offer')
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      
      this.sendSignalingMessage({
        type: 'offer',
        offer: offer,
        sessionId: this.sessionId
      })
      
      console.log('📞 Offer sent')
    } catch (error) {
      console.error('❌ Failed to create offer:', error)
      this.onError?.('Failed to create connection offer')
      // Retry after delay
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.createAndSendOffer()
        }
      }, 2000)
    }
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    if (!message.offer) return
    
    try {
      if (!this.pc) this.createPeerConnection()
      
      console.log('📞 Setting remote description (offer)')
      await this.pc!.setRemoteDescription(message.offer)
      
      console.log('📞 Creating answer')
      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)
      
      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId
      })
      
      console.log('📞 Answer sent')
    } catch (error) {
      console.error('❌ Failed to handle offer:', error)
      this.onError?.('Failed to handle connection offer')
      // Retry
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.initiatePeerConnection()
        }
      }, 1000)
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    if (!this.pc || !message.answer) return
    
    try {
      console.log('📞 Setting remote description (answer)')
      await this.pc.setRemoteDescription(message.answer)
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
      // Retry connection
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.initiatePeerConnection()
        }
      }, 1000)
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    if (!this.pc || !message.candidate) return
    
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate))
      console.log('🧊 ICE candidate added')
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error)
    }
  }

  // Data Channel
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    
    channel.onopen = () => {
      console.log('📡 Data channel opened - BULLETPROOF CONNECTION READY!')
      this.selectOptimalChunkSize()
      this.updateConnectionStatus("connected")
      this.startPingPong()
    }
    
    channel.onclose = () => {
      console.log('📡 Data channel closed - AGGRESSIVE RECONNECT')
      this.updateConnectionStatus("reconnecting")
      // Immediately try to reconnect
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.initiatePeerConnection()
        }
      }, 500)
    }
    
    channel.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      this.updateConnectionStatus("reconnecting")
      // Immediately try to reconnect
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.initiatePeerConnection()
        }
      }, 500)
    }
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
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
      }, 2000)
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
    
    let attempts = 0
    const maxAttempts = 3
    
    while (attempts < maxAttempts) {
      try {
        this.dc.send(data)
        return
      } catch (error: any) {
        attempts++
        const errorMessage = String(error?.message || error)
        
        if (/message too large/i.test(errorMessage)) {
          // Reduce chunk size and retry
          this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
          console.log(`📏 Reduced chunk size to ${this.chunkSize} bytes`)
          throw error // Let caller handle this
        }
        
        if (attempts < maxAttempts) {
          await this.waitForBufferClear()
        } else {
          throw error
        }
      }
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
      Math.min(this.DESIRED_CHUNK_SIZE, maxMessageSize - 1024) // 1KB safety margin
    )
    
    this.chunkSize = safeSize
    this.BUFFERED_AMOUNT_LOW_THRESHOLD = Math.min(2 * 1024 * 1024, this.chunkSize * 4)
    this.MAX_BUFFERED_AMOUNT = Math.max(8 * 1024 * 1024, this.BUFFERED_AMOUNT_LOW_THRESHOLD * 4)
    
    if (this.dc) {
      this.dc.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    }
    
    console.log(`📏 Optimal chunk size: ${this.chunkSize} bytes, buffer thresholds: ${this.BUFFERED_AMOUNT_LOW_THRESHOLD}/${this.MAX_BUFFERED_AMOUNT}`)
  }

  private getMaxMessageSize(): number {
    const sctp = (this.pc as any)?.sctp
    const maxSize = typeof sctp?.maxMessageSize === 'number' && isFinite(sctp.maxMessageSize) 
      ? sctp.maxMessageSize 
      : 256 * 1024
    
    return Math.max(64 * 1024, maxSize)
  }

  private startKeepAlive(): void {
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      // Send WebSocket heartbeat
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: 'heartbeat',
          sessionId: this.sessionId,
          userId: this.userId
        })
      }
      
    }, 10000) // Every 10 seconds
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed || !this.dc || this.dc.readyState !== 'open') return
      
      this.lastPingTime = Date.now()
      this.sendP2P({
        type: 'ping',
        data: { timestamp: this.lastPingTime },
        timestamp: this.lastPingTime,
        id: this.generateId()
      })
      
    }, 5000) // Ping every 5 seconds
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

  private bindLifecycleHandlers(): void {
    // Online/offline detection
    window.addEventListener('online', () => {
      console.log('🌐 Network online - AGGRESSIVE RECONNECT')
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connectToSignaling()
      }
      this.initiatePeerConnection()
    })
    
    window.addEventListener('offline', () => {
      console.log('🌐 Network offline')
      this.updateConnectionStatus("reconnecting")
    })
    
    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Page visible - AGGRESSIVE RECONNECT')
        setTimeout(() => {
          if (!this.isDestroyed) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              this.connectToSignaling()
            }
            this.initiatePeerConnection()
          }
        }, 500)
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
      console.log(`🔗 Connection status: ${status}`)
      this.onConnectionStatusChange?.(status)
    }
  }

  private updateSignalingStatus(status: ConnectionStatus): void {
    if (this.signalingStatus !== status) {
      this.signalingStatus = status
      console.log(`📡 Signaling status: ${status}`)
      this.onSignalingStatusChange?.(status)
    }
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
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
