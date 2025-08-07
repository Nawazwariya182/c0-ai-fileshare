// ... (keep all existing interfaces and class structure the same until sendFileInChunks method)

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
  checksum?: string
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
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong' | 'file-cancel' | 'file-retry'
  data: any
  timestamp: number
  id: string
}

type ConnectionStatus = "connecting" | "connected" | "disconnected"
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
  private sendingFiles: Map<string, File> = new Map()
  
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
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private lastPingTime: number = 0
  private connectionLatency: number = 0
  
  // Transfer optimization
  private readonly CHUNK_SIZE = 512 * 1024 // 512KB chunks for optimal performance
  private readonly MAX_CONCURRENT_CHUNKS = 3 // Allow some parallelism
  private readonly PROGRESS_UPDATE_INTERVAL = 200 // Update UI every 200ms
  private readonly CHUNK_DELAY = 2 // 2ms delay between chunks
  private readonly CONNECTION_TIMEOUT = 10000 // 10 second timeout
  private readonly FILE_TIMEOUT = 300000 // 5 minute timeout for file transfers
  
  // WebRTC Configuration - Optimized for reliability and speed
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Add TURN servers for better connectivity
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
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
    try {
      await this.connectToSignalingServer()
      this.startPerformanceMonitoring()
      this.startConnectionHealthCheck()
    } catch (error) {
      console.error('❌ Failed to initialize P2P:', error)
      this.onError?.('Failed to initialize connection')
    }
  }

  private async connectToSignalingServer(): Promise<void> {
    const currentDomain: string = window.location.hostname
    const isLocalhost: boolean = currentDomain === 'localhost' || currentDomain === '127.0.0.1'
    const isVercel: boolean = currentDomain.includes('vercel.app')
    
    const wsUrls: string[] = []
    
    if (process.env.NEXT_PUBLIC_WS_URL) {
      wsUrls.push(process.env.NEXT_PUBLIC_WS_URL)
      console.log(`🔗 Using NEXT_PUBLIC_WS_URL: ${process.env.NEXT_PUBLIC_WS_URL}`)
    }
    
    if (isLocalhost) {
      if (!wsUrls.includes('ws://localhost:8080')) wsUrls.push('ws://localhost:8080')
      if (!wsUrls.includes('ws://127.0.0.1:8080')) wsUrls.push('ws://127.0.0.1:8080')
    } else {
      const fallbackUrls = [
        'wss://p2p-signaling-server.onrender.com',
        'wss://signaling-server-1ckx.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com',
        'wss://p2p-file-share-server.onrender.com',
        'wss://signaling-server.onrender.com',
        'ws://p2p-signaling-server.onrender.com',
        'wss://p2p-signaling-server.up.railway.app',
        'wss://p2p-signaling-server.herokuapp.com'
      ]
      
      fallbackUrls.forEach(url => {
        if (!wsUrls.includes(url)) {
          wsUrls.push(url)
        }
      })
    }

    console.log(`🔍 Environment: ${isLocalhost ? 'localhost' : isVercel ? 'vercel' : 'production'}`)
    console.log(`🔗 Trying ${wsUrls.length} WebSocket URLs`)

    let connected = false
    let lastError: any = null

    for (let i = 0; i < wsUrls.length; i++) {
      const wsUrl = wsUrls[i]
      if (connected) break

      try {
        console.log(`🔗 Attempt ${i + 1}/${wsUrls.length}: ${wsUrl}`)
        
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(wsUrl)
          let connectionTimeout: NodeJS.Timeout
          let resolved = false

          const cleanup = () => {
            if (connectionTimeout) clearTimeout(connectionTimeout)
          }

          const resolveOnce = (success: boolean, error?: any) => {
            if (resolved) return
            resolved = true
            cleanup()
            if (success) resolve()
            else reject(error)
          }

          connectionTimeout = setTimeout(() => {
            console.log(`⏰ Connection timeout for ${wsUrl}`)
            ws.close()
            resolveOnce(false, new Error('Connection timeout'))
          }, this.CONNECTION_TIMEOUT)

          ws.onopen = () => {
            console.log(`✅ Connected to signaling server: ${wsUrl}`)
            this.ws = ws
            connected = true
            this.signalingStatus = "connected"
            this.onSignalingStatusChange?.(this.signalingStatus)
            this.reconnectAttempts = 0

            this.setupWebSocketHandlers()

            this.sendSignalingMessage({
              type: 'join',
              sessionId: this.sessionId,
              userId: this.userId,
              clientInfo: {
                isMobile: /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent),
                browser: this.getBrowserInfo(),
                timestamp: Date.now(),
                url: wsUrl
              }
            })

            resolveOnce(true)
          }

          ws.onerror = (error) => {
            console.log(`❌ WebSocket error for ${wsUrl}:`, error)
            lastError = error
            resolveOnce(false, error)
          }

          ws.onclose = (event) => {
            if (!connected) {
              console.log(`🔌 Connection to ${wsUrl} closed: ${event.code} ${event.reason}`)
              resolveOnce(false, new Error(`Connection closed: ${event.code} ${event.reason}`))
            }
          }
        })

      } catch (error) {
        console.log(`❌ Connection attempt ${i + 1} failed for ${wsUrl}:`, error)
        lastError = error
        
        if (i < wsUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        continue
      }
    }

    if (!connected) {
      console.error('❌ Failed to connect to any signaling server')
      console.error('📋 Tried URLs:', wsUrls)
      console.error('🔍 Last error:', lastError)

      this.signalingStatus = "disconnected"
      this.onSignalingStatusChange?.(this.signalingStatus)

      let errorMessage = 'Failed to connect to signaling server. '
      if (lastError?.message?.includes('timeout')) {
        errorMessage += 'Connection timed out. Please check if the server is running.'
      } else if (lastError?.message?.includes('refused')) {
        errorMessage += 'Connection refused. Server may be down.'
      } else {
        errorMessage += `Error: ${lastError?.message || 'Unknown error'}`
      }

      this.onError?.(errorMessage)

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect()
      }
      throw new Error(errorMessage)
    }
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
      console.log(`🔌 Signaling connection closed: ${event.code} ${event.reason}`)
      this.signalingStatus = "disconnected"
      this.onSignalingStatusChange?.(this.signalingStatus)

      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('❌ Signaling WebSocket error:', error)
      this.onError?.('Signaling connection error')
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)

    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)

    setTimeout(() => {
      if (this.signalingStatus === "disconnected") {
        this.connectToSignalingServer()
      }
    }, delay)
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    console.log(`📨 Signaling message: ${message.type}`)

    switch (message.type) {
      case 'connected':
        console.log('✅ Server connection confirmed:', message.message)
        break

      case 'joined':
        this.isInitiator = message.isInitiator ?? false
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`✅ Joined session as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'}`)
        break

      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        if (message.readyForP2P) {
          console.log('🚀 Ready for P2P - initiating connection')
          if (this.isInitiator) {
            setTimeout(() => this.initiatePeerConnection(), 1000)
          }
        }
        break

      case 'p2p-ready':
        if (this.isInitiator && !this.pc) {
          console.log('🎯 P2P ready signal received - creating peer connection')
          await this.initiatePeerConnection()
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
        if (!message.temporary) {
          this.resetPeerConnection()
        }
        break

      case 'error':
        console.error('❌ Signaling error:', message.message)
        this.onError?.(message.message || 'Unknown signaling error')
        break

      case 'pong':
        this.updateConnectionQuality()
        break
    }
  }

  private async initiatePeerConnection(): Promise<void> {
    try {
      console.log('🔧 Creating peer connection')
      this.pc = new RTCPeerConnection(this.rtcConfig)

      // Set up event handlers
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
        console.log(`🔗 Connection state: ${this.pc?.connectionState}`)
        if (this.pc?.connectionState === 'connected') {
          this.connectionStatus = "connected"
          this.onConnectionStatusChange?.(this.connectionStatus)
          this.onConnectionRecovery?.()
        } else if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
          this.connectionStatus = "disconnected"
          this.onConnectionStatusChange?.(this.connectionStatus)
          this.handleConnectionFailure()
        }
      }

      this.pc.ondatachannel = (event) => {
        console.log('📡 Data channel received')
        this.setupDataChannel(event.channel)
      }

      // Create data channel with optimized settings
      if (this.isInitiator) {
        console.log('📡 Creating data channel')
        this.dataChannel = this.pc.createDataChannel('bulletproof', {
          ordered: true,
          maxRetransmits: 3,
          maxPacketLifeTime: 3000 // 3 second timeout
        })
        this.setupDataChannel(this.dataChannel)
      }

      // Create and send offer
      if (this.isInitiator) {
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
        console.log('📤 Offer sent')
      }

    } catch (error) {
      console.error('❌ Failed to create peer connection:', error)
      this.onError?.('Failed to establish P2P connection')
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel

    channel.onopen = () => {
      console.log('✅ Data channel opened')
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }

    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.connectionStatus = "disconnected"
      this.onConnectionStatusChange?.(this.connectionStatus)
    }

    channel.onerror = (error) => {
      console.error('❌ Data channel error:', error)
      this.onError?.('Data channel error')
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data)
    }

    // Set binary type for file transfers
    channel.binaryType = 'arraybuffer'
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    try {
      if (!this.pc) {
        this.pc = new RTCPeerConnection(this.rtcConfig)

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
          console.log(`🔗 Connection state: ${this.pc?.connectionState}`)
          if (this.pc?.connectionState === 'connected') {
            this.connectionStatus = "connected"
            this.onConnectionStatusChange?.(this.connectionStatus)
          } else if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
            this.connectionStatus = "disconnected"
            this.onConnectionStatusChange?.(this.connectionStatus)
          }
        }

        this.pc.ondatachannel = (event) => {
          console.log('📡 Data channel received')
          this.setupDataChannel(event.channel)
        }
      }

      if (!message.offer) {
        throw new Error('Offer is missing from message')
      }

      await this.pc.setRemoteDescription(message.offer)
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

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
        // Handle binary data (file chunks)
        this.handleFileChunk(data)
      }
    } catch (error) {
      console.error('❌ Failed to handle data channel message:', error)
    }
  }

  private handleP2PMessage(message: P2PMessage): void {
    console.log(`📨 P2P message: ${message.type}`)

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

      case 'file-cancel':
        this.handleFileCancel(message.data)
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

  cancelFileTransfer(fileId: string): void {
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    transfer.status = "cancelled"
    this.updateFileTransfers()

    // Notify peer
    this.sendP2PMessage({
      type: 'file-cancel',
      data: { fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })

    // Cleanup
    this.sendingFiles.delete(fileId)
    this.incomingFiles.delete(fileId)
  }

  private async sendFileInChunks(file: File, fileId: string): Promise<void> {
    const chunkSize = this.CHUNK_SIZE
    const totalChunks = Math.ceil(file.size / chunkSize)
    let chunkIndex = 0

    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return

    transfer.status = "transferring"
    transfer.startTime = Date.now()
    this.updateFileTransfers()

    console.log(`📤 Starting file transfer: ${file.name} (${totalChunks} chunks of ${chunkSize} bytes)`)

    const startTime = Date.now()
    let lastProgressUpdate = 0
    let bytesTransferred = 0

    // Set up timeout for the entire file transfer
    const fileTimeout = setTimeout(() => {
      console.error(`⏰ File transfer timeout for ${file.name}`)
      transfer.status = "error"
      this.updateFileTransfers()
    }, this.FILE_TIMEOUT)

    try {
      while (chunkIndex < totalChunks && transfer.status === "transferring") {
        const start = chunkIndex * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunk = file.slice(start, end)

        try {
          const arrayBuffer = await chunk.arrayBuffer()
          
          // Create optimized header
          const header: ChunkHeader = {
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

          // Efficient buffer combination
          const combined = new ArrayBuffer(4 + headerLength + arrayBuffer.byteLength)
          const view = new DataView(combined)
          
          // Write header length (little endian)
          view.setUint32(0, headerLength, true)
          
          // Write header
          new Uint8Array(combined, 4, headerLength).set(headerBytes)
          
          // Write chunk data
          new Uint8Array(combined, 4 + headerLength).set(new Uint8Array(arrayBuffer))

          // Send chunk with connection check
          if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(combined)
            
            chunkIndex++
            bytesTransferred += arrayBuffer.byteLength
            transfer.bytesTransferred = bytesTransferred

            // Optimized progress and speed calculation
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

              console.log(`📤 Progress: ${transfer.progress}% (${chunkIndex}/${totalChunks}) Speed: ${this.formatSpeed(speed)}`)
            }

            // Adaptive delay based on connection quality
            if (chunkIndex % 20 === 0) {
              const delay = this.connectionQuality === 'excellent' ? this.CHUNK_DELAY : 
                           this.connectionQuality === 'good' ? this.CHUNK_DELAY * 2 : 
                           this.CHUNK_DELAY * 4
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          } else {
            throw new Error('Data channel not available')
          }
        } catch (error) {
          console.error(`❌ Failed to send chunk ${chunkIndex}:`, error)
          transfer.status = "error"
          this.updateFileTransfers()
          clearTimeout(fileTimeout)
          return
        }
      }

      clearTimeout(fileTimeout)

      if (transfer.status === "transferring") {
        // Send completion signal with verification data
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

        console.log(`✅ File ${file.name} sent successfully (${totalChunks} chunks, ${this.formatSpeed(transfer.speed || 0)})`)
      }

    } catch (error) {
      clearTimeout(fileTimeout)
      console.error(`❌ File transfer failed for ${file.name}:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
    }
  }

  private handleFileChunk(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)
      const headerLength = view.getUint32(0, true)
      
      if (headerLength > 10000) { // Sanity check
        console.error('❌ Invalid header length:', headerLength)
        return
      }

      const headerBytes = new Uint8Array(data, 4, headerLength)
      const header: ChunkHeader = JSON.parse(new TextDecoder().decode(headerBytes))
      const chunkData = data.slice(4 + headerLength)

      const { fileId, chunkIndex, totalChunks, fileName, fileSize, fileType } = header

      // Initialize incoming file if not exists
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

        // Create transfer record
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
        console.log(`📥 Starting to receive file: ${fileName} (${totalChunks} chunks expected)`)
      }

      const incomingFile = this.incomingFiles.get(fileId)!
      const transfer = this.fileTransfers.get(fileId)!

      // Store chunk only if not already received (prevent duplicates)
      if (!incomingFile.chunks.has(chunkIndex)) {
        incomingFile.chunks.set(chunkIndex, chunkData)
        incomingFile.receivedChunks++
        incomingFile.lastChunkTime = Date.now()

        // Update progress and speed
        const progress = Math.round((incomingFile.receivedChunks / totalChunks) * 100)
        transfer.progress = progress
        
        // Calculate receiving speed
        const now = Date.now()
        const elapsed = (now - incomingFile.startTime) / 1000
        const bytesReceived = incomingFile.receivedChunks * chunkData.byteLength
        transfer.bytesTransferred = bytesReceived
        
        if (elapsed > 0) {
          const speed = Math.round(bytesReceived / elapsed)
          transfer.speed = speed
          const eta = speed > 0 ? Math.round((fileSize - bytesReceived) / speed) : 0
          transfer.eta = eta
        }

        this.updateFileTransfers()

        if (incomingFile.receivedChunks % 50 === 0 || progress === 100) {
          console.log(`📥 Received chunk ${chunkIndex + 1}/${totalChunks} for ${fileName} (${progress}%, ${this.formatSpeed(transfer.speed || 0)})`)
        }
      }

      // Check for completion but don't auto-assemble
      if (incomingFile.receivedChunks === totalChunks) {
        console.log(`📥 All chunks received for ${fileName}, waiting for completion signal...`)
      }

    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }

  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ File transfer completion signal received: ${data.fileId}`)
    
    const incomingFile = this.incomingFiles.get(data.fileId)
    const transfer = this.fileTransfers.get(data.fileId)

    if (!incomingFile || !transfer) {
      console.error('❌ File completion signal for unknown file:', data.fileId)
      return
    }

    // Verify all chunks received
    const expectedChunks = data.totalChunks || incomingFile.totalChunks
    const expectedSize = data.fileSize || incomingFile.fileSize

    if (incomingFile.receivedChunks === expectedChunks) {
      console.log(`✅ All ${expectedChunks} chunks received, assembling file...`)
      this.assembleAndDownloadFile(data.fileId)
    } else {
      console.warn(`⚠️ File completion signal received but missing chunks: ${incomingFile.receivedChunks}/${expectedChunks}`)
      
      // Set a timeout to wait for remaining chunks
      setTimeout(() => {
        const currentFile = this.incomingFiles.get(data.fileId)
        const currentTransfer = this.fileTransfers.get(data.fileId)
        
        if (currentFile && currentTransfer) {
          if (currentFile.receivedChunks === expectedChunks) {
            console.log(`✅ All chunks received after grace period, assembling file...`)
            this.assembleAndDownloadFile(data.fileId)
          } else {
            console.error(`❌ File transfer incomplete after timeout: ${currentFile.receivedChunks}/${expectedChunks}`)
            currentTransfer.status = "error"
            this.updateFileTransfers()
          }
        }
      }, 3000) // 3 second grace period
    }
  }

  private assembleAndDownloadFile(fileId: string): void {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)

    if (!incomingFile || !transfer) return

    try {
      console.log(`🔧 Assembling file: ${incomingFile.fileName}`)
      
      // Assemble chunks in correct order
      const chunks: ArrayBuffer[] = []
      let totalSize = 0
      let missingChunks: number[] = []
      
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        const chunk = incomingFile.chunks.get(i)
        if (!chunk) {
          missingChunks.push(i)
          continue
        }
        chunks.push(chunk)
        totalSize += chunk.byteLength
      }

      if (missingChunks.length > 0) {
        throw new Error(`Missing chunks: ${missingChunks.join(', ')} (${missingChunks.length}/${incomingFile.totalChunks})`)
      }

      console.log(`✅ All chunks assembled. Total size: ${totalSize} bytes (expected: ${incomingFile.fileSize})`)

      // Verify file size
      if (Math.abs(totalSize - incomingFile.fileSize) > 1024) { // Allow 1KB tolerance
        console.warn(`⚠️ Size mismatch: expected ${incomingFile.fileSize}, got ${totalSize}`)
      }

      // Create blob and trigger download
      const blob = new Blob(chunks, { type: incomingFile.fileType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = incomingFile.fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      // Clean up URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 2000)

      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      transfer.endTime = Date.now()
      this.updateFileTransfers()

      // Cleanup
      this.incomingFiles.delete(fileId)

      const transferTime = transfer.endTime - (transfer.startTime || 0)
      const avgSpeed = transferTime > 0 ? Math.round((incomingFile.fileSize / (transferTime / 1000))) : 0
      
      console.log(`✅ File ${incomingFile.fileName} successfully downloaded in ${Math.round(transferTime / 1000)}s (avg: ${this.formatSpeed(avgSpeed)})`)
      
    } catch (error) {
      console.error('❌ Failed to assemble file:', error)
      transfer.status = "error"
      this.updateFileTransfers()
    }
  }

  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 File offer received: ${data.fileName} (${this.formatFileSize(data.fileSize)})`)
    
    // Auto-accept for now - could add user confirmation later
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
      // Start sending file chunks
      this.sendFileInChunks(file, data.fileId)
    }
  }

  private handleFileCancel(data: { fileId: string }): void {
    console.log(`❌ File transfer cancelled: ${data.fileId}`)
    
    const transfer = this.fileTransfers.get(data.fileId)
    if (transfer) {
      transfer.status = "cancelled"
      this.updateFileTransfers()
    }

    // Cleanup
    this.sendingFiles.delete(data.fileId)
    this.incomingFiles.delete(data.fileId)
  }

  private handleConnectionFailure(): void {
    console.log('🔄 Handling connection failure')
    
    // Mark all active transfers as error
    for (const [fileId, transfer] of this.fileTransfers) {
      if (transfer.status === "transferring") {
        transfer.status = "error"
      }
    }
    this.updateFileTransfers()

    // Attempt to reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        if (this.connectionStatus === "disconnected") {
          this.initiatePeerConnection()
        }
      }, 5000)
    }
  }

  private sendP2PMessage(message: P2PMessage): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error('❌ Failed to send P2P message:', error)
      }
    } else {
      console.warn('⚠️ Cannot send P2P message: data channel not open')
    }
  }

  private sendSignalingMessage(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error('❌ Failed to send signaling message:', error)
      }
    } else {
      console.warn('⚠️ Cannot send signaling message: WebSocket not open')
    }
  }

  private updateFileTransfers(): void {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }

  private startPerformanceMonitoring(): void {
    // Ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
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

  private startConnectionHealthCheck(): void {
    // Check connection health every 10 seconds
    setInterval(() => {
      if (this.pc) {
        this.pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'data-channel') {
              // Monitor data channel stats
              console.log('📊 Data channel stats:', {
                state: report.state,
                messagesReceived: report.messagesReceived,
                messagesSent: report.messagesSent,
                bytesReceived: report.bytesReceived,
                bytesSent: report.bytesSent
              })
            }
          })
        }).catch(error => {
          console.error('❌ Failed to get connection stats:', error)
        })
      }
    }, 10000)
  }

  private updateConnectionQuality(): void {
    if (this.pc && this.dataChannel) {
      const connectionState = this.pc.connectionState
      const channelState = this.dataChannel.readyState

      if (connectionState === 'connected' && channelState === 'open') {
        // Determine quality based on latency
        if (this.connectionLatency < 100) {
          this.connectionQuality = "excellent"
        } else if (this.connectionLatency < 300) {
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

  private resetPeerConnection(): void {
    console.log('🔄 Resetting peer connection')

    // Cancel all active transfers
    for (const [fileId, transfer] of this.fileTransfers) {
      if (transfer.status === "transferring") {
        transfer.status = "cancelled"
      }
    }
    this.updateFileTransfers()

    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.connectionStatus = "disconnected"
    this.onConnectionStatusChange?.(this.connectionStatus)

    // Clear file transfer state
    this.sendingFiles.clear()
    this.incomingFiles.clear()
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
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus
  }

  getSignalingStatus(): ConnectionStatus {
    return this.signalingStatus
  }

  getConnectionQuality(): ConnectionQuality {
    return this.connectionQuality
  }

  getCurrentSpeed(): number {
    return this.currentSpeed
  }

  getUserCount(): number {
    return this.userCount
  }

  getFileTransfers(): FileTransfer[] {
    return Array.from(this.fileTransfers.values())
  }

  getChatMessages(): ChatMessage[] {
    return [...this.chatMessages]
  }

  destroy(): void {
    console.log('🛑 Destroying BulletproofP2P')

    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
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

    console.log('✅ BulletproofP2P destroyed successfully')
  }
}
