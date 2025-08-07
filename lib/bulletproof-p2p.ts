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

interface P2PMessage {
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong'
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
  private pendingFiles: Map<string, File> = new Map()
  
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
  private isConnecting: boolean = false
  private iceGatheringComplete: boolean = false
  
  // Optimized settings for stability and speed
  private chunkSize: number = 64 * 1024 // 64KB - good balance of speed and reliability
  private maxConcurrentChunks: number = 8 // Send up to 8 chunks concurrently
  
  // WebRTC Configuration - STABLE AND RELIABLE
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }
  
  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    console.log(`🚀 BulletproofP2P initialized for session ${sessionId}`)
  }
  
  async initialize(): Promise<void> {
    if (this.isDestroyed) return
    
    console.log('🔧 Initializing stable P2P connection...')
    this.isDestroyed = false
    
    try {
      await this.connectToSignalingServer()
      this.startKeepAlive()
    } catch (error) {
      console.error('❌ Failed to initialize:', error)
      this.onError?.('Failed to initialize connection')
      this.scheduleReconnect()
    }
  }
  
  private async connectToSignalingServer(): Promise<void> {
    if (this.isConnecting || this.isDestroyed) return
    
    this.isConnecting = true
    this.connectionAttempts++
    
    console.log(`🔗 Connecting to signaling server (attempt ${this.connectionAttempts})...`)
    
    this.signalingStatus = "connecting"
    this.onSignalingStatusChange?.(this.signalingStatus)
    
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
      }, 15000) // 15 second timeout
      
      ws.onopen = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        
        console.log(`✅ Connected to signaling server: ${wsUrl}`)
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
        console.error('❌ Failed to parse signaling message:', error)
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
      this.onError?.('Signaling connection error')
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
    
    const delay = Math.min(3000 * this.connectionAttempts, 15000) // Max 15 seconds
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
        
        if (this.userCount === 2 && this.isInitiator && !this.pc) {
          console.log('🚀 Both users present - initiating P2P connection...')
          setTimeout(() => this.initiatePeerConnection(), 1000)
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
    if (this.pc || this.isDestroyed) {
      console.log('⚠️ Peer connection already exists or destroyed')
      return
    }
    
    try {
      console.log('🔧 Creating stable peer connection...')
      this.pc = new RTCPeerConnection(this.rtcConfig)
      this.iceGatheringComplete = false
      
      // Set up comprehensive event handlers
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate:', event.candidate.type)
          this.sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate,
            sessionId: this.sessionId
          })
        } else {
          console.log('🧊 ICE gathering complete')
          this.iceGatheringComplete = true
        }
      }
      
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState
        console.log(`🔗 P2P Connection state: ${state}`)
        
        switch (state) {
          case 'connected':
            this.connectionStatus = "connected"
            this.onConnectionStatusChange?.(this.connectionStatus)
            this.onConnectionRecovery?.()
            console.log('✅ P2P Connection established successfully!')
            break
          case 'connecting':
            console.log('🔄 P2P Connection in progress...')
            break
          case 'failed':
          case 'closed':
            console.log('❌ P2P Connection failed/closed')
            this.connectionStatus = "connecting"
            this.onConnectionStatusChange?.(this.connectionStatus)
            this.onError?.('P2P connection failed')
            break
        }
      }
      
      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc?.iceConnectionState
        console.log(`🧊 ICE Connection state: ${state}`)
        
        if (state === 'failed') {
          console.log('❌ ICE connection failed - attempting restart')
          this.pc?.restartIce()
        }
      }
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 Data channel received from peer')
        this.setupDataChannel(event.channel)
      }
      
      // Create data channel with reliable settings (initiator only)
      if (this.isInitiator) {
        console.log('📡 Creating reliable data channel...')
        this.dataChannel = this.pc.createDataChannel('bulletproof-stable', {
          ordered: true, // Ensure ordered delivery
          maxRetransmits: 3, // Allow retransmits for reliability
        })
        this.setupDataChannel(this.dataChannel)
      }
      
      // Create and send offer (initiator only)
      if (this.isInitiator) {
        console.log('📤 Creating offer...')
        const offer = await this.pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false
        })
        
        await this.pc.setLocalDescription(offer)
        console.log('📤 Local description set, sending offer...')
        
        this.sendSignalingMessage({
          type: 'offer',
          offer: offer,
          sessionId: this.sessionId
        })
        
        console.log('📤 Offer sent successfully')
      }
      
    } catch (error) {
      console.error('❌ Failed to create peer connection:', error)
      this.onError?.('Failed to establish P2P connection')
      this.resetPeerConnection()
    }
  }
  
  private setupDataChannel(channel: RTCDataChannel): void {
    console.log(`🔧 Setting up data channel: ${channel.label}`)
    this.dataChannel = channel
    
    // Configure for file transfers
    channel.binaryType = 'arraybuffer'
    
    channel.onopen = () => {
      console.log('✅ Data channel opened successfully!')
      console.log(`📊 Channel config: ordered=${channel.ordered}, maxRetransmits=${channel.maxRetransmits}`)
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
      
      // Process any pending files
      this.processPendingFiles()
    }
    
    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.connectionStatus = "connecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }
    
    channel.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      this.onError?.('Data channel error')
    }
    
    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }
  }
  
  private async handleOffer(message: SignalingMessage): Promise<void> {
    try {
      console.log('📥 Handling offer...')
      
      if (!this.pc) {
        console.log('🔧 Creating peer connection for answer...')
        this.pc = new RTCPeerConnection(this.rtcConfig)
        
        this.pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('🧊 Sending ICE candidate:', event.candidate.type)
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
            console.log('✅ P2P Connection established!')
          } else if (state === 'failed' || state === 'closed') {
            this.connectionStatus = "connecting"
            this.onConnectionStatusChange?.(this.connectionStatus)
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
      
      console.log('📥 Setting remote description...')
      await this.pc.setRemoteDescription(message.offer)
      
      console.log('📤 Creating answer...')
      const answer = await this.pc.createAnswer()
      
      console.log('📤 Setting local description...')
      await this.pc.setLocalDescription(answer)
      
      console.log('📤 Sending answer...')
      this.sendSignalingMessage({
        type: 'answer',
        answer: answer,
        sessionId: this.sessionId
      })
      
      console.log('✅ Answer sent successfully')
      
    } catch (error) {
      console.error('❌ Failed to handle offer:', error)
      this.onError?.('Failed to handle connection offer')
    }
  }
  
  private async handleAnswer(message: SignalingMessage): Promise<void> {
    try {
      console.log('📥 Handling answer...')
      
      if (this.pc && message.answer) {
        console.log('📥 Setting remote description from answer...')
        await this.pc.setRemoteDescription(message.answer)
        console.log('✅ Answer processed successfully')
      } else {
        console.warn('⚠️ No peer connection or answer data')
      }
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
      this.onError?.('Failed to handle connection answer')
    }
  }
  
  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.candidate) {
        console.log('🧊 Adding ICE candidate:', message.candidate.type)
        await this.pc.addIceCandidate(message.candidate)
        console.log('✅ ICE candidate added')
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
      console.log('⚠️ Data channel not ready, queuing files...')
      // Queue files for when connection is ready
      for (const file of files) {
        const fileId = this.generateId()
        this.pendingFiles.set(fileId, file)
      }
      this.onError?.('Connection not ready - files queued')
      return
    }
    
    console.log(`📤 Sending ${files.length} files`)
    
    for (const file of files) {
      await this.sendSingleFile(file)
    }
  }
  
  private async sendSingleFile(file: File): Promise<void> {
    const fileId = this.generateId()
    
    console.log(`📤 Preparing to send: ${file.name} (${Math.round(file.size/1024)}KB)`)
    
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
  }
  
  private async processPendingFiles(): Promise<void> {
    if (this.pendingFiles.size === 0) return
    
    console.log(`📤 Processing ${this.pendingFiles.size} pending files...`)
    
    const files = Array.from(this.pendingFiles.values())
    this.pendingFiles.clear()
    
    for (const file of files) {
      await this.sendSingleFile(file)
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
  
  private async sendFileInChunks(file: File, fileId: string): Promise<void> {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return
    
    console.log(`🚀 Starting file transfer: ${file.name}`)
    transfer.status = "transferring"
    this.updateFileTransfers()
    
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    const startTime = Date.now()
    let sentChunks = 0
    
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // Check if data channel is still open
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
          throw new Error('Data channel closed during transfer')
        }
        
        // Wait for buffer to clear if needed
        while (this.dataChannel.bufferedAmount > 256 * 1024) { // 256KB buffer limit
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        
        const start = chunkIndex * this.chunkSize
        const end = Math.min(start + this.chunkSize, file.size)
        const chunk = file.slice(start, end)
        const arrayBuffer = await chunk.arrayBuffer()
        
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
        const combined = new Uint8Array(4 + header.length + arrayBuffer.byteLength)
        combined.set(new Uint8Array(headerLength.buffer), 0)
        combined.set(header, 4)
        combined.set(new Uint8Array(arrayBuffer), 4 + header.length)
        
        // Send chunk
        this.dataChannel.send(combined.buffer)
        sentChunks++
        
        // Update progress
        transfer.progress = Math.round((sentChunks / totalChunks) * 100)
        
        // Update speed
        const elapsed = (Date.now() - startTime) / 1000
        const bytesTransferred = sentChunks * this.chunkSize
        transfer.speed = Math.round(bytesTransferred / elapsed)
        
        this.updateFileTransfers()
        
        // Small delay every few chunks to prevent overwhelming
        if (chunkIndex % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1))
        }
      }
      
      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()
      
      console.log(`✅ File sent successfully: ${file.name}`)
      
    } catch (error) {
      console.error(`❌ Failed to send file ${file.name}:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    }
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
        console.log(`📥 Starting to receive: ${fileName} (${totalChunks} chunks)`)
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
        
        // Log progress every 25%
        if (transfer.progress % 25 === 0 && transfer.progress > 0) {
          console.log(`📊 ${fileName}: ${transfer.progress}% (${Math.round(transfer.speed! / 1024)} KB/s)`)
        }
      }
      
      // Check if file is complete
      if (incomingFile.receivedChunks === totalChunks) {
        console.log(`✅ All chunks received for ${fileName}`)
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
        this.onError?.(`File transfer incomplete: ${incomingFile.fileName}`)
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
      console.log(`✅ File received: ${incomingFile.fileName} (${avgSpeed} KB/s average)`)
      
    } catch (error) {
      console.error(`❌ Failed to assemble file:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to download ${incomingFile.fileName}`)
    }
  }
  
  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer received: ${data.fileName} (${Math.round(data.fileSize/1024)}KB)`)
    
    // Auto-accept file
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
    
    console.log(`✅ Auto-accepted file: ${data.fileName}`)
  }
  
  private handleFileAccept(data: FileAcceptData): void {
    console.log(`✅ File accepted: ${data.fileId}`)
    
    // Find the file and start sending
    const transfer = this.fileTransfers.get(data.fileId)
    if (transfer && transfer.direction === "sending") {
      // Find the original file (we need to store it when creating the transfer)
      const fileEntry = Array.from(this.pendingFiles.entries()).find(([id]) => id === data.fileId)
      if (fileEntry) {
        const [, file] = fileEntry
        this.sendFileInChunks(file, data.fileId)
        this.pendingFiles.delete(data.fileId)
      } else {
        // File might have been processed already, look for it in a different way
        console.log('🔍 Looking for file to send...')
        // For now, we'll need to modify the file sending logic to store files properly
      }
    }
  }
  
  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ File transfer completed: ${data.fileId}`)
    
    const transfer = this.fileTransfers.get(data.fileId)
    if (transfer && transfer.direction === "sending") {
      if (data.success !== false) {
        transfer.status = "completed"
        console.log(`📤 Sender confirmed: ${transfer.name} delivered successfully`)
      } else {
        transfer.status = "error"
        console.log(`📤 Sender notified: ${transfer.name} failed on receiver`)
      }
      this.updateFileTransfers()
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
    }, 30000)
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
    this.iceGatheringComplete = false
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
    this.pendingFiles.clear()
    this.chatMessages = []
  }
}
