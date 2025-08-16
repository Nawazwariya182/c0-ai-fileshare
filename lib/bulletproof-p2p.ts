export interface SignalingMessage {
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

export interface ClientInfo {
  isMobile: boolean
  browser: string
  timestamp: number
  url: string
}

export interface IncomingFileData {
  chunks: Map<number, ArrayBuffer>
  totalChunks: number
  fileName: string
  fileSize: number
  fileType: string
  receivedChunks: number
  startTime: number
  lastChunkTime: number
  bytesReceived: number
  // New: track async decrypts to avoid "complete before finished decrypt" on mobile
  pendingDecrypts: number
  waiters: Array<() => void>
}

type EncryptionAlgo = 'django-fernet' | 'aes-gcm-chunked'
type CompressionAlgo = 'gzip' | 'bzip2' | 'lzma' | 'none'

type EncAesGcmChunked = {
  algo: 'aes-gcm-chunked'
  key: string // base64 raw 256-bit key (per file)
  iv: string // base64 12-byte base IV (per file)
  originalName: string
  tagLength?: number // bits, default 128
  chunkSize?: number // informational
}
type EncDjangoFernet = {
  algo: 'django-fernet'
  key: string // Django Fernet key
  originalName: string
}
export type EncryptionInfo = EncAesGcmChunked | EncDjangoFernet

export interface CompressionInfo {
  algorithm: CompressionAlgo
  originalSize: number
  compressedSize: number
  compressionRatio: number
  spaceSaved: number
}

export interface FileMetadata {
  fileName: string
  fileSize: number
  fileType: string
  encryption?: EncryptionInfo
  compression?: CompressionInfo
}

export interface FileOfferData {
  fileId: string
  fileName: string
  fileSize: number
  fileType: string
  encryption?: EncryptionInfo
  compression?: CompressionInfo
}
export interface FileAcceptData {
  fileId: string
}
export interface FileCompleteData {
  fileId: string
  fileName?: string
  totalChunks?: number
  fileSize?: number
}

export interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: 'pending' | 'transferring' | 'completed' | 'error' | 'cancelled'
  direction: 'sending' | 'receiving'
  speed?: number
  eta?: number
  startTime?: number
  endTime?: number
  bytesTransferred?: number
}

export interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: 'text' | 'clipboard'
}

export type P2PMessageType =
  | 'file-offer'
  | 'file-accept'
  | 'file-complete'
  | 'file-cancel'
  | 'chat-message'
  | 'ping'
  | 'pong'

export interface P2PMessage {
  type: P2PMessageType
  data: any
  timestamp: number
  id: string
}

export type ConnectionStatus = 'waiting' | 'connecting' | 'connected' | 'reconnecting'
export type ConnectionQuality = 'excellent' | 'good' | 'poor'
export type Timer = ReturnType<typeof setTimeout>
export type Interval = ReturnType<typeof setInterval>

type EncryptionMode = 'local' | 'django' | 'none'
export type CompressionMode = 'auto' | 'always' | 'never'

export class BulletproofP2P {
  private sessionId: string
  private userId: string

  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private isInitiator = false

  // State
  private connectionStatus: ConnectionStatus = 'connecting'
  private signalingStatus: ConnectionStatus = 'connecting'
  private connectionQuality: ConnectionQuality = 'excellent'
  private currentSpeed = 0
  private userCount = 0

  // Configuration
  private compressionMode: CompressionMode = 'auto'
  private compressionUrl = 'https://django-compress.onrender.com' // Default local compression service
  private isDestroyed = false

  // Timers
  private connectionRetryTimeout: Timer | null = null
  private signalingRetryTimeout: Timer | null = null
  private pingInterval: Interval | null = null

  // File state
  private fileTransfers = new Map<string, FileTransfer>()
  private incomingFiles = new Map<string, IncomingFileData>()
  private sendingFiles = new Map<string, File>() // plaintext or django-encrypted
  private activeTransfers = new Set<string>()

  // Encryption state
  private incomingEncryption = new Map<string, EncryptionInfo>()
  private incomingCompression = new Map<string, CompressionInfo>()
  private incomingLocalKeys = new Map<string, CryptoKey>() // fileId -> CryptoKey (AES)
  private outgoingLocalAes = new Map<string, { key: CryptoKey; baseIv: Uint8Array; keyB64: string; ivB64: string }>()
  private encryptionMode: EncryptionMode = 'local'

  // Offer resend tracking
  private offerResendTimers = new Map<string, Timer>()
  private offersWaiting = new Set<string>()

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

  // High-throughput flow control (adaptive) - Optimized for 200MB files
  private DESIRED_CHUNK_SIZE = 512 * 1024 // Increased for faster transfer of larger files
  private MIN_CHUNK_SIZE = 16 * 1024 // Increased minimum for better performance
  private chunkSize = 128 * 1024 // Increased initial chunk size
  private MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024 // Increased buffer for 200MB files
  private BUFFERED_AMOUNT_LOW_THRESHOLD = 2 * 1024 * 1024 // Increased threshold
  private PROGRESS_UPDATE_INTERVAL = 120
  private goodStreak = 0

  // ICE recovery
  private ICE_RECOVERY_DELAY = 1500

  // Signaling rotation with backoff
  private signalingServers: string[] = []
  private currentServerIndex = 0
  private backoffAttempts = 0
  private SIGNALING_RETRY_BASE = 2000
  private SIGNALING_RETRY_MAX = 15000

  // TURN/STUN
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
          'turns:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }

  private lastClientInfo?: ClientInfo

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initSignalingServers()
    this.encryptionMode = this.detectEncryptionMode()
    console.log(`🚀 BulletproofP2P for session ${sessionId} (user ${userId}) mode=${this.encryptionMode}`)
  }

  // Configuration methods
  public setCompressionMode(mode: CompressionMode): void {
    this.compressionMode = mode
    console.log(`📦 Compression mode set to: ${mode}`)
  }

  public setCompressionUrl(url: string): void {
    this.compressionUrl = url
    console.log(`📦 Compression service URL set to: ${url}`)
  }

  public getCompressionConfig(): { mode: CompressionMode; url: string } {
    return {
      mode: this.compressionMode,
      url: this.compressionUrl
    }
  }

  async initialize(): Promise<void> {
    this.isDestroyed = false
    await this.connectToSignaling()
    this.startKeepAlive()
  }

  public reconnectIfNeeded(): void {
    if (this.isDestroyed) return
    if (this.userCount >= 2) {
      if (!this.pc || this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.resetPeer('reconnectIfNeeded')
        this.ensurePeer()
      } else if (this.dc && this.dc.readyState !== 'open' && this.isInitiator) {
        try { this.dc.close() } catch {}
        this.dc = null
        this.negotiate()
      }
    }
  }

  public async ensureReadyForSend(timeoutMs = 8000): Promise<boolean> {
    const start = Date.now()
    this.reconnectIfNeeded()
    while (Date.now() - start < timeoutMs) {
      if (this.dc && this.dc.readyState === 'open') return true
      await this.sleep(200)
    }
    return false
  }

  // Django fallback (optional)
  private getDjangoBaseUrl(): string {
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
  private isMixedContentBlocked(url: string) {
    try {
      const pageHttps = window.location.protocol === 'https:'
      const target = new URL(url)
      return pageHttps && target.protocol === 'http:'
    } catch {
      return false
    }
  }
  private async getDjangoKey(timeoutMs = 6000): Promise<string> {
    const base = this.getDjangoBaseUrl().replace(/\/$/, '')
    if (this.isMixedContentBlocked(base)) throw new Error('Mixed content: Django URL must be https when page is https')
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
    try {
      const res = await fetch(`${base}/api/key`, { method: 'GET', signal: ctrl.signal as any })
      if (!res.ok) throw new Error(`Django /key failed ${res.status}`)
      const json = (await res.json().catch(() => null as any)) as any
      const key = json?.key
      if (!key) throw new Error('Invalid key payload')
      return key
    } finally { clearTimeout(to) }
  }

  // Compression methods
  private async compressFile(file: File): Promise<{ blob: Blob; algorithm: string; stats: any } | null> {
    try {
      const base = this.compressionUrl.replace(/\/$/, '')
      
      // Check if compression service is available
      const healthRes = await fetch(`${base}/health/`, { method: 'GET' }).catch(() => null)
      if (!healthRes?.ok) {
        console.log('Compression service not available, sending uncompressed')
        return null
      }

      // Check if file is likely already compressed
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const compressedExtensions = ['zip', 'rar', '7z', 'gz', 'bz2', 'xz', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4', 'avi', 'mkv', 'pdf']
      if (compressedExtensions.includes(extension)) {
        console.log(`File ${file.name} appears to be already compressed, skipping compression`)
        return null
      }

      // Choose algorithm based on file size and type
      let algorithm = 'gzip' // default
      if (file.size > 100 * 1024 * 1024) { // > 100MB
        algorithm = 'lzma' // best compression for large files
      } else if (file.size > 10 * 1024 * 1024) { // > 10MB
        algorithm = 'bzip2' // balanced
      }

      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('algorithm', algorithm)

      const ctrl = new AbortController()
      const timeout = Math.max(60000, Math.min(300000, file.size / 10000)) // 1-5 minutes based on file size
      const to = setTimeout(() => ctrl.abort('timeout'), timeout)
      
      try {
        const res = await fetch(`${base}/api/compress/`, { 
          method: 'POST', 
          body: fd, 
          signal: ctrl.signal as any 
        })
        
        if (!res.ok) {
          console.warn(`Compression failed ${res.status}, sending uncompressed`)
          return null
        }

        const blob = await res.blob()
        
        // Get compression stats from headers
        const stats = {
          algorithm: res.headers.get('X-Algorithm') || algorithm,
          originalSize: parseInt(res.headers.get('X-Original-Size') || '0'),
          compressedSize: parseInt(res.headers.get('X-Compressed-Size') || '0'),
          compressionRatio: parseFloat(res.headers.get('X-Compression-Ratio') || '0'),
          spaceSaved: parseFloat(res.headers.get('X-Space-Saved') || '0'),
          compressionTime: parseFloat(res.headers.get('X-Compression-Time') || '0')
        }

        // Only use compressed version if we saved significant space (>10%)
        if (stats.spaceSaved > 10) {
          console.log(`Compressed ${file.name}: ${stats.originalSize} -> ${stats.compressedSize} bytes (${stats.spaceSaved}% saved)`)
          return { blob, algorithm, stats }
        } else {
          console.log(`Compression not beneficial for ${file.name} (${stats.spaceSaved}% saved), sending uncompressed`)
          return null
        }
      } finally { 
        clearTimeout(to) 
      }
    } catch (e) {
      console.warn('Compression failed, sending uncompressed:', e)
      return null
    }
  }

  private async decompressFile(blob: Blob, algorithm?: string): Promise<Blob | null> {
    try {
      const base = this.compressionUrl.replace(/\/$/, '')
      
      const fd = new FormData()
      fd.append('file', blob, `compressed.${algorithm || 'bin'}`)
      if (algorithm) {
        fd.append('algorithm', algorithm)
      }

      const ctrl = new AbortController()
      const timeout = Math.max(60000, Math.min(300000, blob.size / 10000))
      const to = setTimeout(() => ctrl.abort('timeout'), timeout)
      
      try {
        const res = await fetch(`${base}/api/decompress/`, { 
          method: 'POST', 
          body: fd, 
          signal: ctrl.signal as any 
        })
        
        if (!res.ok) {
          console.warn(`Decompression failed ${res.status}`)
          return null
        }

        const decompressed = await res.blob()
        console.log(`Decompressed file: ${blob.size} -> ${decompressed.size} bytes`)
        return decompressed
      } finally { 
        clearTimeout(to) 
      }
    } catch (e) {
      console.warn('Decompression failed:', e)
      return null
    }
  }

  private async encryptViaDjango(file: File): Promise<{ blob: Blob; key: string } | null> {
    try {
      const base = this.getDjangoBaseUrl().replace(/\/$/, '')
      if (this.isMixedContentBlocked(base)) {
        console.warn('⚠️ Mixed content, skipping encryption (use https Django URL)')
        return null
      }
      const key = await this.getDjangoKey()
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('key', key)
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort('timeout'), Math.max(120000, Math.min(600000, file.size / 1000)))
      try {
        const res = await fetch(`${base}/api/encrypt`, { method: 'POST', body: fd, signal: ctrl.signal as any })
        if (!res.ok) throw new Error(`Encrypt failed ${res.status}`)
        const blob = await res.blob()
        return { blob, key }
      } finally { clearTimeout(to) }
    } catch (e) {
      console.warn('⚠️ Encrypt via Django failed, falling back to plain or local encryption', e)
      return null
    }
  }
  private async decryptViaDjango(blob: Blob, key: string): Promise<Blob | null> {
    try {
      const base = this.getDjangoBaseUrl().replace(/\/$/, '')
      if (this.isMixedContentBlocked(base)) {
        console.warn('⚠️ Mixed content, skipping decrypt (use https Django URL)')
        return null
      }
      const fd = new FormData()
      fd.append('file', blob, 'file.enc')
      fd.append('key', key)
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort('timeout'), Math.max(120000, Math.min(600000, blob.size / 1000)))
      try {
        const res = await fetch(`${base}/api/decrypt`, { method: 'POST', body: fd, signal: ctrl.signal as any })
        if (!res.ok) throw new Error(`Decrypt failed ${res.status}`)
        return await res.blob()
      } finally { clearTimeout(to) }
    } catch (e) {
      console.error('❌ Decrypt via Django failed', e)
      return null
    }
  }

  // Local AES-GCM (fast path)
  private detectEncryptionMode(): EncryptionMode {
    try {
      const p = new URLSearchParams(window.location.search)
      const enc = (p.get('enc') || '').toLowerCase()
      const hasSubtle = typeof window !== 'undefined' && !!window.crypto?.subtle
      if (enc === 'none') return 'none'
      if (enc === 'django') return 'django'
      if (hasSubtle) return 'local'
      return 'django'
    } catch {
      return 'local'
    }
  }
  private async generateAesKey(): Promise<{ key: CryptoKey; rawB64: string }> {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const raw = await crypto.subtle.exportKey('raw', key)
    return { key, rawB64: this.toBase64(raw) }
  }
  private async importAesKey(b64: string): Promise<CryptoKey> {
    const raw = this.fromBase64(b64)
    // Ensure WebCrypto receives an ArrayBuffer, not a generic Uint8Array<ArrayBufferLike>
    const keyData = raw.slice().buffer as ArrayBuffer
    return await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  private makeBaseIv(): Uint8Array {
    const iv = new Uint8Array(12)
    crypto.getRandomValues(iv)
    return iv
  }
  private deriveChunkIv(baseIv: Uint8Array, seq: number): Uint8Array {
    const iv = new Uint8Array(12)
    iv.set(baseIv.subarray(0, 8), 0)
    iv[8] = (seq >>> 24) & 0xff
    iv[9] = (seq >>> 16) & 0xff
    iv[10] = (seq >>> 8) & 0xff
    iv[11] = seq & 0xff
    return iv
  }

  async sendFiles(files: File[]): Promise<void> {
    const ready = await this.ensureReadyForSend(5000)
    if (!ready) { this.onError?.('Not connected - cannot send files'); return }

    for (const original of files) {
      let fileToSend = original
      let encInfo: EncryptionInfo | undefined
      let compInfo: CompressionInfo | undefined

      // Step 1: Compression (if enabled and beneficial)
      if (this.compressionMode === 'always' || this.compressionMode === 'auto') {
        const compressed = await this.compressFile(original)
        if (compressed) {
          fileToSend = new File([compressed.blob], `${original.name}.${compressed.algorithm}`, { 
            type: 'application/octet-stream' 
          })
          compInfo = {
            algorithm: compressed.algorithm as CompressionAlgo,
            originalSize: compressed.stats.originalSize,
            compressedSize: compressed.stats.compressedSize,
            compressionRatio: compressed.stats.compressionRatio,
            spaceSaved: compressed.stats.spaceSaved
          }
          console.log(`📦 Compressed ${original.name}: ${compInfo.spaceSaved}% space saved`)
        }
      }

      // Step 2: Encryption (if enabled)
      if (this.encryptionMode === 'local' && crypto?.subtle) {
        const { key, rawB64 } = await this.generateAesKey()
        const baseIv = this.makeBaseIv()
        const ivB64 = this.toBase64(baseIv.buffer)
        const fileId = this.id()
        this.outgoingLocalAes.set(fileId, { key, baseIv, keyB64: rawB64, ivB64 })
        encInfo = { algo: 'aes-gcm-chunked', key: rawB64, iv: ivB64, originalName: original.name, tagLength: 128 }
        this.registerSenderTransfer(fileId, original, encInfo)
        this.sendFileOffer(fileId, { 
          fileName: original.name, 
          fileSize: original.size, 
          fileType: original.type, 
          encryption: encInfo,
          compression: compInfo 
        })
        continue
      }

      if (this.encryptionMode === 'django') {
        const enc = await this.encryptViaDjango(fileToSend) // Encrypt the possibly compressed file
        if (enc) {
          fileToSend = new File([enc.blob], `${fileToSend.name}.enc`, { type: 'application/octet-stream' })
          encInfo = { algo: 'django-fernet', key: enc.key, originalName: original.name }
          console.log(`🔒 Encrypted ${original.name}${compInfo ? ' (after compression)' : ''}`)
        }
      }

      const fileId = this.id()
      this.sendingFiles.set(fileId, fileToSend)
      const transfer: FileTransfer = {
        id: fileId,
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        progress: 0,
        status: 'pending',
        direction: 'sending',
        speed: 0,
        startTime: Date.now(),
        bytesTransferred: 0,
      }
      this.fileTransfers.set(fileId, transfer)
      this.updateFileTransfers()
      this.sendFileOffer(fileId, { fileName: fileToSend.name, fileSize: fileToSend.size, fileType: fileToSend.type, encryption: encInfo, compression: compInfo })
    }
  }

  sendMessage(message: ChatMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') { this.onError?.('Not connected - cannot send message'); return }
    this.sendP2P({ type: 'chat-message', data: { content: message.content, sender: message.sender, type: message.type }, timestamp: Date.now(), id: message.id })
  }

  getConnectionStatus(): ConnectionStatus { return this.connectionStatus }
  getSignalingStatus(): ConnectionStatus { return this.signalingStatus }
  getConnectionQuality(): ConnectionQuality { return this.connectionQuality }
  getCurrentSpeed(): number { return this.currentSpeed }
  getUserCount(): number { return this.userCount }
  getFileTransfers(): FileTransfer[] { return Array.from(this.fileTransfers.values()) }
  getChatMessages(): ChatMessage[] { return [] }

  destroy(): void {
    console.log('🛑 Destroying P2P...')
    this.isDestroyed = true
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.connectionRetryTimeout) clearTimeout(this.connectionRetryTimeout)
    if (this.signalingRetryTimeout) clearTimeout(this.signalingRetryTimeout)
    for (const t of this.offerResendTimers.values()) clearTimeout(t)
    this.offerResendTimers.clear()
    this.offersWaiting.clear()
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    try { this.ws?.close(1000, 'Client disconnect') } catch {}
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.activeTransfers.clear()
    this.incomingEncryption.clear()
    this.incomingLocalKeys.clear()
    this.outgoingLocalAes.clear()
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
        'wss://bulletproof-p2p-server.onrender.com',
      )
    }
  }

  private async connectToSignaling(): Promise<void> {
    if (this.isDestroyed) return
    this.signalingStatus = 'connecting'
    this.onSignalingStatusChange?.(this.signalingStatus)
    for (let i = 0; i < this.signalingServers.length && !this.isDestroyed; i++) {
      const url = this.signalingServers[this.currentServerIndex]
      const ok = await this.trySignaling(url)
      if (ok) {
        this.backoffAttempts = 0
        this.signalingStatus = 'connected'
        this.onSignalingStatusChange?.(this.signalingStatus)
        return
      }
      this.currentServerIndex = (this.currentServerIndex + 1) % this.signalingServers.length
      await this.sleep(300)
    }
    const delay = Math.min(this.SIGNALING_RETRY_BASE * Math.pow(2, this.backoffAttempts++), this.SIGNALING_RETRY_MAX) + Math.floor(Math.random() * 500)
    console.log(`🔄 Signaling retry in ${delay}ms`)
    this.signalingStatus = 'reconnecting'
    this.onSignalingStatusChange?.(this.signalingStatus)
    this.signalingRetryTimeout = setTimeout(() => { if (!this.isDestroyed) this.connectToSignaling() }, delay)
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
          const info: ClientInfo = {
            isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
            browser: this.browser(),
            timestamp: Date.now(),
            url,
          }
          this.lastClientInfo = info
          this.sendWS({ type: 'join', sessionId: this.sessionId, userId: this.userId, clientInfo: info })
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
    this.ws.onclose = () => { if (!this.isDestroyed) this.connectToSignaling() }
    this.ws.onerror = (e) => console.log('❌ WS error', e)
  }

  private async onSignaling(message: SignalingMessage): Promise<void> {
    if (this.connectionStatus !== 'connected') this.setConnecting()
    switch (message.type) {
      case 'connected':
        break
      case 'joined':
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        if (this.userCount >= 2) this.ensurePeer()
        this.setConnecting()
        break
      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        if (this.userCount >= 2) this.ensurePeer()
        this.setConnecting()
        break
      case 'p2p-ready':
        this.ensurePeer()
        break
      case 'user-left':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
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
      case 'keep-alive-ack':
        break
      case 'session-expired':
        this.onError?.('Session expired - please reconnect')
        this.setReconnecting()
        break
      case 'error': {
        const m = String(message.message || 'Signaling error')
        console.log('⚠️ signaling error:', m)
        this.onError?.(m)
        if (/Session is full/i.test(m)) {
          setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.sendWS({ type: 'join', sessionId: this.sessionId, userId: this.userId, clientInfo: this.lastClientInfo })
            }
          }, 1200 + Math.floor(Math.random() * 400))
        }
        break
      }
    }
  }

  // Peer
  private ensurePeer(): void {
    if (this.pc && (this.pc.connectionState === 'connected' || this.pc.connectionState === 'connecting')) return
    this.createPC()
    if (this.isInitiator) {
      this.dc = this.pc!.createDataChannel('bulletproof-reliable', { ordered: true })
      this.setupDC(this.dc)
      this.negotiate()
    }
  }

  private createPC(): void {
    if (this.pc) { try { this.pc.close() } catch {} }
    this.pc = new RTCPeerConnection(this.rtcConfig)

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sendWS({ type: 'ice-candidate', candidate: e.candidate.toJSON(), sessionId: this.sessionId })
    }
    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState
      if (st === 'connected') {
        this.connectionStatus = 'connected'
        this.onConnectionStatusChange?.(this.connectionStatus)
        this.onConnectionRecovery?.()
      } else if (st === 'disconnected' || st === 'failed') {
        try { this.pc?.restartIce() } catch {}
        if (this.activeTransfers.size === 0) {
          this.setReconnecting()
          if (!this.connectionRetryTimeout) {
            this.connectionRetryTimeout = setTimeout(() => {
              this.connectionRetryTimeout = null
              if (!this.isDestroyed && this.userCount >= 2) {
                this.resetPeer('ice failure')
                this.ensurePeer()
              }
            }, this.ICE_RECOVERY_DELAY)
          }
        } else {
          this.setReconnecting()
        }
      } else {
        this.setConnecting()
      }
    }
    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState
      if (st === 'failed' || st === 'disconnected') {
        try { this.pc?.restartIce() } catch {}
        this.setReconnecting()
      }
    }
    this.pc.ondatachannel = (ev) => {
      this.dc = ev.channel
      this.setupDC(this.dc)
    }
  }

  private async negotiate(): Promise<void> {
    if (!this.pc) return
    try {
      const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
      await this.pc.setLocalDescription(offer)
      this.sendWS({ type: 'offer', offer, sessionId: this.sessionId })
    } catch (e) {
      console.error('❌ negotiate offer', e)
      this.onError?.('Failed to negotiate P2P')
    }
  }

  private async onOffer(msg: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) this.createPC()
      if (!msg.offer) return
      await this.pc!.setRemoteDescription(msg.offer)
      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)
      this.sendWS({ type: 'answer', answer, sessionId: this.sessionId })
    } catch (e) {
      console.error('❌ onOffer', e)
      this.setReconnecting()
    }
  }

  private async onAnswer(msg: SignalingMessage): Promise<void> {
    try {
      if (this.pc && msg.answer) await this.pc.setRemoteDescription(msg.answer)
    } catch (e) {
      console.error('❌ onAnswer', e)
      this.setReconnecting()
    }
  }

  private async onRemoteIce(msg: SignalingMessage): Promise<void> {
    try {
      if (this.pc && msg.candidate) await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
    } catch (e) { console.error('❌ add ICE', e) }
  }

  // DC
  private setupDC(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile) {
      // More conservative defaults for mobile to avoid stalls and message-too-large errors
      this.DESIRED_CHUNK_SIZE = 24 * 1024
      this.MAX_BUFFERED_AMOUNT = 512 * 1024
      this.BUFFERED_AMOUNT_LOW_THRESHOLD = 96 * 1024
      this.PROGRESS_UPDATE_INTERVAL = 160
    }
    channel.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    channel.onopen = () => {
      this.selectChunkSize()
      this.connectionStatus = 'connected'
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    channel.onclose = () => this.setReconnecting()
    channel.onerror = (e) => { console.error('❌ DC error', e); this.setReconnecting() }
    channel.onmessage = (ev) => this.onDCMessage(ev.data)
  }

  private onDCMessage(data: string | ArrayBuffer): void {
    try {
      if (typeof data === 'string') {
        const msg: P2PMessage = JSON.parse(data)
        this.onP2P(msg)
      } else {
        this.onFileChunk(data)
      }
    } catch (e) { console.error('❌ DC parse', e) }
  }

  private onP2P(msg: P2PMessage): void {
    switch (msg.type) {
      case 'chat-message': {
        const chat: ChatMessage = { id: msg.id, content: msg.data.content, sender: msg.data.sender, timestamp: new Date(msg.timestamp), type: msg.data.type }
        this.onChatMessage?.(chat)
        break
      }
      case 'file-offer':
        this.handleFileOffer(msg.data as FileOfferData)
        break
      case 'file-accept':
        this.handleFileAccept(msg.data as FileAcceptData)
        break
      case 'file-complete':
        this.onFileComplete(msg.data as FileCompleteData)
        break
      case 'ping':
        this.sendP2P({ type: 'pong', data: { timestamp: Date.now() }, timestamp: Date.now(), id: this.id() })
        break
      case 'pong':
        this.connectionLatency = Date.now() - this.lastPingTime
        this.updateQuality()
        break
    }
  }

  // Offers
  private sendFileOffer(fileId: string, meta: { fileName: string; fileSize: number; fileType: string; encryption?: EncryptionInfo; compression?: CompressionInfo }) {
    this.offersWaiting.add(fileId)
    const send = () => {
      this.sendP2P({
        type: 'file-offer',
        data: { fileId, fileName: meta.fileName, fileSize: meta.fileSize, fileType: meta.fileType, encryption: meta.encryption, compression: meta.compression } as FileOfferData,
        timestamp: Date.now(),
        id: this.id(),
      })
    }
    send()
    const schedule = (attempt: number) => {
      if (!this.offersWaiting.has(fileId)) return
      const delay = 900 + attempt * 700 + Math.floor(Math.random() * 300)
      const t = setTimeout(() => {
        if (!this.offersWaiting.has(fileId)) return
        if (attempt >= 5) {
          this.offersWaiting.delete(fileId)
          const tr = this.fileTransfers.get(fileId)
          if (tr) { tr.status = 'error'; this.updateFileTransfers() }
          this.onError?.('Peer did not accept file offer')
          return
        }
        this.reconnectIfNeeded()
        send()
        schedule(attempt + 1)
      }, delay)
      this.offerResendTimers.set(fileId, t)
    }
    schedule(1)
  }

  private registerSenderTransfer(fileId: string, file: File, _encInfo?: EncryptionInfo) {
    this.sendingFiles.set(fileId, file)
    const transfer: FileTransfer = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'pending',
      direction: 'sending',
      speed: 0,
      startTime: Date.now(),
      bytesTransferred: 0,
    }
    this.fileTransfers.set(fileId, transfer)
    this.updateFileTransfers()
  }

  private handleFileOffer(data: FileOfferData): void {
    if (data.encryption?.algo === 'django-fernet' || data.encryption?.algo === 'aes-gcm-chunked') {
      this.incomingEncryption.set(data.fileId, data.encryption)
    }
    if (data.compression) {
      this.incomingCompression.set(data.fileId, data.compression)
      console.log(`📦 File ${data.fileName} was compressed with ${data.compression.algorithm} (${data.compression.spaceSaved}% saved)`)
    }
    // Initialize receiver state now (so mobile can start building UI fast)
    if (!this.incomingFiles.has(data.fileId)) {
      const state: IncomingFileData = {
        chunks: new Map(),
        totalChunks: 0,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        receivedChunks: 0,
        startTime: Date.now(),
        lastChunkTime: Date.now(),
        bytesReceived: 0,
        pendingDecrypts: 0,
        waiters: [],
      }
      this.incomingFiles.set(data.fileId, state)
      const t: FileTransfer = {
        id: data.fileId,
        name: data.fileName,
        size: data.fileSize,
        type: data.fileType,
        progress: 0,
        status: 'transferring',
        direction: 'receiving',
        speed: 0,
        startTime: Date.now(),
        bytesTransferred: 0,
      }
      this.fileTransfers.set(data.fileId, t)
      this.activeTransfers.add(data.fileId)
      this.updateFileTransfers()
    }
    // Auto-accept
    this.sendP2P({ type: 'file-accept', data: { fileId: data.fileId }, timestamp: Date.now(), id: this.id() })
  }

  private async handleFileAccept(data: FileAcceptData): Promise<void> {
    if (this.offerResendTimers.has(data.fileId)) {
      clearTimeout(this.offerResendTimers.get(data.fileId) as Timer)
      this.offerResendTimers.delete(data.fileId)
    }
    this.offersWaiting.delete(data.fileId)

    const file = this.sendingFiles.get(data.fileId)
    if (!file) { console.warn('⚠️ accepted file not found', data.fileId); return }
    await this.sendFileAdaptive(file, data.fileId)
  }

  // Sender loop (with inline AES-GCM)
  private async sendFileAdaptive(file: File, fileId: string): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      const reopened = await this.waitForChannelOpen(8000)
      if (!reopened) { this.onError?.(`Connection lost before sending ${file.name}`); return }
    }
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    this.activeTransfers.add(fileId)
    transfer.status = 'transferring'
    transfer.startTime = Date.now()
    transfer.bytesTransferred = 0
    this.updateFileTransfers()

    let offset = 0
    let seq = 0
    let lastUI = 0
    const started = Date.now()
    const localEnc = this.outgoingLocalAes.get(fileId)
    const useLocalEnc = !!localEnc && this.encryptionMode === 'local' && crypto?.subtle

    try {
      while (offset < file.size) {
        if (!this.dc || this.dc.readyState !== 'open') {
          const reopened = await this.waitForChannelOpen(8000)
          if (!reopened) throw new Error('Data channel closed')
        }

        if (this.dc && this.dc.bufferedAmount > this.MAX_BUFFERED_AMOUNT) {
          await this.waitBufferedLow()
          continue
        }

        const sctpMax = this.getSctpMaxMessageSize()
        const headerProbe = new TextEncoder().encode(JSON.stringify({ fileId, seq, fileName: file.name, fileSize: file.size, fileType: file.type }))
        // Reserve ~80 bytes headroom for JSON/header/AES tag
        const maxForPayload = Math.max(this.MIN_CHUNK_SIZE, Math.min(this.chunkSize, sctpMax - 4 - headerProbe.length - 80))
        const size = Math.min(maxForPayload, file.size - offset)
        const plainAb = await file.slice(offset, offset + size).arrayBuffer()

        let payload: ArrayBuffer = plainAb
        if (useLocalEnc) {
          const iv = this.deriveChunkIv(localEnc.baseIv, seq)
          // TS 5.4+ BufferSource expects ArrayBuffer, not Uint8Array<ArrayBufferLike>
          const ivAb = iv.slice().buffer as ArrayBuffer
          payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivAb }, localEnc.key, plainAb)
        }

        const header = { fileId, seq, fileName: file.name, fileSize: file.size, fileType: file.type }
        const headerBytes = new TextEncoder().encode(JSON.stringify(header))
        const totalLen = 4 + headerBytes.length + payload.byteLength
        if (totalLen > sctpMax) {
          this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
          continue
        }

        const out = new Uint8Array(totalLen)
        new DataView(out.buffer).setUint32(0, headerBytes.length, true)
        out.set(headerBytes, 4)
        out.set(new Uint8Array(payload), 4 + headerBytes.length)
        await this.safeSend(out.buffer)

        offset += (plainAb.byteLength)
        seq++
        transfer.bytesTransferred! = offset

        // Dynamic tuning biased for stability
        const dc = this.dc
        if (dc && dc.bufferedAmount < ((dc.bufferedAmountLowThreshold || this.BUFFERED_AMOUNT_LOW_THRESHOLD) / 2)) {
          this.goodStreak++
          if (this.goodStreak >= 6) {
            const newSize = Math.min(this.chunkSize * 2, Math.max(this.DESIRED_CHUNK_SIZE, sctpMax - 4096))
            if (newSize > this.chunkSize) this.chunkSize = newSize
            this.goodStreak = 0
          }
        } else {
          this.goodStreak = Math.max(0, this.goodStreak - 1)
        }

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

      this.sendP2P({ type: 'file-complete', data: { fileId, fileName: file.name, fileSize: file.size }, timestamp: Date.now(), id: this.id() })
      transfer.status = 'completed'
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()
      console.log(`✅ Sent ${file.name} @ ${this.prettySpeed(transfer.speed || 0)}`)
    } catch (e) {
      console.error(`❌ Failed to send ${file.name}`, e)
      transfer.status = 'error'
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    } finally {
      this.activeTransfers.delete(fileId)
      this.sendingFiles.delete(fileId)
      this.outgoingLocalAes.delete(fileId)
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
          bytesReceived: 0,
          pendingDecrypts: 0,
          waiters: [],
        }
        this.incomingFiles.set(fileId, state)
        const transfer: FileTransfer = {
          id: fileId,
          name: fileName,
          size: fileSize,
          type: fileType,
          progress: 0,
          status: 'transferring',
          direction: 'receiving',
          speed: 0,
          startTime: Date.now(),
          bytesTransferred: 0,
        }
        this.fileTransfers.set(fileId, transfer)
        this.activeTransfers.add(fileId)
      }

      const inc = this.incomingFiles.get(fileId)!
      const t = this.fileTransfers.get(fileId)!
      const seq: number = typeof header.seq === 'number' ? header.seq : inc.receivedChunks
      const enc = this.incomingEncryption.get(fileId)

      const handleChunk = async () => {
        inc.pendingDecrypts++
        try {
          let plain: ArrayBuffer = chunk
          if (enc?.algo === 'aes-gcm-chunked' && crypto?.subtle) {
            let key = this.incomingLocalKeys.get(fileId)
            if (!key) {
              key = await this.importAesKey(enc.key)
              this.incomingLocalKeys.set(fileId, key)
            }
            const baseIv = new Uint8Array(this.fromBase64((enc as EncAesGcmChunked).iv))
            const iv = this.deriveChunkIv(baseIv, seq)
            // TS 5.4+ BufferSource expects ArrayBuffer, not Uint8Array<ArrayBufferLike>
            const ivAb = iv.slice().buffer as ArrayBuffer
            try {
              plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivAb }, key, chunk)
            } catch (e) {
              console.error('❌ AES-GCM decrypt failed', e)
              plain = new ArrayBuffer(0)
            }
          }

          if (!inc.chunks.has(seq)) {
            inc.chunks.set(seq, plain)
            inc.receivedChunks++
            inc.lastChunkTime = Date.now()
            const delta = plain.byteLength
            inc.bytesReceived += delta

            const now = Date.now()
            const elapsed = (now - inc.startTime) / 1000
            const speed = elapsed > 0 ? Math.round(inc.bytesReceived / elapsed) : 0
            t.bytesTransferred = inc.bytesReceived
            t.speed = speed
            t.progress = Math.min(99, Math.floor((inc.bytesReceived / inc.fileSize) * 100))
            t.eta = speed > 0 ? Math.round((inc.fileSize - inc.bytesReceived) / speed) : 0
            this.updateFileTransfers()
          }
        } finally {
          inc.pendingDecrypts--
          if (inc.pendingDecrypts <= 0) this.notifyDecryptWaiters(fileId)
        }
      }

      void handleChunk()
    } catch (e) {
      console.error('❌ onFileChunk', e)
    }
  }

  private notifyDecryptWaiters(fileId: string) {
    const inc = this.incomingFiles.get(fileId)
    if (!inc) return
    if (inc.pendingDecrypts <= 0) {
      const waiters = [...inc.waiters]
      inc.waiters.length = 0
      waiters.forEach((fn) => { try { fn() } catch {} })
    }
  }

  private waitForAllDecrypts(fileId: string, timeoutMs = 8000): Promise<void> {
    const inc = this.incomingFiles.get(fileId)
    if (!inc) return Promise.resolve()
    if (inc.pendingDecrypts <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      let done = false
      const to = setTimeout(() => { if (!done) { done = true; resolve() } }, timeoutMs)
      inc.waiters.push(() => {
        if (!done) {
          done = true
          clearTimeout(to)
          resolve()
        }
      })
    })
  }

  private async onFileComplete(data: FileCompleteData): Promise<void> {
    const inc = this.incomingFiles.get(data.fileId)
    const t = this.fileTransfers.get(data.fileId)

    // Sender ACK
    if (!inc) {
      if (t && t.direction === 'sending') {
        t.status = 'completed'
        t.progress = 100
        this.updateFileTransfers()
      }
      return
    }

    // Important: ensure all pending decrypts finished (mobile devices may lag)
    await this.waitForAllDecrypts(data.fileId, 10000)

    if (inc.bytesReceived >= inc.fileSize) {
      await this.assemble(data.fileId)
    } else {
      // Give a final small grace period for slow devices
      setTimeout(async () => {
        const again = this.incomingFiles.get(data.fileId)
        const tr = this.fileTransfers.get(data.fileId)
        if (!again || !tr) return
        await this.waitForAllDecrypts(data.fileId, 3000)
        if (again.bytesReceived >= again.fileSize) {
          await this.assemble(data.fileId)
        } else {
          console.error(`❌ File incomplete: ${again.bytesReceived}/${again.fileSize}`)
          tr.status = 'error'
          this.updateFileTransfers()
          this.activeTransfers.delete(data.fileId)
        }
      }, 1200)
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

      // Step 1: Decrypt if needed
      const enc = this.incomingEncryption.get(fileId)
      if (enc?.algo === 'django-fernet') {
        const dec = await this.decryptViaDjango(blob, (enc as EncDjangoFernet).key)
        if (dec) { 
          blob = dec
          downloadName = enc.originalName
          console.log(`🔓 Decrypted ${downloadName}`)
        } else { 
          this.onError?.('Decryption failed - providing encrypted file instead') 
        }
      } else if (enc?.algo === 'aes-gcm-chunked') {
        downloadName = (enc as EncAesGcmChunked).originalName || downloadName
      }

      // Step 2: Decompress if needed
      const comp = this.incomingCompression.get(fileId)
      if (comp) {
        console.log(`📦 Decompressing ${downloadName} (${comp.algorithm})...`)
        const decompressed = await this.decompressFile(blob, comp.algorithm)
        if (decompressed) {
          blob = decompressed
          // Remove compression extension from filename
          const extensions = { gzip: '.gz', bzip2: '.bz2', lzma: '.xz' }
          const ext = extensions[comp.algorithm as keyof typeof extensions]
          if (downloadName.endsWith(ext)) {
            downloadName = downloadName.slice(0, -ext.length)
          }
          console.log(`🎉 Decompressed ${downloadName}: ${comp.compressedSize} -> ${blob.size} bytes`)
        } else {
          console.warn('Decompression failed, providing compressed file')
        }
      }

      const url = URL.createObjectURL(blob)
      const ua = navigator.userAgent || ''
      const isIOS = /iPad|iPhone|iPod/.test(ua)
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua)

      // iOS/Safari fallback: window.open when a[download] may be ignored
      if (isIOS || isSafari) {
        try { window.open(url, '_blank') } catch {}
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = downloadName
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      setTimeout(() => URL.revokeObjectURL(url), 1500)

      t.status = 'completed'
      t.progress = 100
      t.endTime = Date.now()
      this.updateFileTransfers()

      this.incomingFiles.delete(fileId)
      this.incomingEncryption.delete(fileId)
      this.incomingCompression.delete(fileId)
      this.incomingLocalKeys.delete(fileId)
      this.activeTransfers.delete(fileId)

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
        if (/message too large|operation/i.test(msg)) {
          this.chunkSize = Math.max(this.MIN_CHUNK_SIZE, Math.floor(this.chunkSize / 2))
          await this.sleep(2)
          continue
        }
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
    // Some engines (or states) may not fire 'bufferedamountlow'; add polling fallback
    return new Promise((resolve) => {
      let resolved = false
      const threshold = this.dc!.bufferedAmountLowThreshold || this.BUFFERED_AMOUNT_LOW_THRESHOLD
      const finish = () => {
        if (resolved) return
        resolved = true
        try { this.dc?.removeEventListener('bufferedamountlow', finish as any) } catch {}
        clearInterval(poll)
        resolve()
      }
      const poll = setInterval(() => {
        if (!this.dc) { finish(); return }
        if (this.dc.bufferedAmount <= threshold) finish()
      }, 50)
      try {
        this.dc?.addEventListener('bufferedamountlow', finish as any, { once: true } as any)
      } catch {
        // If addEventListener fails for this event, polling will resolve
      }
    })
  }

  private selectChunkSize(): void {
    const max = this.getSctpMaxMessageSize()
    const safe = Math.max(this.MIN_CHUNK_SIZE, Math.min(this.DESIRED_CHUNK_SIZE, max - 4096))
    this.chunkSize = safe
    // thresholds proportional to chunk
    this.BUFFERED_AMOUNT_LOW_THRESHOLD = Math.min  (2 * 1024 * 1024, Math.floor(this.chunkSize * 4))
    this.MAX_BUFFERED_AMOUNT = Math.max(4 * 1024 * 1024, this.BUFFERED_AMOUNT_LOW_THRESHOLD * 4)
    if (this.dc) this.dc.bufferedAmountLowThreshold = this.BUFFERED_AMOUNT_LOW_THRESHOLD
    console.log(`📏 SCTP max=${max}B, chunk=${this.chunkSize}B, low=${this.BUFFERED_AMOUNT_LOW_THRESHOLD}B maxBuf=${this.MAX_BUFFERED_AMOUNT}B`)
  }

  private getSctpMaxMessageSize(): number {
    const sctp = (this.pc as any)?.sctp
    let m = typeof sctp?.maxMessageSize === 'number' && isFinite(sctp.maxMessageSize) ? sctp.maxMessageSize : 0
    const ua = navigator.userAgent || ''
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
    if (!m || m <= 0) {
      // Conservative default; iOS/Safari can be lower
      m = isSafari ? 64 * 1024 : 256 * 1024
    }
    return Math.max(32 * 1024, m)
  }

  private async waitForChannelOpen(timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (this.dc && this.dc.readyState === 'open') return true
      await this.sleep(250)
    }
    return false
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
    if (this.connectionLatency < 100) this.connectionQuality = 'excellent'
    else if (this.connectionLatency < 300) this.connectionQuality = 'good'
    else this.connectionQuality = 'poor'
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
    if (this.connectionStatus !== 'connected') {
      const next: ConnectionStatus = this.connectionStatus === 'reconnecting' ? 'reconnecting' : 'connecting'
      if (next !== this.connectionStatus) {
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
  private resetPeer(_reason: string): void {
    if (this.activeTransfers.size > 0) { try { this.pc?.restartIce() } catch {}; return }
    try { this.dc?.close() } catch {}
    try { this.pc?.close() } catch {}
    this.dc = null
    this.pc = null
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

  private toBase64(buf: ArrayBufferLike): string {
    let binary = ''
    const bytes = new Uint8Array(buf)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }
  private fromBase64(b64: string): Uint8Array {
    const binary = atob(b64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
}
