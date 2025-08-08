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

type P2PMessageType =
  | 'file-offer'
  | 'file-accept'
  | 'file-chunk'
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

type IncomingFileState = IncomingFileData & {
  // Internal accumulator to compute speed accurately
  bytesReceived: number
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private isInitiator = false

  // Connection state management
  private connectionStatus: ConnectionStatus = "connecting" // Force connecting until DC is open
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed = 0
  private userCount = 0

  // Stability & resiliency
  private isDestroyed = false
  private lastSuccessfulConnection = 0
  private connectionRetryTimeout: NodeJS.Timeout | null = null
  private signalingRetryTimeout: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null
  private visibilityTimer: NodeJS.Timeout | null = null
  private backoffAttempts = 0

  // File state
  private fileTransfers = new Map<string, FileTransfer>()
  private incomingFiles = new Map<string, IncomingFileState>()
  private sendingFiles = new Map<string, File>() // fileId -> File
  private activeTransfers = new Set<string>()
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
  private lastPingTime = 0
  private connectionLatency = 0

  // High-speed, reliable flow control
  private readonly CHUNK_SIZE = 256 * 1024 // 256KB per chunk for high throughput
  private readonly BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024 // 1MB low watermark
  private readonly MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024 // 8MB cap to avoid congestion
  private readonly PROGRESS_UPDATE_INTERVAL = 400

  // Reconnect timings
  private readonly SIGNALING_RETRY_BASE = 2000
  private readonly SIGNALING_RETRY_MAX = 15000
  private readonly ICE_RECOVERY_DELAY = 1500

  // Signaling servers rotation
  private signalingServers: string[] = []
  private currentServerIndex = 0

  // TURN/STUN configuration for NAT traversal
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      // Google STUN
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // OpenRelay TURN (public)
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

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeSignalingServers()
    this.bindLifecycleHandlers()
    console.log(`🚀 BulletproofP2P started for session ${sessionId}`)
  }

  // Public API
  async initialize(): Promise<void> {
    this.isDestroyed = false
    await this.connectToSignaling()
    this.startKeepAlive()
  }

  async sendFiles(files: File[]): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.('Not connected - cannot send files yet')
      return
    }
    console.log(`📤 Queueing ${files.length} file(s)`)

    for (const file of files) {
      const fileId = this.generateId()
      this.sendingFiles.set(fileId, file)

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
      this.updateFileTransfers()

      // Offer immediately
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

  sendMessage(message: ChatMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') {
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

    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.connectionRetryTimeout) clearTimeout(this.connectionRetryTimeout)
    if (this.signalingRetryTimeout) clearTimeout(this.signalingRetryTimeout)
    if (this.visibilityTimer) clearTimeout(this.visibilityTimer)

    if (this.dc) this.dc.close()
    if (this.pc) this.pc.close()
    if (this.ws) this.ws.close(1000, 'Client disconnect')

    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.activeTransfers.clear()
    console.log('✅ P2P destroyed')
  }

  // ----- Signaling -----
  private initializeSignalingServers(): void {
    const currentDomain = window.location.hostname
    const isLocalhost = currentDomain === 'localhost' || currentDomain === '127.0.0.1'

    this.signalingServers = []

    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.signalingServers.push(process.env.NEXT_PUBLIC_WS_URL)
    }

    if (isLocalhost) {
      this.signalingServers.push('ws://localhost:8080', 'ws://127.0.0.1:8080')
    } else {
      this.signalingServers.push(
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com'
      )
    }
    console.log(`🔗 Loaded ${this.signalingServers.length} signaling endpoints`)
  }

  private async connectToSignaling(): Promise<void> {
    if (this.isDestroyed) return

    this.signalingStatus = "connecting"
    this.onSignalingStatusChange?.(this.signalingStatus)

    // Rotate through all servers until one connects
    for (let i = 0; i < this.signalingServers.length && !this.isDestroyed; i++) {
      const url = this.signalingServers[this.currentServerIndex]
      const ok = await this.trySignaling(url)
      if (ok) {
        this.backoffAttempts = 0
        this.signalingStatus = "connected"
        this.onSignalingStatusChange?.(this.signalingStatus)
        return
      }
      // rotate
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      await this.sleep(500)
    }

    // All failed -> schedule retry with backoff + jitter
    const delay = Math.min(
      this.SIGNALING_RETRY_BASE * Math.pow(2, this.backoffAttempts++),
      this.SIGNALING_RETRY_MAX
    ) + Math.floor(Math.random() * 500)

    console.log(`🔄 All signaling connections failed, retrying in ${delay}ms`)
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

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true
            try { ws.close() } catch {}
            resolve(false)
          }
        }, 15000)

        ws.onopen = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          this.ws = ws
          this.setupWebSocketHandlers()
          this.sendSignaling({
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

        ws.onerror = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(false)
        }

        ws.onclose = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(false)
        }
      } catch {
        resolve(false)
      }
    })
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return

    this.ws.onmessage = (ev) => {
      try {
        const msg: SignalingMessage = JSON.parse(ev.data)
        this.handleSignaling(msg)
      } catch (e) {
        console.error('❌ Signaling parse error', e)
      }
    }

    this.ws.onclose = (ev) => {
      console.log(`🔌 Signaling closed: ${ev.code} ${ev.reason || ''}`)
      if (!this.isDestroyed) {
        this.connectToSignaling()
      }
    }

    this.ws.onerror = (err) => {
      console.log('❌ Signaling error', err)
    }
  }

  private async handleSignaling(message: SignalingMessage): Promise<void> {
    // Always keep UI in connecting/reconnecting unless DC is open
    if (this.connectionStatus !== 'connected') {
      this.setConnecting()
    }

    switch (message.type) {
      case 'connected':
        console.log('✅ Signaling server acknowledged')
        break

      case 'joined':
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`✅ Joined session as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'}; users=${this.userCount}`)

        // Always try P2P whenever >= 2 users
        if (this.userCount >= 2) {
          this.ensurePeerConnection()
        }
        // Force UI to show connecting until DC opens
        this.setConnecting()
        break

      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        if (this.userCount >= 2) {
          this.ensurePeerConnection()
        }
        this.setConnecting()
        break

      case 'user-left':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        // Keep trying to connect; do not drop to "waiting" to match the requirement
        this.setConnecting()
        this.resetPeer('peer left')
        break

      case 'offer':
        await this.onOffer(message)
        break

      case 'answer':
        await this.onAnswer(message)
        break

      case 'ice-candidate':
        await this.onRemoteIce(message)
        break

      case 'error':
        console.log('⚠️ Signaling error:', message.message)
        break
    }
  }

  // ----- Peer connection -----
  private ensurePeerConnection(): void {
    if (this.pc && (this.pc.connectionState === 'connected' || this.pc.connectionState === 'connecting')) {
      return
    }
    this.createPeer()
    if (this.isInitiator) {
      // Create reliable ordered DC to guarantee delivery "by any cost"
      this.dc = this.pc!.createDataChannel('bulletproof-reliable', {
        ordered: true
      })
      this.setupDataChannel(this.dc)
      this.negotiateOffer()
    }
  }

  private createPeer(): void {
    if (this.pc) {
      try { this.pc.close() } catch {}
    }
    console.log('🔧 Creating RTCPeerConnection')
    this.pc = new RTCPeerConnection(this.rtcConfig)

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignaling({
          type: 'ice-candidate',
          candidate: e.candidate.toJSON(),
          sessionId: this.sessionId
        })
      }
    }

    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState
      console.log(`🔗 PC state: ${st}`)
      if (st === 'connected') {
        this.connectionStatus = "connected"
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.lastSuccessfulConnection = Date.now()
        this.onConnectionRecovery?.()
      } else if (st === 'disconnected' || st === 'failed') {
        // Try ICE restart fast
        if (this.pc) {
          console.log('🧊 Restarting ICE')
          try { this.pc.restartIce() } catch {}
        }
        this.setReconnecting()
        // If not recovered shortly, fully renegotiate
        if (!this.connectionRetryTimeout) {
          this.connectionRetryTimeout = setTimeout(() => {
            this.connectionRetryTimeout = null
            if (!this.isDestroyed && this.userCount >= 2) {
              console.log('🔄 ICE restart didn\'t recover, renegotiating...')
              this.resetPeer('ice failure')
              this.ensurePeerConnection()
            }
          }, this.ICE_RECOVERY_DELAY)
        }
      } else if (st) {
        // keep UI "connecting" for other intermediate states (new, connecting, closed)
        this.setConnecting()
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState
      console.log(`🧊 ICE state: ${st}`)
      if (st === 'failed' || st === 'disconnected') {
        try { this.pc?.restartIce() } catch {}
        this.setReconnecting()
      }
    }

    this.pc.ondatachannel = (ev) => {
      console.log('📡 Data channel received')
      this.dc = ev.channel
      this.setupDataChannel(this.dc)
    }
  }

  private async negotiateOffer(): Promise<void> {
    if (!this.pc) return
    try {
      const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
      await this.pc.setLocalDescription(offer)
      this.sendSignaling({ type: 'offer', offer, sessionId: this.sessionId })
      console.log('📤 Sent SDP offer')
    } catch (e) {
      console.error('❌ Offer failed', e)
      this.onError?.('Failed to negotiate P2P connection')
    }
  }

  private async onOffer(msg: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) this.createPeer()
      if (!msg.offer) return
      await this.pc!.setRemoteDescription(msg.offer)
      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)
      this.sendSignaling({ type: 'answer', answer, sessionId: this.sessionId })
      console.log('📤 Sent SDP answer')
    } catch (e) {
      console.error('❌ Handling offer failed', e)
      this.setReconnecting()
    }
  }

  private async onAnswer(msg: SignalingMessage): Promise<void> {
    try {
      if (this.pc && msg.answer) {
        await this.pc.setRemoteDescription(msg.answer)
        console.log('✅ Remote answer set')
      }
    } catch (e) {
      console.error('❌ Handling answer failed', e)
      this.setReconnecting()
    }
  }

  private async onRemoteIce(msg: SignalingMessage): Promise<void> {
    try {
      if (this.pc && msg.candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
      }
    } catch (e) {
      console.error('❌ Adding ICE candidate failed', e)
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD

    channel.onopen = () => {
      console.log('✅ Data channel open')
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
      this.lastSuccessfulConnection = Date.now()
    }

    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.setReconnecting()
    }

    channel.onerror = (e) => {
      console.error('❌ Data channel error', e)
      this.setReconnecting()
    }

    channel.onmessage = (ev) => this.onData(ev.data)
  }

  private onData(data: string | ArrayBuffer): void {
    try {
      if (typeof data === 'string') {
        const msg: P2PMessage = JSON.parse(data)
        this.onP2P(msg)
      } else {
        this.onFileChunk(data)
      }
    } catch (e) {
      console.error('❌ DC message parse error', e)
    }
  }

  private onP2P(msg: P2PMessage): void {
    switch (msg.type) {
      case 'chat-message': {
        const chat: ChatMessage = {
          id: msg.id,
          content: msg.data.content,
          sender: msg.data.sender,
          timestamp: new Date(msg.timestamp),
          type: msg.data.type
        }
        this.onChatMessage?.(chat)
        break
      }
      case 'file-offer':
        this.onFileOffer(msg.data as FileOfferData)
        break
      case 'file-accept':
        this.onFileAccept(msg.data as FileAcceptData)
        break
      case 'file-complete':
        this.onFileComplete(msg.data as FileCompleteData)
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
        this.updateQuality()
        break
    }
  }

  // ----- File transfer (reliable, high-throughput) -----
  private async onFileAccept(data: FileAcceptData): Promise<void> {
    const file = this.sendingFiles.get(data.fileId)
    if (!file) {
      console.warn('⚠️ Accepted file not found:', data.fileId)
      return
    }
    await this.sendFileReliable(file, data.fileId)
  }

  private onFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer: ${data.fileName} (${this.prettySize(data.fileSize)})`)
    // Auto-accept
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
  }

  private async sendFileReliable(file: File, fileId: string): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      this.onError?.('Connection lost before sending file')
      return
    }

    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    this.activeTransfers.add(fileId)
    transfer.status = "transferring"
    transfer.startTime = Date.now()
    transfer.bytesTransferred = 0
    this.updateFileTransfers()

    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE)
    let chunkIndex = 0
    let lastUpdate = 0
    const started = Date.now()

    try {
      while (chunkIndex < totalChunks) {
        if (!this.dc || this.dc.readyState !== 'open') throw new Error('DC closed')

        // Backpressure: wait when bufferedAmount is high
        if (this.dc.bufferedAmount > this.MAX_BUFFERED_AMOUNT) {
          await this.waitForBufferedAmountLow()
          continue
        }

        const start = chunkIndex * this.CHUNK_SIZE
        const end = Math.min(start + this.CHUNK_SIZE, file.size)
        const ab = await file.slice(start, end).arrayBuffer()

        // Header + payload
        const headerBytes = new TextEncoder().encode(JSON.stringify({
          fileId,
          chunkIndex,
          totalChunks,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }))
        const combined = new Uint8Array(4 + headerBytes.length + ab.byteLength)
        new DataView(combined.buffer).setUint32(0, headerBytes.length, true)
        combined.set(headerBytes, 4)
        combined.set(new Uint8Array(ab), 4 + headerBytes.length)

        this.dc.send(combined.buffer)

        chunkIndex++
        transfer.bytesTransferred! += ab.byteLength

        const now = Date.now()
        if (now - lastUpdate > this.PROGRESS_UPDATE_INTERVAL) {
          const elapsed = (now - started) / 1000
          const speed = elapsed > 0 ? Math.round(transfer.bytesTransferred! / elapsed) : 0
          transfer.speed = speed
          transfer.progress = Math.round((chunkIndex / totalChunks) * 100)
          transfer.eta = speed > 0 ? Math.round((file.size - transfer.bytesTransferred!) / speed) : 0
          this.currentSpeed = speed
          this.onSpeedUpdate?.(speed)
          this.updateFileTransfers()
          lastUpdate = now
        }
      }

      // Inform receiver transfer is complete (they will assemble)
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

      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()
      console.log(`✅ Sent ${file.name} at ~${this.prettySpeed(transfer.speed || 0)}`)

    } catch (e) {
      console.error('❌ File send failed', e)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    } finally {
      this.activeTransfers.delete(fileId)
      this.sendingFiles.delete(fileId)
    }
  }

  private onFileChunk(data: ArrayBuffer): void {
    try {
      const dv = new DataView(data)
      const headerLen = dv.getUint32(0, true)
      if (headerLen <= 0 || headerLen > 100_000) {
        console.warn('⚠️ Invalid header length, dropping chunk')
        return
      }
      const headerBytes = new Uint8Array(data, 4, headerLen)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunkData = data.slice(4 + headerLen)

      const { fileId, chunkIndex, totalChunks, fileName, fileSize, fileType } = header

      if (!this.incomingFiles.has(fileId)) {
        const state: IncomingFileState = {
          chunks: new Map(),
          totalChunks,
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

      if (!inc.chunks.has(chunkIndex)) {
        inc.chunks.set(chunkIndex, chunkData)
        inc.receivedChunks++
        inc.lastChunkTime = Date.now()
        inc.bytesReceived += (chunkData as ArrayBuffer).byteLength

        const now = Date.now()
        const elapsed = (now - inc.startTime) / 1000
        const speed = elapsed > 0 ? Math.round(inc.bytesReceived / elapsed) : 0
        t.bytesTransferred = inc.bytesReceived
        t.speed = speed
        t.progress = Math.round((inc.receivedChunks / inc.totalChunks) * 100)
        t.eta = speed > 0 ? Math.round((inc.fileSize - inc.bytesReceived) / speed) : 0
        this.updateFileTransfers()

        if (inc.receivedChunks % 50 === 0) {
          console.log(`📥 ${fileName}: ${t.progress}% @ ${this.prettySpeed(speed)}`)
        }
      }
    } catch (e) {
      console.error('❌ Receive chunk error', e)
    }
  }

  private onFileComplete(data: FileCompleteData): void {
    const inc = this.incomingFiles.get(data.fileId)
    const t = this.fileTransfers.get(data.fileId)
    if (!inc || !t) {
      // Might be sender receiving ack; just mark sender as completed if exists
      const senderTransfer = this.fileTransfers.get(data.fileId)
      if (senderTransfer && senderTransfer.direction === 'sending') {
        senderTransfer.status = 'completed'
        senderTransfer.progress = 100
        this.updateFileTransfers()
      }
      return
    }

    const expected = data.totalChunks || inc.totalChunks
    if (inc.receivedChunks === expected) {
      this.assembleAndDownload(data.fileId)
    } else {
      // Wait a bit for any straggler chunks then assemble or error
      setTimeout(() => {
        const again = this.incomingFiles.get(data.fileId)
        const tr = this.fileTransfers.get(data.fileId)
        if (!again || !tr) return
        if (again.receivedChunks === expected) {
          this.assembleAndDownload(data.fileId)
        } else {
          console.error(`❌ File incomplete ${again.receivedChunks}/${expected}`)
          tr.status = 'error'
          this.updateFileTransfers()
          this.activeTransfers.delete(data.fileId)
        }
      }, 1500)
    }
  }

  private assembleAndDownload(fileId: string): void {
    const inc = this.incomingFiles.get(fileId)
    const t = this.fileTransfers.get(fileId)
    if (!inc || !t) return

    try {
      const parts: ArrayBuffer[] = []
      let sum = 0
      for (let i = 0; i < inc.totalChunks; i++) {
        const part = inc.chunks.get(i)
        if (!part) throw new Error(`Missing chunk ${i}`)
        parts.push(part)
        sum += part.byteLength
      }

      const blob = new Blob(parts, { type: inc.fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = inc.fileName
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

      // Ack back to sender as confirmation (reuse file-complete)
      this.sendP2PMessage({
        type: 'file-complete',
        data: { fileId },
        timestamp: Date.now(),
        id: this.generateId()
      })

      const elapsed = (t.endTime! - (t.startTime || t.endTime!)) / 1000
      const avg = elapsed > 0 ? Math.round(sum / elapsed) : 0
      console.log(`✅ Downloaded ${inc.fileName} @ ${this.prettySpeed(avg)}`)
    } catch (e) {
      console.error('❌ Assemble failed', e)
      t.status = 'error'
      this.updateFileTransfers()
      this.activeTransfers.delete(fileId)
    }
  }

  // ----- Keep alive & quality -----
  private startKeepAlive(): void {
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return

      // DC ping
      if (this.dc && this.dc.readyState === 'open') {
        this.lastPingTime = Date.now()
        this.sendP2PMessage({
          type: 'ping',
          data: { timestamp: this.lastPingTime },
          timestamp: this.lastPingTime,
          id: this.generateId()
        })
      }

      // Signaling keep alive
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignaling({
          type: 'keep-alive',
          sessionId: this.sessionId,
          userId: this.userId
        })
      }
    }, 15000)
  }

  private updateQuality(): void {
    if (this.connectionLatency < 100) this.connectionQuality = "excellent"
    else if (this.connectionLatency < 300) this.connectionQuality = "good"
    else this.connectionQuality = "poor"
    this.onConnectionQualityChange?.(this.connectionQuality)
  }

  // ----- Helpers -----
  private sendP2PMessage(msg: P2PMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') return
    try {
      this.dc.send(JSON.stringify(msg))
    } catch (e) {
      console.error('❌ DC send failed', e)
    }
  }

  private sendSignaling(msg: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify(msg))
    } catch (e) {
      console.error('❌ WS send failed', e)
    }
  }

  private setConnecting(): void {
    if (this.connectionStatus !== 'connected') {
      const next: ConnectionStatus = this.connectionStatus === 'reconnecting' ? 'reconnecting' : 'connecting'
      if (this.connectionStatus !== next) {
        this.connectionStatus = next
        this.onConnectionStatusChange?.(this.connectionStatus)
      }
    }
  }

  private setReconnecting(): void {
    if (this.connectionStatus !== 'connected') {
      this.connectionStatus = 'reconnecting'
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
  }

  private resetPeer(reason: string): void {
    console.log(`🔄 Resetting peer (${reason})`)
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    this.dc = null
    this.pc = null
  }

  private waitForBufferedAmountLow(): Promise<void> {
    if (!this.dc) return Promise.resolve()
    return new Promise((resolve) => {
      const handler = () => {
        this.dc?.removeEventListener('bufferedamountlow', handler)
        resolve()
      }
      // Add null check before calling addEventListener
      if (this.dc) {
        this.dc.addEventListener('bufferedamountlow', handler, { once: true })
      } else {
        resolve()
      }
    })
  }

  private prettySpeed(bps: number): string {
    if (bps < 1024) return `${bps} B/s`
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
    if (bps < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
    return `${(bps / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
  }

  private prettySize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }

  private browser(): string {
    const ua = navigator.userAgent
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    return 'Unknown'
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  private updateFileTransfers(): void {
    this.onFileTransferUpdate?.(Array.from(this.fileTransfers.values()))
  }

  private bindLifecycleHandlers(): void {
    // Connectivity awareness
    window.addEventListener('online', () => {
      console.log('🌐 Online - ensuring signaling and P2P')
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connectToSignaling()
      }
      if (this.userCount >= 2) {
        if (this.pc && this.pc.connectionState !== 'connected') {
          try { this.pc.restartIce() } catch {}
          this.ensurePeerConnection()
        }
      }
    })

    window.addEventListener('offline', () => {
      console.log('🌐 Offline - will auto-recover when back online')
      this.setReconnecting()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Give the browser a moment to unthrottle timers, then recover if needed
        if (this.visibilityTimer) clearTimeout(this.visibilityTimer)
        this.visibilityTimer = setTimeout(() => {
          if (!this.isDestroyed) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              this.connectToSignaling()
            }
            if (this.userCount >= 2) {
              if (this.pc && this.pc.connectionState !== 'connected') {
                try { this.pc.restartIce() } catch {}
                this.ensurePeerConnection()
              }
            }
          }
        }, 500)
      }
    })
  }
}
