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
  
  // File transfer state - OPTIMIZED FOR SPEED
  private fileTransfers: Map<string, FileTransfer> = new Map()
  private incomingFiles: Map<string, IncomingFileData> = new Map()
  private pendingFiles: Map<string, File> = new Map() // Files waiting for P2P connection
  private sendingFiles: Map<string, { file: File; chunks: ArrayBuffer[]; totalChunks: number }> = new Map() // Pre-processed chunks
  
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
  private negotiationNeededQueue: boolean = false; // To prevent multiple negotiations
  
  // HIGH SPEED OPTIMIZED SETTINGS
  private chunkSize: number = 256 * 1024 // 256KB chunks for maximum speed
  private maxBufferedAmount: number = 2 * 1024 * 1024 // 2MB buffer
  private concurrentChunks: number = 16 // Send 16 chunks concurrently
  
  // WebRTC Configuration - OPTIMIZED FOR SPEED AND STABILITY
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.stunprotocol.org' },
      { urls: 'stun:stun.voipbuster.com' },
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
    
    console.log('🔧 Initializing HIGH-SPEED P2P connection...')
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
        const connected = await new Promise<boolean>((resolve) => {
          const ws = new WebSocket(wsUrl);
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              console.log(`⏰ Connection timeout: ${wsUrl}`);
              ws.close();
              resolve(false);
              resolved = true;
            }
          }, 15000); // 15 second timeout

          ws.onopen = () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            console.log(`✅ Connected to signaling server: ${wsUrl}`);
            this.ws = ws;
            this.signalingStatus = "connected";
            this.onSignalingStatusChange?.(this.signalingStatus);
            this.setupWebSocketHandlers();
            this.joinSession();
            resolve(true);
          };

          ws.onerror = (error) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            console.log(`❌ Connection error: ${wsUrl}`, error);
            resolve(false);
          };

          ws.onclose = () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            console.log(`🔌 Connection closed: ${wsUrl}`);
            resolve(false);
          };
        });

        if (connected) {
          this.isConnecting = false;
          this.connectionAttempts = 0;
          return;
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
      'wss://webrtc-signaling-server.onrender.com', // Added another potential server
    ]
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
    
    const delay = Math.min(3000 * this.connectionAttempts, 15000)
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
        
        // If we are the initiator and there are two users, initiate P2P
        if (this.userCount === 2 && this.isInitiator && !this.pc) {
          console.log('🚀 Both users present - initiating HIGH-SPEED P2P connection...')
          setTimeout(() => this.initiatePeerConnection(), 1000); // Small delay to ensure peer is ready
        }
        break
        
      case 'user-joined':
        this.userCount = message.userCount ?? 0
        this.onUserCountChange?.(this.userCount)
        console.log(`👤 User joined (${this.userCount} users)`)
        
        if (this.userCount === 2 && this.isInitiator && !this.pc) {
          console.log('🚀 Both users present - initiating HIGH-SPEED P2P connection...')
          setTimeout(() => this.initiatePeerConnection(), 1000);
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
      console.log('⚠️ Peer connection already exists or destroyed, skipping initiation.')
      return;
    }
    
    try {
      console.log('🔧 Creating HIGH-SPEED peer connection...')
      this.pc = new RTCPeerConnection(this.rtcConfig)
      this.negotiationNeededQueue = false; // Reset negotiation queue
      
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate:', event.candidate.type, event.candidate.protocol);
          this.sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate,
            sessionId: this.sessionId
          })
        } else {
          console.log('🧊 ICE gathering complete');
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
            console.log('✅ HIGH-SPEED P2P Connection established successfully!')
            this.processPendingFiles(); // Process files once connected
            break
          case 'connecting':
            console.log('🔄 P2P Connection in progress...')
            break
          case 'failed':
          case 'disconnected': // Handle disconnected state more explicitly
          case 'closed':
            console.log(`❌ P2P Connection ${state}. Attempting to reset and reconnect.`)
            this.connectionStatus = "connecting"
            this.onConnectionStatusChange?.(this.connectionStatus)
            this.onError?.(`P2P connection ${state}. Retrying...`);
            this.resetPeerConnection(); // Reset and allow re-initiation
            break
        }
      }

      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc?.iceConnectionState;
        console.log(`🧊 ICE Connection state: ${state}`);
        if (state === 'failed' || state === 'disconnected') {
          console.log('❌ ICE connection failed/disconnected - attempting ICE restart');
          // This might trigger onnegotiationneeded, which will handle the restart
          if (this.pc && this.pc.connectionState !== 'closed') {
            this.pc.restartIce();
          }
        }
      };
      
      this.pc.ondatachannel = (event) => {
        console.log('📡 HIGH-SPEED data channel received from peer')
        this.setupDataChannel(event.channel)
      }

      this.pc.onnegotiationneeded = async () => {
        if (this.isInitiator && !this.negotiationNeededQueue) {
          this.negotiationNeededQueue = true;
          console.log('🔄 Negotiation needed. Creating offer...');
          try {
            const offer = await this.pc!.createOffer({
              offerToReceiveAudio: false,
              offerToReceiveVideo: false
            });
            await this.pc!.setLocalDescription(offer);
            this.sendSignalingMessage({
              type: 'offer',
              offer: offer,
              sessionId: this.sessionId
            });
            console.log('📤 Offer sent due to negotiation needed.');
          } catch (error) {
            console.error('❌ Error creating/sending offer on negotiation needed:', error);
            this.onError?.('Failed to renegotiate P2P connection');
          } finally {
            this.negotiationNeededQueue = false;
          }
        }
      };
      
      // Create HIGH-SPEED data channel (initiator only)
      if (this.isInitiator) {
        console.log('📡 Creating HIGH-SPEED data channel...');
        this.dataChannel = this.pc.createDataChannel('bulletproof-highspeed', {
          ordered: false, // Unordered for maximum speed
          maxRetransmits: 0, // No retransmits for speed (we handle re-sending if needed)
          maxPacketLifeTime: 3000, // 3 second packet lifetime
        });
        this.setupDataChannel(this.dataChannel);
      }
      
      // If initiator, and data channel is created, trigger initial offer
      if (this.isInitiator && this.dataChannel) {
        // The onnegotiationneeded event will handle creating and sending the offer
        // No need to explicitly call createOffer here if onnegotiationneeded is reliable
      }
      
    } catch (error) {
      console.error('❌ Failed to create peer connection:', error)
      this.onError?.('Failed to establish P2P connection')
      this.resetPeerConnection()
    }
  }
  
  private setupDataChannel(channel: RTCDataChannel): void {
    console.log(`🔧 Setting up HIGH-SPEED data channel: ${channel.label}`)
    this.dataChannel = channel
    
    // Configure for HIGH-SPEED file transfers
    channel.binaryType = 'arraybuffer'
    
    channel.onopen = () => {
      console.log('✅ HIGH-SPEED Data channel opened!')
      console.log(`📊 Channel config: ordered=${channel.ordered}, maxRetransmits=${channel.maxRetransmits}`)
      this.connectionStatus = "connected"
      this.onConnectionStatusChange?.(this.connectionStatus)
      
      // Process any pending files immediately
      this.processPendingFiles()
    }
    
    channel.onclose = () => {
      console.log('🔌 Data channel closed')
      this.connectionStatus = "connecting"
      this.onConnectionStatusChange?.(this.connectionStatus)
      // Data channel closed, peer connection might still be open, but we can't send data.
      // Consider resetting PC if this happens unexpectedly.
      if (!this.isDestroyed) {
        this.resetPeerConnection();
      }
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
            console.log('🧊 Sending ICE candidate:', event.candidate.type, event.candidate.protocol)
            this.sendSignalingMessage({
              type: 'ice-candidate',
              candidate: event.candidate,
              sessionId: this.sessionId
            })
          } else {
            console.log('🧊 ICE gathering complete');
          }
        }
        
        this.pc.onconnectionstatechange = () => {
          const state = this.pc?.connectionState
          console.log(`🔗 P2P Connection state: ${state}`)
          
          switch (state) {
            case 'connected':
              this.connectionStatus = "connected"
              this.onConnectionStatusChange?.(this.connectionStatus)
              console.log('✅ P2P Connection established!')
              this.processPendingFiles();
              break
            case 'connecting':
              console.log('🔄 P2P Connection in progress...')
              break
            case 'failed':
            case 'disconnected':
            case 'closed':
              console.log(`❌ P2P Connection ${state}. Attempting to reset and reconnect.`)
              this.connectionStatus = "connecting"
              this.onConnectionStatusChange?.(this.connectionStatus)
              this.onError?.(`P2P connection ${state}. Retrying...`);
              this.resetPeerConnection();
              break
          }
        }

        this.pc.oniceconnectionstatechange = () => {
          const state = this.pc?.iceConnectionState;
          console.log(`🧊 ICE Connection state: ${state}`);
          if (state === 'failed' || state === 'disconnected') {
            console.log('❌ ICE connection failed/disconnected - attempting ICE restart');
            if (this.pc && this.pc.connectionState !== 'closed') {
              this.pc.restartIce();
            }
          }
        };
        
        this.pc.ondatachannel = (event) => {
          console.log('📡 Data channel received')
          this.setupDataChannel(event.channel)
        }
      }
      
      if (!message.offer) {
        throw new Error('No offer in message')
      }
      
      console.log('📥 Setting remote description from offer...')
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
      this.resetPeerConnection(); // Reset on offer handling failure
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
        console.warn('⚠️ No peer connection or answer data to handle.')
      }
    } catch (error) {
      console.error('❌ Failed to handle answer:', error)
      this.onError?.('Failed to handle connection answer')
    }
  }
  
  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    try {
      if (this.pc && message.candidate) {
        console.log('🧊 Adding ICE candidate:', message.candidate.candidate)
        // Ensure the peer connection is in a state to add candidates
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate))
          console.log('✅ ICE candidate added')
        } else {
          console.warn('⚠️ Cannot add ICE candidate, remote description not set yet.')
          // Queue candidates if remote description is not set yet
          // (This is a simplified approach, a real-world app might queue and retry)
        }
      }
    } catch (error) {
      console.error('❌ Failed to handle ICE candidate:', error)
      this.onError?.('Failed to add ICE candidate');
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
  
  // PUBLIC METHODS - OPTIMIZED FOR HIGH SPEED
  async sendFiles(files: File[]): Promise<void> {
    console.log(`📤 Preparing to send ${files.length} files at HIGH SPEED`)

    for (const file of files) {
      const fileId = this.generateId()
      
      console.log(`📤 Queuing file: ${file.name} (${Math.round(file.size/1024)}KB)`)
      
      // Store file immediately
      this.pendingFiles.set(fileId, file)
      
      // Create transfer record
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
      
      // Pre-process file into chunks for HIGH SPEED
      await this.preprocessFileForHighSpeed(file, fileId)
      
      // Send offer if connected, otherwise it will be sent when connection is ready
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        console.log(`📤 Sending file offer: ${file.name}`)
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
      } else {
        console.log(`⚠️ Data channel not ready, file offer will be sent when connected: ${file.name}`)
      }
    }
  }
  
  private async preprocessFileForHighSpeed(file: File, fileId: string): Promise<void> {
    console.log(`🔧 Pre-processing file for HIGH SPEED: ${file.name}`)
    
    const totalChunks = Math.ceil(file.size / this.chunkSize)
    const chunks: ArrayBuffer[] = []
    
    // Pre-read all chunks into memory for maximum speed
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize, file.size)
      const chunk = file.slice(start, end)
      const arrayBuffer = await chunk.arrayBuffer()
      chunks.push(arrayBuffer)
    }
    
    console.log(`📊 File pre-processed: ${totalChunks} chunks of ${Math.round(this.chunkSize/1024)}KB each`)
    
    // Store for HIGH SPEED sending
    this.sendingFiles.set(fileId, {
      file,
      chunks,
      totalChunks
    })
  }
  
  private async processPendingFiles(): Promise<void> {
    if (this.pendingFiles.size === 0) return
    
    console.log(`📤 Processing ${this.pendingFiles.size} pending files...`)
    
    // Send offers for all pending files that haven't been offered yet
    for (const [fileId, file] of this.pendingFiles.entries()) {
      // Check if this file has already been offered (e.g., if data channel was temporarily down)
      const transfer = this.fileTransfers.get(fileId);
      if (transfer && transfer.status === "pending") { // Only send offer if still pending
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          console.log(`📤 Sending delayed file offer: ${file.name}`)
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
  
  // HIGH SPEED FILE TRANSFER METHODS
  private async sendFileAtHighSpeed(fileId: string): Promise<void> {
    const sendingFile = this.sendingFiles.get(fileId)
    const transfer = this.fileTransfers.get(fileId)
    
    if (!sendingFile || !transfer) {
      console.error(`❌ File data not found for sending: ${fileId}`)
      const errorMsg = `File data not found for transfer ${fileId}`;
      this.onError?.(errorMsg);
      if (transfer) {
        transfer.status = "error";
        this.updateFileTransfers();
      }
      return;
    }

    console.log(`🚀 Starting HIGH SPEED transfer: ${sendingFile.file.name}`)
    transfer.status = "transferring"
    this.updateFileTransfers()

    const { file, chunks, totalChunks } = sendingFile
    const startTime = Date.now()
    let sentChunks = 0

    try {
      // HIGH SPEED CONCURRENT SENDING
      const sendChunkBatch = async (startIndex: number, batchSize: number) => {
        const promises: Promise<void>[] = []
        
        for (let i = 0; i < batchSize && startIndex + i < totalChunks; i++) {
          const chunkIndex = startIndex + i
          promises.push(this.sendSingleChunk(fileId, chunkIndex, chunks[chunkIndex], file, totalChunks))
        }
        
        await Promise.all(promises)
        return Math.min(batchSize, totalChunks - startIndex)
      }

      // Send chunks in concurrent batches for maximum speed
      while (sentChunks < totalChunks) {
        // Check if data channel is still open
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
          throw new Error('Data channel closed during transfer')
        }

        // Wait for buffer to clear if needed
        while (this.dataChannel.bufferedAmount > this.maxBufferedAmount) {
          await new Promise(resolve => setTimeout(resolve, 5))
        }

        const batchSize = Math.min(this.concurrentChunks, totalChunks - sentChunks)
        const chunksSent = await sendChunkBatch(sentChunks, batchSize)
        sentChunks += chunksSent

        // Update progress
        transfer.progress = Math.round((sentChunks / totalChunks) * 100)

        // Update speed
        const elapsed = (Date.now() - startTime) / 1000
        const bytesTransferred = sentChunks * this.chunkSize
        transfer.speed = Math.round(bytesTransferred / elapsed)

        this.updateFileTransfers()

        // Log progress every 10%
        if (transfer.progress % 10 === 0 && transfer.progress > 0) {
          console.log(`📊 HIGH SPEED: ${file.name} ${transfer.progress}% (${Math.round(transfer.speed / 1024)} KB/s)`)
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1))
      }

      // Mark as completed
      transfer.status = "completed"
      transfer.progress = 100
      this.updateFileTransfers()

      // Cleanup
      this.sendingFiles.delete(fileId)
      this.pendingFiles.delete(fileId) // Remove from pending once sent

      console.log(`✅ HIGH SPEED transfer completed: ${file.name}`)

    } catch (error) {
      console.error(`❌ HIGH SPEED transfer failed ${file.name}:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to send ${file.name}`)
    }
  }
  
  private async sendSingleChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer, file: File, totalChunks: number): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not available')
    }

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

    // Send chunk at HIGH SPEED
    this.dataChannel.send(combined.buffer)
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
        console.log(`📥 Starting HIGH SPEED receive: ${fileName} (${totalChunks} chunks)`)
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
          console.log(`📊 HIGH SPEED receive ${fileName}: ${transfer.progress}% (${Math.round(transfer.speed! / 1024)} KB/s)`)
        }
      }
      
      // Check if file is complete
      if (incomingFile.receivedChunks === totalChunks) {
        console.log(`✅ HIGH SPEED receive complete: ${fileName}`)
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
      console.log(`🔧 Assembling HIGH SPEED file: ${incomingFile.fileName}`)
      
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
      console.log(`✅ HIGH SPEED file received: ${incomingFile.fileName} (${avgSpeed} KB/s average)`)
      
    } catch (error) {
      console.error(`❌ Failed to assemble file:`, error)
      transfer.status = "error"
      this.updateFileTransfers()
      this.onError?.(`Failed to download ${incomingFile.fileName}`)
    }
  }
  
  private handleFileOffer(data: FileOfferData): void {
    console.log(`📥 HIGH SPEED file offer: ${data.fileName} (${Math.round(data.fileSize/1024)}KB)`)

    // Auto-accept file immediately
    console.log(`✅ Auto-accepting HIGH SPEED file: ${data.fileName}`)
    this.sendP2PMessage({
      type: 'file-accept',
      data: { fileId: data.fileId },
      timestamp: Date.now(),
      id: this.generateId()
    })

    console.log(`📤 HIGH SPEED file acceptance sent: ${data.fileName}`)
  }
  
  private handleFileAccept(data: FileAcceptData): void {
    console.log(`✅ HIGH SPEED file accepted: ${data.fileId}`)

    // Start HIGH SPEED transfer immediately
    this.sendFileAtHighSpeed(data.fileId)
  }
  
  private handleFileComplete(data: FileCompleteData): void {
    console.log(`✅ HIGH SPEED file transfer completed: ${data.fileId}`)
    
    const transfer = this.fileTransfers.get(data.fileId)
    if (transfer && transfer.direction === "sending") {
      if (data.success !== false) {
        transfer.status = "completed"
        console.log(`📤 HIGH SPEED sender confirmed: ${transfer.name} delivered`)
      } else {
        transfer.status = "error"
        console.log(`📤 HIGH SPEED sender notified: ${transfer.name} failed`)
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
    } else {
      console.warn('⚠️ Data channel not open, cannot send P2P message:', message.type);
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
      console.warn('⚠️ Signaling WebSocket not open, cannot send signaling message:', message.type);
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
    this.negotiationNeededQueue = false; // Reset queue on full reset
    
    // Attempt to re-initiate connection after a short delay
    if (!this.isDestroyed && this.userCount === 2) { // Only re-init if both users are still in session
      console.log('Attempting to re-initiate P2P connection after reset...');
      setTimeout(() => this.initiatePeerConnection(), 2000);
    }
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
    this.sendingFiles.clear()
    this.chatMessages = []
  }
}
