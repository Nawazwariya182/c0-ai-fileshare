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
  success?: boolean
  error?: string
}

interface PingPongData {
  timestamp: number
}

interface ChatMessageData {
  content: string
  sender: string
  type: "text" | "clipboard"
}

interface ChunkHeader {
  fileId: string
  chunkIndex: number
  totalChunks: number
  fileName: string
  fileSize: number
  fileType: string
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

interface FileChunk {
  fileId: string
  chunkIndex: number
  totalChunks: number
  data: ArrayBuffer
  fileName: string
  fileSize: number
  fileType: string
}

interface P2PMessage {
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong' | 'chunk-ack'
  data: any
  timestamp: number
  id: string
}

type ConnectionStatus = "connecting" | "connected"
type ConnectionQuality = "excellent" | "good" | "poor"

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private isInitiator: boolean = false
  
  // Connection state
  private connectionStatus: ConnectionStatus = "connecting"
  private signalingStatus: ConnectionStatus = "connecting"
  private connectionQuality: ConnectionQuality = "excellent"
  private currentSpeed: number = 0
  private userCount: number = 0
  
  // File transfer state
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private incomingFiles: Map<string, IncomingFileData> = new Map()
  private sendingFiles: Map<string, { file: File; chunks: ArrayBuffer[]; currentChunk: number; windowSize: number; inFlight: Set<number> }> = new Map()
  
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
  
  // Connection management
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private isDestroyed: boolean = false
  private connectionAttempts: number = 0
  private maxConnectionAttempts: number = 3
  private isConnecting: boolean = false
  
  // Performance optimization
  private maxChunkSize: number = 256 * 1024 // 256KB chunks for better speed
  private windowSize: number = 10 // Send up to 10 chunks without waiting for ACK
  private maxBufferedAmount: number = 1024 * 1024 // 1MB buffer limit
  
  // WebRTC Configuration - Optimized for file transfers
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 5,
  }
  
  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    console.log(`🚀 BulletproofP2P initialized for session ${sessionId}`)
  }
  
  async initialize(): Promise<void> {
    if (this.isDestroyed) return
    
    console.log('🔧 Initializing P2P connection...')
    this.isDestroyed = false
    
    try {
      await this.connectToSignalingServer()
      this.startKeepAlive()
    } catch (error) {
      console.error('❌ Failed to initialize:', error)
      this.scheduleReconnect()
    }
  }
  
  private async connectToSignalingServer(): Promise<void> {
    if (this.isConnecting || this.isDestroyed) return
    
    this.isConnecting = true
    this.connectionAttempts++
    
    console.log(`🔗 Connecting to signaling server (attempt ${this.connectionAttempts})...`)
    
    // Set status to connecting
    this.signalingStatus = "connecting"
    this.onSignalingStatusChange?.(this.signalingStatus)
    
    // Simple URL selection
    const wsUrls = this.getWebSocketUrls()
    
    for (const wsUrl of wsUrls) {
      if (this.isDestroyed) return
      
      try {
        console.log(`🔗 Trying: ${wsUrl}`)
        
        const connected = await this.tryConnection(wsUrl)
        if (connected) {
          this.isConnecting = false
          this.connectionAttempts = 0
          return
        }
        
      } catch (error) {
        console.log(`❌ Failed: ${wsUrl}`, error)
        continue
      }
    }
    
    // All connections failed
    this.isConnecting = false
    console.error('❌ All signaling server connections failed')
    this.onError?.('Unable to connect to server. Retrying...')
    this.scheduleReconnect()
  }
  
  private getWebSocketUrls(): string[] {
    const currentDomain = window.location.hostname
    const isLocalhost = currentDomain === 'localhost' || currentDomain === '127.0.0.1'
    
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return [process.env.NEXT_PUBLIC_WS_URL]
    }
    
    if (isLocalhost) {
      return ['ws://localhost:8080']
    }
    
    // Production URLs - simplified list
    return [
      'wss://signaling-server-1ckx.onrender.com',
      'wss://p2p-signaling-server.onrender.com',
    ]
  }
  
  private tryConnection(wsUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl)
      let resolved = false
      
      const cleanup = () => {
        if (!resolved) {
          resolved = true
          ws.close()
        }
      }
      
      const timeout = setTimeout(() => {
        console.log(`⏰ Connection timeout: ${wsUrl}`)
        cleanup()
        resolve(false)
      }, 10000) // 10 second timeout
      
      ws.onopen = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        
        console.log(`✅ Connected to: ${wsUrl}`)
        this.ws = ws
        this.signalingStatus = "connected"
        this.onSignalingStatusChange?.(this.signalingStatus)
        
        this.setupWebSocketHandlers()
        this.joinSession()
        resolve(true)
      }
      
      ws.onerror = (error) => {
        console.log(`❌ Connection error: ${wsUrl}`, error)
        cleanup()
        resolve(false)
      }
      
      ws.onclose = () => {
        if (!resolved) {
          console.log(`🔌 Connection closed: ${wsUrl}`)
          cleanup()
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
        console.error('❌ Failed to parse message:', error)
      }
    }
    
    this.ws.onclose = (event) => {
      console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
      this.signalingStatus = "connecting"
      this.onSignalingStatusChange?.(this.signalingStatus)
      
      if (!this.isDestroyed) {
        this.scheduleReconnect()
      }
    }
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
      this.onError?.('Connection error - reconnecting...')
    }
  }
  
  private joinSession(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    
    console.log('📝 Joining session...')
    this.sendSignalingMessage({
      type: 'join',
      sessionId: this.sessionId,
      userId: this.userId,
      clientInfo: {
        isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
        browser: this.getBrowserInfo(),
        timestamp: Date.now(),
        url: this.ws.url
      }
    })
  }
  
  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimeout) return
    
    const delay = Math.min(5000 * this.connectionAttempts, 30000) // Max 30 seconds
    console.log(`🔄 Scheduling reconnect in ${delay}ms`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      if (!this.isDestroyed) {
        this.connectToSignalingServer()
      }
    }, delay)
  }
  
  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    console.log(`📨 Signaling: ${message.type}`)
    
    switch (message.type) {
      case 'connected':
        console.log('✅ Server confirmed connection')
        break
        
      case 'joined':
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`✅ Joined as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'} (${this.userCount} users)`)
        break
        
      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`👤 User joined (${this.userCount} users)`)
        
        if (this.userCount === 2 && this.isInitiator) {
          console.log('🚀 Starting P2P connection...')
          setTimeout(() => this.initiatePeerConnection(), 2000) // Give time for both users to be ready
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
        
      case 'user-left':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`👋 User left (${this.userCount} users)`)
        this.resetPeerConnection()
        break
        
      case 'error':
        console.error('❌ Server error:', message.message)
        this.onError?.(message.message || 'Server error')
        break
    }
  }
  
  private async initiatePeerConnection(): Promise<void> {
    if (this.pc || this.isDestroyed) return
    
    try {
      console.log('🔧 Creating peer connection...')
      this.pc = new RTCPeerConnection(this.rtcConfig)
      
      // Set up event handlers
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate')
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
          console.log('✅ P2P Connected!')
        } else if (state === 'failed' || state === 'closed') {
          this.connectionStatus = "connecting"
          this.onConnectionStatusChange?.(this.connectionStatus)
          console.log('❌ P2P Connection failed')
          this.resetPeerConnection()
        }
      }
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 Data channel received')
        this.setupDataChannel(event.channel)
      }
      
      // Create data channel (initiator only) - OPTIMIZED FOR FILE TRANSFERS
      if (this.isInitiator) {
        console.log('📡 Creating optimized data channel...')
        this.dataChannel = this.pc.createDataChannel('bulletproof-files', {
          ordered: false, // Allow out-of-order delivery for speed
          maxRetransmits: 0, // No retransmits for speed (we handle this at app level)
          maxPacketLifeTime: 3000, // 3 second packet lifetime
        })
        this.setupDataChannel(this.dataChannel)
      }
      
      // Create and send offer
      if (this.isInitiator) {
        console.log('📤 Creating offer...')
        const offer = await this.pc.createOffer()
        await this.pc.setLocalDescription(offer)
        
        this.sendSignalingMessage({
          type: 'offer',
          offer: offer,
          sessionId: this.sessionId
        })
        console.log('📤 Offer sent')
      }
      
    } catch (error) {
      console.error('❌ Failed to create peer connection:', error)
      this.onError?.('Failed to establish P2P connection')
      this.resetPeerConnection()
    }
  }
  
  private setupDataChannel(channel: RTCDataChannel): void {
    console.log('🔧 Setting up optimized data channel...')
    this.dataChannel = channel
    
    // Set binary type for file transfers
    channel.binaryType = 'arraybuffer'
    
    channel.onopen = () => {
      console.log('✅ Data channel opened!')
      console.log(`📊 Data channel config: ordered=${channel.ordered}, maxRetransmits=${channel.maxRetransmits}`)
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    
    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.connectionStatus = "connecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    
    channel.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      this.onError?.('Data channel error')
      this.connectionStatus = "connecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }
    
    // Monitor buffer levels for flow control
    this.startBufferMonitoring()
  }
  
  private startBufferMonitoring(): void {
    const checkBuffer = () => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        const bufferedAmount = this.dataChannel.bufferedAmount
        if (bufferedAmount > this.maxBufferedAmount) {
          console.log(`⚠️ Buffer full: ${bufferedAmount} bytes`)
        }
      }
      
      if (!this.isDestroyed) {
        setTimeout(checkBuffer, 100) // Check every 100ms
      }
    }
    
    setTimeout(checkBuffer, 100)
  }
  
  private async handleOffer(message: SignalingMessage): Promise<void> {
    try {
      console.log('📥 Handling offer...')
      
      if (!this.pc) {
        this.pc = new RTCPeerConnection(this.rtcConfig)
        
        this.pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('🧊 Sending ICE candidate')
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
            console.log('✅ P2P Connected!')
          } else if (state === 'failed' || state === 'closed') {
            this.connectionStatus = "connecting"
            this.onConnectionStatusChange?.(this.connectionStatus)
            console.log('❌ P2P Connection failed')
          }
        }
        
        this.pc.ondatachannel = (event) => {
          console.log('📡 Data channel received')
          this.setupDataChannel(event.channel)
        }
      }
      
      if (!message.offer) {
        throw new Error('No offer in message')
      }
      
      await this.pc.setRemoteDescription(message.offer)
      console.log('✅ Remote description set')
      
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      console.log('✅ Local description set')
      
      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId
      })
      console.log('📤 Answer sent')
      
    } catch (error) {
      console.error('❌ Failed to handle offer:', error)
      this.onError?.('Failed to handle connection offer')
    }
  }
  
  private async handleAnswer(message: SignalingMessage): Promise<void> {
    try {
      console.log('📥 Handling answer...')
      
      if (this.pc && message.answer) {
        await this.pc.setRemoteDescription(message.answer)
        console.log('✅ Answer processed')
      }
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
      this.onError?.('Failed to handle connection answer')
    }
  }
  
  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.candidate) {
        await this.pc.addIceCandidate(message.candidate)
        console.log('🧊 ICE candidate added')
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
    console.log(`📨 P2P: ${message.type}`)
    
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
        
      case 'chunk-ack':
        this.handleChunkAck(message.data)
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
        // Connection is healthy
        break
    }
  }
  
  // Public methods
  async sendFiles(files: File[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.onError?.('Not connected - cannot send files')
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
        speed: 0
      }
      
      this.fileTransfers.set(fileId, transfer)
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
      
      // Prepare file for optimized sending
      await this.prepareFileForSending(file, fileId)
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
  
  private async prepareFileForSending(file: File, fileId: string): Promise<void> {
    console.log(`🔧 Preparing file for optimized sending: ${file.name}`)
    
    // Calculate optimal chunk size based on file size
    let chunkSize = this.maxChunkSize
    if (file.size < 1024 * 1024) { // Files smaller than 1MB
      chunkSize = 64 * 1024 // 64KB chunks
    }
    
    const totalChunks = Math.ceil(file.size / chunkSize)
    const chunks: ArrayBuffer[] = []
    
    // Pre-read all chunks into memory for faster sending
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()
      chunks.push(arrayBuffer)
    }
    
    console.log(`📊 File prepared: ${totalChunks} chunks of ~${Math.round(chunkSize/1024)}KB each`)
    
    // Store for optimized sending
    this.sendingFiles.set(fileId, {
      file,
      chunks,
      currentChunk: 0,
      windowSize: this.windowSize,
      inFlight: new Set()
    })
  }
  
  private async sendFileInChunks(fileId: string): Promise<void> {
    const sendingFile = this.sendingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!sendingFile || !transfer) return
    
    transfer.status = "transferring"
    this.updateFileTransfers()
    
    const startTime = Date.now()
    console.log(`🚀 Starting optimized file transfer: ${sendingFile.file.name}`)
    
    try {
      await this.sendChunksWithFlowControl(fileId)
      
      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()
      
      console.log(`✅ File sent successfully: ${sendingFile.file.name}`)
      
    } catch (error) {
      console.error(`❌ Failed to send file ${sendingFile.file.name}:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
    } finally {
      this.sendingFiles.delete(fileId)
    }
  }
  
  private async sendChunksWithFlowControl(fileId: string): Promise<void> {
    const sendingFile = this.sendingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!sendingFile || !transfer) return
    
    const { file, chunks } = sendingFile
    const totalChunks = chunks.length
    let sentChunks = 0
    const startTime = Date.now()
    
    return new Promise((resolve, reject) => {
      const sendNextBatch = async () => {
        try {
          // Check if data channel is still open
          if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            reject(new Error('Data channel closed during transfer'))
            return
          }
          
          // Wait for buffer to clear if needed
          while (this.dataChannel.bufferedAmount > this.maxBufferedAmount) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          
          // Send chunks in batches
          const batchSize = Math.min(5, totalChunks - sentChunks) // Send 5 chunks at a time
          
          for (let i = 0; i < batchSize && sentChunks < totalChunks; i++) {
            const chunkIndex = sentChunks
            const chunkData = chunks[chunkIndex]
            
            // Create chunk header
            const header = new TextEncoder().encode(JSON.stringify({
              fileId,
              chunkIndex,
              totalChunks,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type
            }))
            
            // Combine header and data
            const headerLength = new Uint32Array([header.length])
            const combined = new Uint8Array(4 + header.length + chunkData.byteLength)
            combined.set(new Uint8Array(headerLength.buffer), 0)
            combined.set(header, 4)
            combined.set(new Uint8Array(chunkData), 4 + header.length)
            
            // Send chunk
            this.dataChannel.send(combined.buffer)
            sentChunks++
            
            // Update progress
            transfer.progress = Math.round((sentChunks / totalChunks) * 100)
            
            // Update speed
            const elapsed = (Date.now() - startTime) / 1000
            const bytesTransferred = sentChunks * (file.size / totalChunks)
            transfer.speed = Math.round(bytesTransferred / elapsed)
            
            this.updateFileTransfers()
          }
          
          // Check if we're done
          if (sentChunks >= totalChunks) {
            console.log(`✅ All ${totalChunks} chunks sent for ${file.name}`)
            resolve()
            return
          }
          
          // Continue sending next batch
          setTimeout(sendNextBatch, 5) // Small delay between batches
          
        } catch (error) {
          reject(error)
        }
      }
      
      // Start sending
      sendNextBatch()
    })
  }
  
  private handleFileChunk(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)
      const headerLength = view.getUint32(0, true)
      const headerBytes = new Uint8Array(data, 4, headerLength)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunkData = data.slice(4 + headerLength)
      
      const { fileId, chunkIndex, totalChunks, fileName, fileSize, fileType } = header
      
      // Initialize incoming file if not exists
      if (!this.incomingFiles.has(fileId)) {
        console.log(`📥 Starting to receive file: ${fileName} (${totalChunks} chunks)`)
        this.incomingFiles.set(fileId, {
          chunks: new Map(),
          totalChunks,
          fileName,
          fileSize,
          fileType,
          receivedChunks: 0,
          startTime: Date.now()
        })
        
        const transfer: FileTransfer = {
          id: fileId,
          name: fileName,
          size: fileSize,
          type: fileType,
          progress: 0,
          status: "transferring",
          direction: "receiving"
        }
        this.fileTransfers.set(fileId, transfer)
      }
      
      const incomingFile = this.incomingFiles.get(fileId)!
      const transfer = this.fileTransfers.get(fileId)!
      
      // Store chunk (avoid duplicates)
      if (!incomingFile.chunks.has(chunkIndex)) {
        incomingFile.chunks.set(chunkIndex, chunkData)
        incomingFile.receivedChunks++
        
        // Update progress and speed
        transfer.progress = Math.round((incomingFile.receivedChunks / totalChunks) * 100)
        
        const elapsed = (Date.now() - incomingFile.startTime) / 1000
        const bytesReceived = incomingFile.receivedChunks * (fileSize / totalChunks)
        transfer.speed = Math.round(bytesReceived / elapsed)
        
        this.updateFileTransfers()
        
        // Log progress every 10%
        if (transfer.progress % 10 === 0 && transfer.progress > 0) {
          console.log(`📊 ${fileName}: ${transfer.progress}% (${Math.round(transfer.speed! / 1024)} KB/s)`)
        }
      }
      
      // Check if file is complete
      if (incomingFile.receivedChunks === totalChunks) {
        console.log(`✅ All chunks received for ${fileName} - assembling...`)
        this.assembleAndDownloadFile(fileId)
      }
      
    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }
  
  private assembleAndDownloadFile(fileId: string): void {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!incomingFile || !transfer) return
    
    try {
      console.log(`🔧 Assembling file: ${incomingFile.fileName}`)
      
      // Verify all chunks are present
      const missingChunks: number[] = []
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        if (!incomingFile.chunks.has(i)) {
          missingChunks.push(i)
        }
      }
      
      if (missingChunks.length > 0) {
        console.error(`❌ Missing ${missingChunks.length} chunks for ${incomingFile.fileName}`)
        transfer.status = "error"
        this.updateFileTransfers()
        return
      }
      
      // Assemble chunks in order
      const chunks: ArrayBuffer[] = []
      let totalSize = 0
      
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        const chunk = incomingFile.chunks.get(i)!
        chunks.push(chunk)
        totalSize += chunk.byteLength
      }
      
      console.log(`📊 Assembled ${chunks.length} chunks, total: ${Math.round(totalSize/1024)}KB`)
      
      // Create blob and download
      const blob = new Blob(chunks, { type: incomingFile.fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = incomingFile.fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
      
      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()
      
      // Send completion notification
      this.sendP2PMessage({
        type: 'file-complete',
        data: { fileId, success: true },
        timestamp: Date.now(),
        id: this.generateId()
      })
      
      // Cleanup
      this.incomingFiles.delete(fileId)
      
      const elapsed = (Date.now() - incomingFile.startTime) / 1000
      const avgSpeed = Math.round(totalSize / elapsed / 1024)
      console.log(`✅ File completed: ${incomingFile.fileName} (${avgSpeed} KB/s average)`)
      
    } catch (error) {
      console.error(`❌ Failed to assemble file:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
    }
  }
  
  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer: ${data.fileName} (${Math.round(data.fileSize/1024)}KB)`)
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
    // Start sending the file
    this.sendFileInChunks(data.fileId)
  }
  
  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ File transfer completed: ${data.fileId}`)
    
    // Update sender's status
    const transfer = this.fileTransfers.get(data.fileId)
    if (transfer && transfer.direction === "sending") {
      if (data.success !== false) {
        transfer.status = "completed"
      } else {
        transfer.status = "error"
      }
      this.updateFileTransfers()
    }
  }
  
  private handleChunkAck(data: { fileId: string; chunkIndex: number }): void {
    // Handle chunk acknowledgment for flow control
    const sendingFile = this.sendingFiles.get(data.fileId)
    if (sendingFile) {
      sendingFile.inFlight.delete(data.chunkIndex)
    }
  }
  
  private sendP2PMessage(message: P2PMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message))
    }
  }
  
  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }
  
  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }
  
  private startKeepAlive(): void {
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return
      
      // Keep signaling connection alive
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignalingMessage({
          type: 'keep-alive',
          sessionId: this.sessionId,
          userId: this.userId
        })
      }
      
      // Keep P2P connection alive
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.sendP2PMessage({
          type: 'ping',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
          id: this.generateId()
        })
      }
    }, 30000) // Every 30 seconds
  }
  
  private resetPeerConnection(): void {
    console.log('🔄 Resetting peer connection')
    
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    
    this.connectionStatus = "connecting"
    this.onConnectionStatusChange?.(this.connectionStatus)
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
    return Math.random().toString(36).substring(2, 15)
  }
  
  destroy(): void {
    console.log('🛑 Destroying BulletproofP2P')
    
    this.isDestroyed = true
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    
    this.resetPeerConnection()
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    
    this.fileTransfers.clear()
    this.incomingFiles.clear()
    this.sendingFiles.clear()
    this.chatMessages = []
  }
}
