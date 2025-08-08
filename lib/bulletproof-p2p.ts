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
}

interface ClientInfo {
  isMobile: boolean
  browser: string
  timestamp: number
  url: string
}

interface IncomingFileData {
  chunks: Map<number, ArrayBuffer>
  totalChunks: number // compatibility, not relied on
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

type ConnectionStatus = "waiting" | "connecting" | "connected" | "reconnecting"
type ConnectionQuality = "excellent" | "good" | "poor"

type Timer = ReturnType<typeof setTimeout>
type Interval = ReturnType<typeof setInterval>

interface EncryptionInfo {
  algo: 'django-fernet'
  key: string
  originalName: string
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private debugMode: boolean = false

  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private isInitiator = false

  // State
  private connectionStatus: ConnectionStatus = "connecting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed = 0
  private userCount = 0
  private isDestroyed = false

  // Timers
  private connectionRetryTimeout: Timer | null = null
  private signalingRetryTimeout: Timer | null = null
  private pingInterval: Interval | null = null

  // File state
  private fileTransfers = new Map<string, FileTransfer>()
  private incomingFiles = new Map<string, IncomingFileData>()
  private sendingFiles = new Map<string, File>() // fileId -> (possibly encrypted) File
  private activeTransfers = new Set<string>()
  private incomingEncryption = new Map<string, EncryptionInfo>() // receiver-side encryption info

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

  // Perf
  private lastPingTime = 0
  private connectionLatency = 0

  // High-throughput flow control (adaptive)
  private DESIRED_CHUNK_SIZE = 256 * 1024 // 256KB target
  private MIN_CHUNK_SIZE = 16 * 1024 // 16KB floor
  private chunkSize = 64 * 1024 // set after DC opens
  private MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024 // 8MB cap
  private BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024 // 1MB low watermark
  private PROGRESS_UPDATE_INTERVAL = 250

  // ICE recovery
  private ICE_RECOVERY_DELAY = 1500

  // Signaling rotation with backoff
  private signalingServers: string[] = []
  private currentServerIndex = 0
  private backoffAttempts = 0
  private SIGNALING_RETRY_BASE = 2000
  private SIGNALING_RETRY_MAX = 15000

  // TURN/STUN for NAT traversal
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80?transport=udp',
          'turn:openrelay.metered.ca:80?transport=tcp',
          'turn:openrelay.metered.ca:443?transport=tcp',
          'turns:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  }

  constructor(sessionId: string, userId: string, debugMode: boolean = false) {
    this.sessionId = sessionId
    this.userId = userId
    this.debugMode = debugMode
    this.initSignalingServers()
    console.log(`🚀 BulletproofP2P for session ${sessionId}`)
  }

  // Public
  async initialize(): Promise<void> {
    this.isDestroyed = false
    await this.connectToSignaling()
    this.startKeepAlive()
  }

  // Encryption endpoints (single-file Django)
  private getDjangoBaseUrl(): string {
    // Priority: URL ?django=..., then localStorage('DJANGO_BASE_URL'), else default localhost
    try {
      const sp = new URLSearchParams(window.location.search)
      const q = sp.get('django')
      if (q) return q
    } catch {}
    try {
      const ls = window.localStorage.getItem('DJANGO_BASE_URL')
      if (ls) return ls
    } catch {}
    return 'http://localhost:8000'
  }

  private async getDjangoKey(): Promise<string> {
    const base = this.getDjangoBaseUrl().replace(/\/$/, '')
    const res = await fetch(`${base}/api/key`, { method: 'GET' })
    if (!res.ok) throw new Error(`Django /key failed ${res.status}`)
    const json = await res.json().catch(() => null as any)
    const key = json?.key
    if (!key) throw new Error('Invalid key payload')
    return key
  }

  private async encryptViaDjango(file: File): Promise<{ blob: Blob; key: string } | null> {
    try {
      const base = this.getDjangoBaseUrl().replace(/\/$/, '')
      const key = await this.getDjangoKey()
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('key', key)
      const res = await fetch(`${base}/api/encrypt`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Encrypt failed ${res.status}`)
      const blob = await res.blob()
      return { blob, key }
    } catch (e) {
      console.warn('⚠️ Encrypt via Django failed, falling back to plain send', e)
      return null
    }
  }

  private async decryptViaDjango(blob: Blob, key: string): Promise<Blob | null> {
    try {
      const base = this.getDjangoBaseUrl().replace(/\/$/, '')
      const fd = new FormData()
      fd.append('file', blob, 'file.enc')
      fd.append('key', key)
      const res = await fetch(`${base}/api/decrypt`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Decrypt failed ${res.status}`)
      return await res.blob()
    } catch (e) {
      console.error('❌ Decrypt via Django failed', e)
      return null
    }
  }

  async sendFiles(files: File[]): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.('Not connected - cannot send files')
      return
    }

    for (const original of files) {
      let fileToSend = original
      let encInfo: EncryptionInfo | undefined

      // Encrypt on server first (if server available). If it fails, send plain.
      const enc = await this.encryptViaDjango(original)
      if (enc) {
        fileToSend = new File([enc.blob], `${original.name}.enc`, { type: 'application/octet-stream' })
        encInfo = { algo: 'django-fernet', key: enc.key, originalName: original.name }
      }

      const fileId = this.id()
      this.sendingFiles.set(fileId, fileToSend)

      const transfer: FileTransfer = {
        id: fileId,
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        progress: 0,
        status: "pending",
        direction: "sending",
        speed: 0,
        startTime: Date.now(),
        bytesTransferred: 0
      }
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()

      // Send offer (include encryption metadata if used)
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
        id: this.id()
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
      data: { content: message.content, sender: message.sender, type: message.type },
      timestamp: Date.now(),
      id: message.id
    })
  }

  getConnectionStatus(): ConnectionStatus { return this.connectionStatus }
  getSignalingStatus(): ConnectionStatus { return this.signalingStatus }
  getConnectionQuality(): ConnectionQuality { return this.connectionQuality }
  getCurrentSpeed(): number { return this.currentSpeed }
  getUserCount(): number { return this.userCount }
  getFileTransfers(): FileTransfer[] { return Array.from(this.fileTransfers.values()) }
  getChatMessages(): ChatMessage[] { return [] }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
  }

  isDebugMode(): boolean {
    return this.debugMode
  }

  destroy(): void {
    console.log('🛑 Destroying P2P...')
    this.isDestroyed = true
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.connectionRetryTimeout) clearTimeout(this.connectionRetryTimeout)
    if (this.signalingRetryTimeout) clearTimeout(this.signalingRetryTimeout)
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    try { this.ws?.close(1000, 'Client disconnect') } catch {}
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.activeTransfers.clear()
    this.incomingEncryption.clear()
  }

  // Signaling
  private initSignalingServers(): void {
    const host = window.location.hostname
    const local = host === 'localhost' || host === '127.0.0.1'
    this.signalingServers = []
    if (local) {
      this.signalingServers.push('ws://localhost:8080', 'ws://127.0.0.1:8080')
    } else {
      this.signalingServers.push(
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com'
      )
    }
  }

  private async connectToSignaling(): Promise<void> {
    if (this.isDestroyed) return
    this.signalingStatus = "connecting"
    this.onSignalingStatusChange?.(this.signalingStatus)

    for (let i = 0; i < this.signalingServers.length && !this.isDestroyed; i++) {
      const url = this.signalingServers[this.currentServerIndex]
      const ok = await this.trySignaling(url)
      if (ok) {
        this.backoffAttempts = 0
        this.signalingStatus = "connected"
        this.onSignalingStatusChange?.(this.signalingStatus)
        return
      }
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      await this.sleep(300)
    }

    const delay = Math.min(this.SIGNALING_RETRY_BASE * Math.pow(2, this.backoffAttempts++), this.SIGNALING_RETRY_MAX) + Math.floor(Math.random() * 500)
    console.log(`🔄 Signaling retry in ${delay}ms`)
    this.signalingStatus = "reconnecting"
    this.onSignalingStatusChange?.(this.signalingStatus)
    this.signalingRetryTimeout = setTimeout(() => {
      if (!this.isDestroyed) this.connectToSignaling()
    }, delay)
  }

  private trySignaling(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url)
        let settled = false
        const to = setTimeout(() => {
          if (!settled) { settled = true; try { ws.close() } catch {}; resolve(false) }
        }, 15000)

        ws.onopen = () => {
          if (settled) return
          settled = true
          clearTimeout(to)
          this.ws = ws
          this.setupWS()
          this.sendWS({
            type: 'join',
            sessionId: this.sessionId,
            userId: this.userId,
            clientInfo: {
              isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
              browser: this.browser(),
              timestamp: Date.now(),
              url
            }
          })
          resolve(true)
        }
        ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); resolve(false) } }
        ws.onclose = () => { if (!settled) { settled = true; clearTimeout(to); resolve(false) } }
      } catch {
        resolve(false)
      }
    })
  }

  private setupWS(): void {
    if (!this.ws) return
    this.ws.onmessage = (ev) => {
      try {
        const msg: SignalingMessage = JSON.parse(ev.data)
        this.onSignaling(msg)
      } catch (e) { console.error('❌ WS parse', e) }
    }
    this.ws.onclose = () => {
      if (!this.isDestroyed) this.connectToSignaling()
    }
    this.ws.onerror = (e) => console.log('❌ WS error', e)
  }

  private async onSignaling(message: SignalingMessage): Promise<void> {
    if (this.debugMode) {
      console.log(`📨 Signaling message:`, message.type, message)
    }

    switch (message.type) {
      case 'connected':
        console.log('🔗 Connected to signaling server')
        break

      case 'joined':
        console.log(`👋 Joined session. Initiator: ${message.isInitiator}, Users: ${message.userCount}`)
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        if (this.userCount >= 2) {
          this.setConnecting()
          // Ensure we start P2P connection immediately for both peers
          setTimeout(() => {
            if (!this.isDestroyed && this.userCount >= 2) {
              console.log(`🚀 Starting P2P connection. Initiator: ${this.isInitiator}`)
              this.ensurePeer()
            }
          }, 100)
        } else {
          this.connectionStatus = "waiting"
          this.onConnectionStatusChange?.(this.connectionStatus)
        }
        break

      case 'user-joined':
        console.log(`👤 User joined. Total users: ${message.userCount}`)
        const previousCount = this.userCount
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        // If we just reached 2 users, both peers should start connecting
        if (previousCount < 2 && this.userCount >= 2) {
          console.log('🔥 Reached 2 users - starting P2P connection')
          this.setConnecting()
          // Give both peers time to process the user-joined message
          setTimeout(() => {
            if (!this.isDestroyed && this.userCount >= 2) {
              console.log(`🚀 Initiating P2P. Initiator: ${this.isInitiator}`)
              this.ensurePeer()
            }
          }, 300)
        }
        break

      case 'user-left':
        console.log(`👋 User left. Remaining users: ${message.userCount}`)
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        
        if (this.userCount < 2) {
          this.connectionStatus = "waiting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          this.resetPeer('peer left')
        }
        break

      case 'offer':
        console.log('📥 Received offer')
        await this.onOffer(message)
        break

      case 'answer':
        console.log('📥 Received answer')
        await this.onAnswer(message)
        break

      case 'ice-candidate':
        if (this.debugMode) {
          console.log('🧊 Received ICE candidate')
        }
        await this.onRemoteIce(message)
        break

      case 'error':
        console.error('⚠️ Signaling error:', message.message)
        this.onError?.(`Signaling error: ${message.message}`)
        break

      default:
        console.log('❓ Unknown signaling message:', message.type)
    }
  }

  // Peer
  private ensurePeer(): void {
    if (this.debugMode) {
      console.log(`🔍 ensurePeer called. UserCount: ${this.userCount}, PC state: ${this.pc?.connectionState}, DC state: ${this.dc?.readyState}, Initiator: ${this.isInitiator}`)
    }

    if (this.userCount < 2) {
      console.log('⏸️ Not enough users for P2P connection')
      return
    }

    // Check if we already have a working connection
    if (this.pc && this.pc.connectionState === 'connected' && this.dc && this.dc.readyState === 'open') {
      console.log('✅ Already have working P2P connection')
      return
    }

    // Reset any existing failed connection
    if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed')) {
      console.log('🔄 Resetting failed peer connection')
      this.resetPeer('failed connection cleanup')
    }

    // Don't create multiple connections simultaneously
    if (this.pc && this.pc.connectionState === 'connecting') {
      console.log('⏳ Already connecting, waiting...')
      return
    }

    console.log(`🚀 Creating peer connection. Initiator: ${this.isInitiator}`)
    this.createPC()
    
    if (this.isInitiator) {
      console.log('📡 Creating data channel as initiator')
      this.dc = this.pc!.createDataChannel('bulletproof-reliable', { 
        ordered: true,
        maxRetransmits: 3
      })
      this.setupDC(this.dc)
      
      // Start negotiation after ensuring PC is fully set up
      setTimeout(() => {
        if (!this.isDestroyed && this.pc && this.pc.signalingState === 'stable') {
          console.log('🤝 Starting negotiation as initiator')
          this.negotiate()
        }
      }, 100)
    } else {
      console.log('👂 Non-initiator waiting for offer...')
    }
  }

  private createPC(): void {
    if (this.pc) { 
      console.log('🔄 Closing existing peer connection')
      try { 
        this.pc.close() 
        // Wait a bit for cleanup
        setTimeout(() => this.actuallyCreatePC(), 50)
        return
      } catch {} 
    }
    
    this.actuallyCreatePC()
  }

  private actuallyCreatePC(): void {
    console.log('🆕 Creating new RTCPeerConnection')
    this.pc = new RTCPeerConnection(this.rtcConfig)

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        if (this.debugMode) {
          console.log('🧊 Sending ICE candidate')
        }
        this.sendWS({ 
          type: 'ice-candidate', 
          candidate: e.candidate.toJSON(), 
          sessionId: this.sessionId 
        })
      } else {
        console.log('🧊 ICE gathering complete')
      }
    }

    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState
      console.log(`🔗 Connection state changed: ${st}`)
      
      if (st === 'connected') {
        // Only update to connected if data channel is also open
        if (this.dc && this.dc.readyState === 'open') {
          this.connectionStatus = "connected"
          this.onConnectionStatusChange?.(this.connectionStatus)
          this.onConnectionRecovery?.()
          console.log('✅ P2P connection fully established!')
        }
      } else if (st === 'disconnected' || st === 'failed') {
        console.log('❌ P2P connection failed/disconnected')
        this.handleConnectionFailure()
      } else if (st === 'connecting' || st === 'new') {
        this.setConnecting()
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState
      console.log(`🧊 ICE connection state: ${st}`)
      
      if (st === 'failed') {
        console.log('🔥 ICE connection failed - attempting restart')
        this.handleConnectionFailure()
      } else if (st === 'disconnected') {
        console.log('🔌 ICE disconnected - attempting restart')
        try { this.pc?.restartIce() } catch {}
        this.setReconnecting()
      } else if (st === 'connected' || st === 'completed') {
        console.log('🧊 ICE connection established')
      }
    }

    this.pc.ondatachannel = (ev) => {
      console.log('📡 Received data channel from peer')
      this.dc = ev.channel
      this.setupDC(this.dc)
    }

    this.pc.onicegatheringstatechange = () => {
      console.log(`🧊 ICE gathering state: ${this.pc?.iceGatheringState}`)
    }

    this.pc.onsignalingstatechange = () => {
      console.log(`📡 Signaling state: ${this.pc?.signalingState}`)
    }
  }

  private handleConnectionFailure(): void {
    console.log('🚨 Handling connection failure')
    
    // Try ICE restart first if not during active transfers
    if (this.activeTransfers.size === 0) {
      try { 
        console.log('🔄 Attempting ICE restart')
        this.pc?.restartIce() 
      } catch {}
      
      this.setReconnecting()
      
      // If ICE restart doesn't help, do full reset
      if (!this.connectionRetryTimeout) {
        this.connectionRetryTimeout = setTimeout(() => {
          this.connectionRetryTimeout = null
          if (!this.isDestroyed && this.userCount >= 2) {
            console.log('🔄 Full peer connection reset after failure')
            this.resetPeer('connection failure timeout')
            this.ensurePeer()
          }
        }, this.ICE_RECOVERY_DELAY)
      }
    } else {
      console.log('⏸️ Active transfers present, only setting reconnecting state')
      this.setReconnecting()
    }
  }

  // DC
  private setupDC(channel: RTCDataChannel): void {
    console.log('🔧 Setting up data channel')
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD

    channel.onopen = () => {
      console.log('✅ Data channel opened!')
      this.selectChunkSize()
      
      // Only set connected when both PC and DC are ready
      if (this.pc && this.pc.connectionState === 'connected') {
        this.connectionStatus = "connected"
        this.onConnectionStatusChange?.(this.connectionStatus)
        console.log('🎉 P2P connection fully ready!')
      }
    }
    
    channel.onclose = () => {
      console.log('❌ Data channel closed')
      this.setReconnecting()
    }
    
    channel.onerror = (e) => { 
      console.error('❌ DC error', e)
      this.setReconnecting()
    }
    
    channel.onmessage = (ev) => this.onDCMessage(ev.data)
  }

  private onDCMessage(data: string | ArrayBuffer): void {
    try {
      if (data instanceof ArrayBuffer) {
        // Handle file chunk data
        this.onFileChunk(data)
        return
      }

      // Handle JSON messages
      const message: P2PMessage = JSON.parse(data as string)
      
      if (this.debugMode && message.type !== 'ping' && message.type !== 'pong') {
        console.log(`📨 P2P message:`, message.type, message)
      }

      switch (message.type) {
        case 'file-offer':
          this.handleFileOffer(message.data as FileOfferData)
          break
        
        case 'file-accept':
          this.handleFileAccept(message.data as FileAcceptData)
          break
        
        case 'file-complete':
          this.onFileComplete(message.data as FileCompleteData)
          break
        
        case 'chat-message':
          const chatMsg: ChatMessage = {
            id: message.id,
            content: message.data.content,
            sender: message.data.sender,
            timestamp: new Date(message.timestamp),
            type: message.data.type || 'text'
          }
          this.onChatMessage?.(chatMsg)
          break
        
        case 'ping':
          // Respond with pong
          this.sendP2P({
            type: 'pong',
            data: { timestamp: message.data.timestamp },
            timestamp: Date.now(),
            id: this.id()
          })
          break
        
        case 'pong':
          // Calculate latency and update quality
          if (message.data.timestamp === this.lastPingTime) {
            this.connectionLatency = Date.now() - this.lastPingTime
            this.updateQuality()
          }
          break
        
        default:
          console.warn('❓ Unknown P2P message type:', message.type)
      }
    } catch (e) {
      console.error('❌ Failed to process DC message', e)
    }
  }

  private async negotiate(): Promise<void> {
    if (!this.pc) {
      console.error('❌ No peer connection for negotiation')
      return
    }
    
    if (this.pc.signalingState !== 'stable') {
      console.warn('⚠️ Signaling state not stable, waiting...')
      setTimeout(() => this.negotiate(), 100)
      return
    }
    
    console.log('🤝 Starting negotiation (creating offer)')
    try {
      const offer = await this.pc.createOffer({ 
        offerToReceiveAudio: false, 
        offerToReceiveVideo: false 
      })
      await this.pc.setLocalDescription(offer)
      console.log('📤 Sending offer to peer')
      this.sendWS({ 
        type: 'offer', 
        offer, 
        sessionId: this.sessionId 
      })
    } catch (e) {
      console.error('❌ Failed to create/send offer', e)
      this.onError?.('Failed to negotiate P2P connection')
      // Retry negotiation once
      setTimeout(() => {
        if (!this.isDestroyed && this.pc && this.isInitiator) {
          console.log('🔄 Retrying negotiation')
          this.negotiate()
        }
      }, 1000)
    }
  }

  private async onOffer(msg: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) {
        console.log('🆕 Creating PC to handle incoming offer')
        this.createPC()
        // Wait for PC to be ready
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      if (!msg.offer) {
        console.error('❌ Received offer message without offer data')
        return
      }
      
      console.log('📥 Processing incoming offer')
      await this.pc!.setRemoteDescription(msg.offer)
      
      console.log('📤 Creating and sending answer')
      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)
      
      this.sendWS({ 
        type: 'answer', 
        answer, 
        sessionId: this.sessionId 
      })
      console.log('✅ Answer sent successfully')
    } catch (e) {
      console.error('❌ Failed to handle offer', e)
      this.setReconnecting()
      this.onError?.('Failed to handle connection offer')
      
      // Retry handling offer once
      setTimeout(() => {
        if (!this.isDestroyed && msg.offer) {
          console.log('🔄 Retrying offer handling')
          this.onOffer(msg)
        }
      }, 1000)
    }
  }

  private async onAnswer(msg: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) {
        console.error('❌ No peer connection to handle answer')
        return
      }
      if (!msg.answer) {
        console.error('❌ Received answer message without answer data')
        return
      }
      
      console.log('📥 Processing answer')
      await this.pc.setRemoteDescription(msg.answer)
      console.log('✅ Answer processed')
    } catch (e) {
      console.error('❌ Failed to handle answer', e)
      this.setReconnecting()
      this.onError?.('Failed to handle connection answer')
    }
  }

  private async onRemoteIce(msg: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) {
        console.warn('⚠️ Received ICE candidate but no peer connection exists')
        return
      }
      if (!msg.candidate) {
        console.error('❌ Received ICE message without candidate data')
        return
      }
      
      if (this.debugMode) {
        console.log('🧊 Adding remote ICE candidate')
      }
      await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
    } catch (e) {
      console.error('❌ Failed to add ICE candidate', e)
      // Don't trigger reconnection for ICE candidate failures as they're common
    }
  }

  // File pipeline
  private handleFileOffer(data: FileOfferData): void {
    if (data.encryption?.algo === 'django-fernet') {
      this.incomingEncryption.set(data.fileId, {
        algo: 'django-fernet',
        key: data.encryption.key,
        originalName: data.encryption.originalName
      })
    }
    // Auto-accept
    this.sendP2P({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.id()
    })
  }

  private async handleFileAccept(data: FileAcceptData): Promise<void> {
    const file = this.sendingFiles.get(data.fileId)
    if (!file) {
      console.warn('⚠️ accepted file not found', data.fileId)
      return
    }
    await this.sendFileAdaptive(file, data.fileId)
  }

  // Adaptive sender: offset streaming, SCTP-safe sizing, backpressure, retries
  private async sendFileAdaptive(file: File, fileId: string): Promise<void> {
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
    let seq = 0
    let lastUI = 0
    const started = Date.now()

    try {
      while (offset < file.size) {
        if (!this.dc || this.dc.readyState !== 'open') throw new Error('Data channel closed')

        // Backpressure
        if (this.dc.bufferedAmount > this.MAX_BUFFERED_AMOUNT) {
          await this.waitBufferedLow()
          continue
        }

        // Compute max payload within SCTP limit
        const sctpMax = this.getSctpMaxMessageSize()
        const headerProbe = new TextEncoder().encode(JSON.stringify({ fileId, seq, fileName: file.name, fileSize: file.size, fileType: file.type }))
        const maxForPayload = Math.max(this.MIN_CHUNK_SIZE, Math.min(this.chunkSize, sctpMax - 4 - headerProbe.length - 32)) // 32B safety

        const size = Math.min(maxForPayload, file.size - offset)
        const ab = await file.slice(offset, offset + size).arrayBuffer()

        // Build message
        const header = { fileId, seq, fileName: file.name, fileSize: file.size, fileType: file.type }
        const headerBytes = new TextEncoder().encode(JSON.stringify(header))
        const totalLen = 4 + headerBytes.length + ab.byteLength

        // If still too big, shrink chunk and retry loop without advancing
        if (totalLen > sctpMax) {
          this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
          continue
        }

        const out = new Uint8Array(totalLen)
        new DataView(out.buffer).setUint32(0, headerBytes.length, true)
        out.set(headerBytes, 4)
        out.set(new Uint8Array(ab), 4 + headerBytes.length)

        await this.safeSend(out.buffer)

        offset += ab.byteLength
        seq++
        transfer.bytesTransferred! = offset

        const now = Date.now()
        if (now - lastUI > this.PROGRESS_UPDATE_INTERVAL) {
          const elapsed = (now - started) / 1000
          const speed = elapsed > 0 ? Math.round(offset / elapsed) : 0
          transfer.speed = speed
          transfer.progress = Math.round((offset / file.size) * 100)
          transfer.eta = speed > 0 ? Math.round((file.size - offset) / speed) : 0
          this.currentSpeed = speed
          this.onSpeedUpdate?.(speed)
          this.updateFileTransfers()
          lastUI = now
        }
      }

      // Notify completion
      this.sendP2P({
        type: 'file-complete',
        data: { fileId, fileName: file.name, fileSize: file.size },
        timestamp: Date.now(),
        id: this.id()
      })

      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()
      console.log(`✅ Sent ${file.name} @ ${this.prettySpeed(transfer.speed || 0)}`)
    } catch (e) {
      console.error(`❌ Failed to send ${file.name}`, e)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    } finally {
      this.activeTransfers.delete(fileId)
      this.sendingFiles.delete(fileId)
    }
  }

  private onFileChunk(buf: ArrayBuffer): void {
    try {
      const dv = new DataView(buf)
      const hlen = dv.getUint32(0, true)
      if (hlen <= 0 || hlen > 100_000) return
      const headerBytes = new Uint8Array(buf, 4, hlen)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunk = buf.slice(4 + hlen)

      const { fileId, fileName, fileSize, fileType } = header

      if (!this.incomingFiles.has(fileId)) {
        const state: IncomingFileData = {
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
        this.incomingFiles.set(fileId, state)
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
      }

      const inc = this.incomingFiles.get(fileId)!
      const t = this.fileTransfers.get(fileId)!

      const seq: number = typeof header.seq === 'number' ? header.seq : inc.receivedChunks
      if (!inc.chunks.has(seq)) {
        inc.chunks.set(seq, chunk)
        inc.receivedChunks++
        inc.lastChunkTime = Date.now()
        inc.bytesReceived += (chunk as ArrayBuffer).byteLength

        const now = Date.now()
        const elapsed = (now - inc.startTime) / 1000
        const speed = elapsed > 0 ? Math.round(inc.bytesReceived / elapsed) : 0
        t.bytesTransferred = inc.bytesReceived
        t.speed = speed
        t.progress = Math.min(99, Math.floor((inc.bytesReceived / inc.fileSize) * 100))
        t.eta = speed > 0 ? Math.round((inc.fileSize - inc.bytesReceived) / speed) : 0
        this.updateFileTransfers()
      }
    } catch (e) {
      console.error('❌ onFileChunk', e)
    }
  }

  private async onFileComplete(data: FileCompleteData): Promise<void> {
    const inc = this.incomingFiles.get(data.fileId)
    const t = this.fileTransfers.get(data.fileId)

    // Sender ACK (no inc state)
    if (!inc) {
      if (t && t.direction === 'sending') {
        t.status = 'completed'
        t.progress = 100
        this.updateFileTransfers()
      }
      return
    }

    // Assemble when bytes match fileSize (or after short wait)
    if (inc.bytesReceived >= inc.fileSize) {
      await this.assemble(data.fileId)
    } else {
      setTimeout(async () => {
        const again = this.incomingFiles.get(data.fileId)
        const tr = this.fileTransfers.get(data.fileId)
        if (!again || !tr) return
        if (again.bytesReceived >= again.fileSize) {
          await this.assemble(data.fileId)
        } else {
          console.error(`❌ File incomplete: ${again.bytesReceived}/${again.fileSize}`)
          tr.status = 'error'
          this.updateFileTransfers()
          this.activeTransfers.delete(data.fileId)
        }
      }, 1500)
    }
  }

  private async assemble(fileId: string): Promise<void> {
    const inc = this.incomingFiles.get(fileId)
    const t = this.fileTransfers.get(fileId)
    if (!inc || !t) return

    try {
      const keys = Array.from(inc.chunks.keys()).sort((a, b) => a - b)
      const parts: ArrayBuffer[] = []
      let total = 0
      for (const k of keys) {
        const ab = inc.chunks.get(k)!
        parts.push(ab)
        total += ab.byteLength
      }

      let blob = new Blob(parts, { type: inc.fileType || 'application/octet-stream' })
      let downloadName = inc.fileName

      // Auto-decrypt via Django if needed
      const enc = this.incomingEncryption.get(fileId)
      if (enc) {
        const dec = await this.decryptViaDjango(blob, enc.key)
        if (dec) {
          blob = dec
          downloadName = enc.originalName
        } else {
          // decryption failed, keep encrypted content fallback
          this.onError?.('Decryption failed - sending encrypted file instead')
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      t.status = "completed"
      t.progress = 100
      t.endTime = Date.now()
      this.updateFileTransfers()
      this.incomingFiles.delete(fileId)
      this.activeTransfers.delete(fileId)
      this.incomingEncryption.delete(fileId)

      // Ack completion back
      this.sendP2P({ type: 'file-complete', data: { fileId }, timestamp: Date.now(), id: this.id() })

      const elapsed = (t.endTime! - (t.startTime || t.endTime!)) / 1000
      const avg = elapsed > 0 ? Math.round(total / elapsed) : 0
      console.log(`✅ Downloaded ${downloadName} @ ${this.prettySpeed(avg)}`)
    } catch (e) {
      console.error('❌ assemble', e)
      t.status = 'error'
      this.updateFileTransfers()
      this.activeTransfers.delete(fileId)
    }
  }

  // Flow control helpers
  private async safeSend(buffer: ArrayBuffer): Promise<void> {
    let attempts = 0
    while (true) {
      try {
        this.dc!.send(buffer)
        return
      } catch (e: any) {
        attempts++
        const msg = String(e?.message || e)
        // On message-too-large or operation errors, shrink chunk and retry
        if (/message too large|operation/i.test(msg)) {
          this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
          await this.sleep(2)
          continue
        }
        // Backpressure fallback
        if (attempts < 3) {
          await this.waitBufferedLow()
          continue
        }
        throw e
      }
    }
  }

  private waitBufferedLow(): Promise<void> {
    if (!this.dc) return Promise.resolve()
    return new Promise((resolve) => {
      const h = () => { this.dc?.removeEventListener('bufferedamountlow', h); resolve() }
      // Add null check before addEventListener
      if (this.dc) {
        this.dc.addEventListener('bufferedamountlow', h, { once: true })
      } else {
        resolve()
      }
    })
  }

  private selectChunkSize(): void {
    const max = this.getSctpMaxMessageSize()
    const safe = Math.max(this.MIN_CHUNK_SIZE, Math.min(this.DESIRED_CHUNK_SIZE, max - 2048)) // 2KB headroom
    this.chunkSize = safe
    this.BUFFERED_AMOUNT_LOW_THRESHOLD = Math.min(2 * 1024 * 1024, Math.floor(this.chunkSize * 4))
    this.MAX_BUFFERED_AMOUNT = Math.max(8 * 1024 * 1024, this.BUFFERED_AMOUNT_LOW_THRESHOLD * 4)
    if (this.dc) this.dc.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    console.log(`📏 SCTP max=${max}B, chunk=${this.chunkSize}B, lowThreshold=${this.BUFFERED_AMOUNT_LOW_THRESHOLD}B`)
  }

  private getSctpMaxMessageSize(): number {
    const sctp = (this.pc as any)?.sctp
    const m = typeof sctp?.maxMessageSize === 'number' && isFinite(sctp.maxMessageSize) ? sctp.maxMessageSize : 256 * 1024
    return Math.max(64 * 1024, m)
  }

  // Keep-alives & quality
  private startKeepAlive(): void {
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return
      if (this.dc && this.dc.readyState === 'open') {
        this.lastPingTime = Date.now()
        this.sendP2P({ type: 'ping', data: { timestamp: this.lastPingTime }, timestamp: this.lastPingTime, id: this.id() })
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWS({ type: 'keep-alive', sessionId: this.sessionId, userId: this.userId })
      }
    }, 15000)
  }

  private updateQuality(): void {
    if (this.connectionLatency < 100) this.connectionQuality = "excellent"
    else if (this.connectionLatency < 300) this.connectionQuality = "good"
    else this.connectionQuality = "poor"
    this.onConnectionQualityChange?.(this.connectionQuality)
  }

  // Utils
  private sendP2P(msg: P2PMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') return
    try { this.dc.send(JSON.stringify(msg)) } catch (e) { console.error('❌ DC send', e) }
  }

  private sendWS(msg: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try { this.ws.send(JSON.stringify(msg)) } catch (e) { console.error('❌ WS send', e) }
  }

  private setConnecting(): void {
    if (this.connectionStatus !== 'connecting' && this.connectionStatus !== 'connected') {
      this.connectionStatus = 'connecting'
      this.onConnectionStatusChange?.(this.connectionStatus)
      console.log('🔄 Connection status: connecting')
    }
  }

  private setReconnecting(): void {
    if (this.connectionStatus !== 'reconnecting') {
      this.connectionStatus = 'reconnecting'
      this.onConnectionStatusChange?.(this.connectionStatus)
      console.log('🔄 Connection status: reconnecting')
    }
  }

  private resetPeer(reason: string): void {
    console.log(`🔄 Resetting peer connection: ${reason}`)
    
    if (this.activeTransfers.size > 0) {
      console.log('⏸️ Active transfers present, only restarting ICE')
      try { this.pc?.restartIce() } catch {}
      return
    }
    
    // Clear any pending timeouts
    if (this.connectionRetryTimeout) {
      clearTimeout(this.connectionRetryTimeout)
      this.connectionRetryTimeout = null
    }
    
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    this.dc = null
    this.pc = null
    console.log('✅ Peer connection reset complete')
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
  private id(): string { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) }
  private browser(): string {
    const ua = navigator.userAgent
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return 'Unknown'
  }

  private prettySpeed(bps: number): string {
    if (bps > 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`
    if (bps > 1024) return `${(bps / 1024).toFixed(2)} KB/s`
    return `${bps} B/s`
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }
}
