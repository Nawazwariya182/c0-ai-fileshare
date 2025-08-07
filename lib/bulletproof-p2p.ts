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
  type: 'file-offer' | 'file-accept' | 'file-chunk' | 'file-complete' | 'chat-message' | 'ping' | 'pong'
  data: any
  timestamp: number
  id: string
}

export class BulletproofP2P {
  private sessionId: string
  private userId: string
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private isInitiator = false
  
  // Connection state
  private connectionStatus: "connecting" | "connected" | "disconnected" = "connecting"
  private signalingStatus: "connecting" | "connected" | "disconnected" = "connecting"
  private connectionQuality: "excellent" | "good" | "poor" = "excellent"
  private currentSpeed = 0
  private userCount = 0
  
  // File transfer state
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private incomingFiles: Map<string, {
    chunks: Map<number, ArrayBuffer>
    totalChunks: number
    fileName: string
    fileSize: number
    fileType: string
    receivedChunks: number
  }> = new Map()
  
  // Chat state
  private chatMessages: ChatMessage[] = []
  
  // Callbacks
  public onConnectionStatusChange?: (status: "connecting" | "connected" | "disconnected") => void
  public onSignalingStatusChange?: (status: "connecting" | "connected" | "disconnected") => void
  public onUserCountChange?: (count: number) => void
  public onError?: (error: string) => void
  public onConnectionQualityChange?: (quality: "excellent" | "good" | "poor") => void
  public onSpeedUpdate?: (speed: number) => void
  public onFileTransferUpdate?: (transfers: FileTransfer[]) => void
  public onChatMessage?: (message: ChatMessage) => void
  public onConnectionRecovery?: () => void
  
  // Performance monitoring
  private lastSpeedCheck = 0
  private bytesTransferred = 0
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  
  // WebRTC Configuration - Optimized for reliability
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
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
  
  async initialize() {
    try {
      await this.connectToSignalingServer()
      this.startPerformanceMonitoring()
    } catch (error) {
      console.error('❌ Failed to initialize P2P:', error)
      this.onError?.('Failed to initialize connection')
    }
  }
  
  private async connectToSignalingServer() {
    // Get the current domain to construct the WebSocket URL
    const currentDomain = window.location.hostname
    const isLocalhost = currentDomain === 'localhost' || currentDomain === '127.0.0.1'
    const isVercel = currentDomain.includes('vercel.app')
    
    // Try multiple WebSocket URLs based on environment
    const wsUrls = []
    
    if (isLocalhost) {
      // Local development
      wsUrls.push('ws://localhost:8080', 'ws://127.0.0.1:8080')
    } else {
      // Production - try multiple Render URLs and common patterns
      wsUrls.push(
        // Primary Render URL (replace with your actual Render service name)
        'wss://p2p-signaling-server.onrender.com',
        'wss://bulletproof-p2p-server.onrender.com',
        'wss://p2p-file-share-server.onrender.com',
        'wss://signaling-server.onrender.com',
        // Try without SSL as fallback
        'ws://p2p-signaling-server.onrender.com',
        // Railway alternatives
        'wss://p2p-signaling-server.up.railway.app',
        // Heroku alternatives  
        'wss://p2p-signaling-server.herokuapp.com'
      )
    }
    
    console.log(`🔍 Environment detected: ${isLocalhost ? 'localhost' : isVercel ? 'vercel' : 'production'}`)
    console.log(`🔗 Will try ${wsUrls.length} WebSocket URLs`)
    
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
          
          // Set connection timeout - shorter for faster fallback
          connectionTimeout = setTimeout(() => {
            console.log(`⏰ Connection timeout for ${wsUrl}`)
            ws.close()
            resolveOnce(false, new Error('Connection timeout'))
          }, 8000) // 8 second timeout
          
          ws.onopen = () => {
            console.log(`✅ Connected to signaling server: ${wsUrl}`)
            this.ws = ws
            connected = true
            this.signalingStatus = "connected"
            this.onSignalingStatusChange?.(this.signalingStatus)
            this.reconnectAttempts = 0
            
            // Set up event handlers
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
        
        // Add small delay between attempts
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
      
      // Provide helpful error message
      let errorMessage = 'Failed to connect to signaling server. '
      if (lastError?.message?.includes('timeout')) {
        errorMessage += 'Connection timed out. Please check if the server is running.'
      } else if (lastError?.message?.includes('refused')) {
        errorMessage += 'Connection refused. Server may be down.'
      } else {
        errorMessage += `Error: ${lastError?.message || 'Unknown error'}`
      }
      
      this.onError?.(errorMessage)
      
      // Schedule reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect()
      }
      throw new Error(errorMessage)
    }
  }

  private setupWebSocketHandlers() {
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
  
  private scheduleReconnect() {
    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000) // Max 30 seconds
    
    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`)
    
    setTimeout(() => {
      if (this.signalingStatus === "disconnected") {
        this.connectToSignalingServer()
      }
    }, delay)
  }
  
  private async handleSignalingMessage(message: any) {
    console.log(`📨 Signaling message: ${message.type}`)
    
    switch (message.type) {
      case 'connected':
        console.log('✅ Server connection confirmed:', message.message)
        break
        
      case 'joined':
        this.isInitiator = message.isInitiator
        this.userCount = message.userCount
        this.onUserCountChange?.(this.userCount)
        console.log(`✅ Joined session as ${this.isInitiator ? 'INITIATOR' : 'RECEIVER'}`)
        break
        
      case 'user-joined':
        this.userCount = message.userCount
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
        this.userCount = message.userCount
        this.onUserCountChange?.(this.userCount)
        if (!message.temporary) {
          this.resetPeerConnection()
        }
        break
        
      case 'error':
        console.error('❌ Signaling error:', message.message)
        this.onError?.(message.message)
        break
        
      case 'pong':
        this.updateConnectionQuality()
        break
    }
  }
  
  private async initiatePeerConnection() {
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
        }
      }
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 Data channel received')
        this.setupDataChannel(event.channel)
      }
      
      // Create data channel (initiator only)
      if (this.isInitiator) {
        console.log('📡 Creating data channel')
        this.dataChannel = this.pc.createDataChannel('bulletproof', {
          ordered: true,
          maxRetransmits: 3
        })
        this.setupDataChannel(this.dataChannel)
      }
      
      // Create and send offer
      if (this.isInitiator) {
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
    }
  }
  
  private setupDataChannel(channel: RTCDataChannel) {
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
  
  private async handleOffer(message: any) {
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
  
  private async handleAnswer(message: any) {
    try {
      if (this.pc) {
        await this.pc.setRemoteDescription(message.answer)
        console.log('✅ Answer processed')
      }
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
      this.onError?.('Failed to handle connection answer')
    }
  }
  
  private async handleIceCandidate(message: any) {
    try {
      if (this.pc && message.candidate) {
        await this.pc.addIceCandidate(message.candidate)
      }
    } catch (error) {
      console.error('❌ Failed to handle ICE candidate:', error)
    }
  }
  
  private handleDataChannelMessage(data: string | ArrayBuffer) {
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
  
  private handleP2PMessage(message: P2PMessage) {
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
        
      case 'ping':
        this.sendP2PMessage({
          type: 'pong',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
          id: this.generateId()
        })
        break
        
      case 'pong':
        this.updateConnectionQuality()
        break
    }
  }
  
  // Public methods
  async sendFiles(files: File[]) {
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
      
      // Start sending file chunks
      await this.sendFileInChunks(file, fileId)
    }
  }
  
  sendMessage(message: ChatMessage) {
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
  
  private async sendFileInChunks(file: File, fileId: string) {
    const chunkSize = 64 * 1024 // 64KB chunks for reliability
    const totalChunks = Math.ceil(file.size / chunkSize)
    let chunkIndex = 0
    
    const transfer = this.fileTransfers.get(fileId)
    if (!transfer) return
    
    transfer.status = "transferring"
    this.updateFileTransfers()
    
    const startTime = Date.now()
    let lastProgressUpdate = 0
    
    while (chunkIndex < totalChunks) {
      const start = chunkIndex * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      
      try {
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
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(combined.buffer)
          
          // Update progress
          chunkIndex++
          transfer.progress = Math.round((chunkIndex / totalChunks) * 100)
          
          // Update speed calculation
          const now = Date.now()
          if (now - lastProgressUpdate > 500) { // Update every 500ms
            const elapsed = (now - startTime) / 1000
            const bytesTransferred = chunkIndex * chunkSize
            transfer.speed = Math.round(bytesTransferred / elapsed)
            this.currentSpeed = transfer.speed
            this.onSpeedUpdate?.(this.currentSpeed)
            lastProgressUpdate = now
          }
          
          this.updateFileTransfers()
          
          // Small delay to prevent overwhelming the connection
          if (chunkIndex % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10))
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
    
    // Mark as completed
    transfer.status = "completed"
    transfer.progress = 100
    this.updateFileTransfers()
    
    console.log(`✅ File ${file.name} sent successfully`)
  }
  
  private handleFileChunk(data: ArrayBuffer) {
    try {
      const view = new DataView(data)
      const headerLength = view.getUint32(0, true)
      const headerBytes = new Uint8Array(data, 4, headerLength)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))
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
          receivedChunks: 0
        })
        
        // Create transfer record
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
      
      // Store chunk
      incomingFile.chunks.set(chunkIndex, chunkData)
      incomingFile.receivedChunks++
      
      // Update progress
      transfer.progress = Math.round((incomingFile.receivedChunks / totalChunks) * 100)
      this.updateFileTransfers()
      
      // Check if file is complete
      if (incomingFile.receivedChunks === totalChunks) {
        this.assembleAndDownloadFile(fileId)
      }
      
    } catch (error) {
      console.error('❌ Failed to handle file chunk:', error)
    }
  }
  
  private assembleAndDownloadFile(fileId: string) {
    const incomingFile = this.incomingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!incomingFile || !transfer) return
    
    try {
      // Assemble chunks in order
      const chunks: ArrayBuffer[] = []
      for (let i = 0; i < incomingFile.totalChunks; i++) {
        const chunk = incomingFile.chunks.get(i)
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`)
        }
        chunks.push(chunk)
      }
      
      // Create blob and download
      const blob = new Blob(chunks, { type: incomingFile.fileType })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = incomingFile.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()
      
      // Cleanup
      this.incomingFiles.delete(fileId)
      
      console.log(`✅ File ${incomingFile.fileName} received and downloaded`)
      
    } catch (error) {
      console.error('❌ Failed to assemble file:', error)
      transfer.status = "error"
      this.updateFileTransfers()
    }
  }
  
  private handleFileOffer(data: any) {
    console.log(`📥 File offer received: ${data.fileName}`)
    // Auto-accept for now - could add user confirmation later
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })
  }
  
  private handleFileAccept(data: any) {
    console.log(`✅ File accepted: ${data.fileId}`)
    // File transfer will continue automatically
  }
  
  private handleFileComplete(data: any) {
    console.log(`✅ File transfer completed: ${data.fileId}`)
  }
  
  private sendP2PMessage(message: P2PMessage) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message))
    }
  }
  
  private sendSignalingMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }
  
  private updateFileTransfers() {
    const transfers = Array.from(this.fileTransfers.values())
    this.onFileTransferUpdate?.(transfers)
  }
  
  private startPerformanceMonitoring() {
    // Ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.sendP2PMessage({
          type: 'ping',
          data: { timestamp: Date.now() },
          timestamp: Date.now(),
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
  
  private updateConnectionQuality() {
    // Simple quality assessment based on connection state
    if (this.pc && this.dataChannel) {
      if (this.pc.connectionState === 'connected' && this.dataChannel.readyState === 'open') {
        this.connectionQuality = "excellent"
      } else if (this.pc.connectionState === 'connecting') {
        this.connectionQuality = "good"
      } else {
        this.connectionQuality = "poor"
      }
      this.onConnectionQualityChange?.(this.connectionQuality)
    }
  }
  
  private resetPeerConnection() {
    console.log('🔄 Resetting peer connection')
    
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
  
  destroy() {
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
    this.chatMessages = []
  }
}
