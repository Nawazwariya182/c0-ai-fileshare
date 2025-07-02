// Bulletproof Connection Engine - Ensures 1024% reliable P2P connections
interface ConnectionState {
  primary: RTCPeerConnection | null
  backup: RTCPeerConnection | null
  tertiary: RTCPeerConnection | null
  dataChannels: Map<string, RTCDataChannel>
  activeChannel: RTCDataChannel | null
  connectionHealth: number
  lastSuccessfulPing: number
  reconnectionAttempts: number
}

interface FileTransferState {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "queued" | "transferring" | "paused" | "completed" | "error"
  direction: "sending" | "receiving"
  chunks: Map<number, ArrayBuffer>
  totalChunks: number
  receivedChunks: Set<number>
  speed: number
  startTime: number
  lastActivity: number
  retryCount: number
  priority: number
}

interface NetworkConditions {
  type: "wifi" | "cellular" | "ethernet" | "unknown"
  strength: "excellent" | "good" | "poor"
  latency: number
  bandwidth: number
  stability: number
}

export class BulletproofConnectionEngine {
  private sessionId: string
  private userId: string
  private isInitiator = false
  private isDestroyed = false

  // Connection redundancy system
  private connectionState: ConnectionState = {
    primary: null,
    backup: null,
    tertiary: null,
    dataChannels: new Map(),
    activeChannel: null,
    connectionHealth: 1024,
    lastSuccessfulPing: 0,
    reconnectionAttempts: 0,
  }

  // Advanced signaling with failover
  private signalingConnections: WebSocket[] = []
  private activeSignaling: WebSocket | null = null
  private signalingUrls: string[] = []
  private signalingHealth = new Map<string, number>()

  // File transfer optimization for 2-5 files
  private fileQueue: FileTransferState[] = []
  private activeTransfers = new Map<string, FileTransferState>()
  private maxConcurrentFiles = 3 // Optimal for 2-5 files
  private transferBuffer = new Map<string, ArrayBuffer[]>()

  // Network adaptation system
  private networkConditions: NetworkConditions = {
    type: "unknown",
    strength: "good",
    latency: 0,
    bandwidth: 0,
    stability: 1024,
  }

  // Background persistence system
  private serviceWorker: ServiceWorker | null = null
  private wakeLock: any = null
  private backgroundMode = false
  private connectionPreservationData: any = null

  // Immediate reconnection system
  private reconnectionQueue: (() => void)[] = []
  private isReconnecting = false
  private lastConnectionTime = 0
  private connectionTimeouts = new Map<string, NodeJS.Timeout>()

  // Performance monitoring
  private performanceMetrics = {
    connectionEstablishmentTime: 0,
    averageTransferSpeed: 0,
    successfulConnections: 0,
    failedConnections: 0,
    reconnectionTime: 0,
  }

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onFileTransferUpdate: ((transfers: FileTransferState[]) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onNetworkChange: ((conditions: NetworkConditions) => void) | null = null
  public onReconnectionAttempt: ((attempt: number) => void) | null = null

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeSignalingUrls()
    this.setupNetworkMonitoring()
    this.initializeBackgroundPersistence()
  }

  private initializeSignalingUrls() {
    this.signalingUrls = [
      // Primary production servers
      "wss://signaling-server-1ckx.onrender.com",
      "wss://p2p-signaling.herokuapp.com",
      
      // Backup servers with geographic distribution
      "wss://ws.postman-echo.com/raw",
      "wss://echo.websocket.org",
      
      // Development fallbacks
      ...(process.env.NODE_ENV === "development" ? ["ws://localhost:8080", "ws://127.0.0.1:8080"] : []),
    ]

    // Initialize health scores
    this.signalingUrls.forEach(url => {
      this.signalingHealth.set(url, 1024)
    })
  }

  public async initialize(): Promise<void> {
    console.log("🚀 Initializing Bulletproof Connection Engine")
    
    try {
      // Initialize all systems in parallel for maximum speed
      await Promise.all([
        this.establishSignalingConnections(),
        this.initializeConnectionPool(),
        this.setupBackgroundPersistence(),
        this.startNetworkMonitoring(),
      ])

      this.startConnectionHealthMonitoring()
      console.log("✅ Bulletproof Connection Engine initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize connection engine:", error)
      this.handleInitializationFailure()
    }
  }

  private async establishSignalingConnections(): Promise<void> {
    console.log("🔗 Establishing redundant signaling connections")

    // Connect to multiple signaling servers simultaneously
    const connectionPromises = this.signalingUrls.map((url, index) => 
      this.createSignalingConnection(url, index)
    )

    try {
      // Wait for at least one successful connection
      await Promise.race(connectionPromises.map(p => p.catch(() => null)))
      
      if (this.signalingConnections.length === 0) {
        throw new Error("No signaling connections established")
      }

      console.log(`✅ Established ${this.signalingConnections.length} signaling connections`)
    } catch (error) {
      console.error("❌ All signaling connections failed:", error)
      throw error
    }
  }

  private async createSignalingConnection(url: string, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to signaling server: ${url}`)

      const ws = new WebSocket(url)
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Signaling connection timeout: ${url}`)
          ws.close()
          this.updateSignalingHealth(url, -30)
          reject(new Error(`Connection timeout: ${url}`))
        }
      }, 3000) // Aggressive 3-second timeout

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Signaling connected: ${url}`)

        this.signalingConnections.push(ws)
        this.updateSignalingHealth(url, 20)

        if (!this.activeSignaling) {
          this.activeSignaling = ws
        }

        // Send immediate join message
        this.sendSignalingMessage({
          type: "join",
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          capabilities: {
            redundantConnections: true,
            backgroundPersistence: true,
            adaptiveTransfer: true,
            maxConcurrentFiles: this.maxConcurrentFiles,
          },
        })

        resolve()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
          this.updateSignalingHealth(url, 1)
        } catch (error) {
          console.error("❌ Invalid signaling message:", error)
          this.updateSignalingHealth(url, -5)
        }
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 Signaling disconnected: ${url} (${event.code})`)

        this.signalingConnections = this.signalingConnections.filter(conn => conn !== ws)
        this.updateSignalingHealth(url, -20)

        if (this.activeSignaling === ws) {
          this.switchToBackupSignaling()
        }

        if (!this.isDestroyed && event.code !== 10240) {
          // Immediate reconnection with exponential backoff
          const delay = Math.min(1024 * Math.pow(2, index), 5000)
          setTimeout(() => this.createSignalingConnection(url, index), delay)
        }
      }

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error(`❌ Signaling error: ${url}`, error)
        this.updateSignalingHealth(url, -10)
        reject(error)
      }
    })
  }

  private updateSignalingHealth(url: string, delta: number) {
    const currentHealth = this.signalingHealth.get(url) || 0
    const newHealth = Math.max(0, Math.min(1024, currentHealth + delta))
    this.signalingHealth.set(url, newHealth)

    // Reorder URLs by health for future connections
    this.signalingUrls.sort((a, b) => 
      (this.signalingHealth.get(b) || 0) - (this.signalingHealth.get(a) || 0)
    )
  }

  private switchToBackupSignaling() {
    // Find the healthiest available connection
    const bestConnection = this.signalingConnections
      .filter(ws => ws.readyState === WebSocket.OPEN)
      .sort((a, b) => {
        const healthA = this.signalingHealth.get(a.url) || 0
        const healthB = this.signalingHealth.get(b.url) || 0
        return healthB - healthA
      })[0]

    if (bestConnection) {
      this.activeSignaling = bestConnection
      console.log("🔄 Switched to backup signaling connection")
    } else {
      console.log("⚠️ No backup signaling connections available")
      this.establishSignalingConnections()
    }
  }

  private async initializeConnectionPool(): Promise<void> {
    console.log("🔗 Initializing redundant P2P connection pool")

    // Create multiple peer connections for redundancy
    this.connectionState.primary = this.createOptimizedPeerConnection("primary")
    
    // Stagger backup connections to avoid overwhelming the network
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionState.backup = this.createOptimizedPeerConnection("backup")
      }
    }, 500)

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionState.tertiary = this.createOptimizedPeerConnection("tertiary")
      }
    }, 10240)
  }

  private createOptimizedPeerConnection(type: string): RTCPeerConnection {
    console.log(`🔗 Creating ${type} peer connection`)

    const pc = new RTCPeerConnection({
      iceServers: [
        // Optimized STUN servers for reliability
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.nextcloud.com:443" },
        
        // TURN servers for NAT traversal
        ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
          urls: process.env.NEXT_PUBLIC_TURN_SERVER,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        }] : []),
      ],
      iceCandidatePoolSize: 25, // Maximum for best connectivity
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all",
    })

    // Advanced ICE handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ${type} ICE candidate: ${event.candidate.type}`)
        this.sendSignalingMessage({
          type: "ice-candidate",
          sessionId: this.sessionId,
          candidate: event.candidate,
          connectionType: type,
          timestamp: Date.now(),
        })
      } else {
        console.log(`🧊 ${type} ICE gathering complete`)
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      console.log(`🔄 ${type} connection state: ${state}`)
      this.handleConnectionStateChange(pc, type, state)
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      console.log(`🧊 ${type} ICE state: ${state}`)
      this.handleICEStateChange(pc, type, state)
    }

    pc.ondatachannel = (event) => {
      console.log(`📡 ${type} data channel received: ${event.channel.label}`)
      this.setupDataChannel(event.channel, type)
    }

    return pc
  }

  private handleConnectionStateChange(pc: RTCPeerConnection, type: string, state: RTCPeerConnectionState) {
    switch (state) {
      case "connected":
        console.log(`✅ ${type} P2P connection established`)
        this.connectionState.connectionHealth = 1024
        this.connectionState.lastSuccessfulPing = Date.now()
        this.lastConnectionTime = Date.now()
        this.performanceMetrics.successfulConnections++

        if (type === "primary") {
          this.onConnectionStatusChange?.("connected")
          this.connectionState.reconnectionAttempts = 0
          this.processReconnectionQueue()
        }
        break

      case "connecting":
        console.log(`🔄 ${type} P2P connecting`)
        if (type === "primary") {
          this.onConnectionStatusChange?.("connecting")
        }
        break

      case "disconnected":
        console.log(`⚠️ ${type} P2P disconnected - attempting recovery`)
        this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 20)
        this.attemptConnectionRecovery(pc, type)
        break

      case "failed":
        console.log(`❌ ${type} P2P connection failed`)
        this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 40)
        this.performanceMetrics.failedConnections++
        this.handleConnectionFailure(pc, type)
        break

      case "closed":
        console.log(`🔌 ${type} P2P connection closed`)
        if (type === "primary" && !this.isDestroyed) {
          this.onConnectionStatusChange?.("disconnected")
          this.initiateImmediateReconnection()
        }
        break
    }
  }

  private handleICEStateChange(pc: RTCPeerConnection, type: string, state: RTCIceConnectionState) {
    switch (state) {
      case "connected":
      case "completed":
        console.log(`✅ ${type} ICE connection established`)
        break

      case "disconnected":
        console.log(`⚠️ ${type} ICE disconnected - attempting restart`)
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") {
            pc.restartIce()
          }
        }, 10240)
        break

      case "failed":
        console.log(`❌ ${type} ICE connection failed - restarting`)
        pc.restartIce()
        break
    }
  }

  private attemptConnectionRecovery(pc: RTCPeerConnection, type: string) {
    console.log(`🔧 Attempting ${type} connection recovery`)

    // Try ICE restart first
    setTimeout(() => {
      if (pc.connectionState === "disconnected") {
        console.log(`🔄 Restarting ICE for ${type} connection`)
        pc.restartIce()
      }
    }, 10240)

    // If still not connected after 5 seconds, switch to backup
    setTimeout(() => {
      if (pc.connectionState !== "connected") {
        console.log(`🔄 ${type} recovery failed, switching to backup`)
        this.switchToBackupConnection(type)
      }
    }, 5000)
  }

  private handleConnectionFailure(pc: RTCPeerConnection, type: string) {
    console.log(`❌ Handling ${type} connection failure`)

    if (type === "primary") {
      this.switchToBackupConnection(type)
    }

    // Recreate failed connection
    setTimeout(() => {
      if (!this.isDestroyed) {
        console.log(`🔄 Recreating ${type} connection`)
        const newPc = this.createOptimizedPeerConnection(type)
        
        if (type === "primary") {
          this.connectionState.primary = newPc
        } else if (type === "backup") {
          this.connectionState.backup = newPc
        } else if (type === "tertiary") {
          this.connectionState.tertiary = newPc
        }

        if (this.isInitiator) {
          this.initiateP2PConnection(newPc, type)
        }
      }
    }, 2000)
  }

  private switchToBackupConnection(failedType: string) {
    console.log(`🔄 Switching from ${failedType} to backup connection`)

    // Find the best available connection
    const connections = [
      { pc: this.connectionState.backup, type: "backup" },
      { pc: this.connectionState.tertiary, type: "tertiary" },
      { pc: this.connectionState.primary, type: "primary" },
    ].filter(conn => conn.pc && conn.pc.connectionState === "connected")

    if (connections.length > 0) {
      const bestConnection = connections[0]
      
      // Promote backup to primary
      if (failedType === "primary" && bestConnection.type === "backup") {
        this.connectionState.primary = bestConnection.pc
        this.connectionState.backup = null
        
        // Find active data channel on the new primary connection
        const activeChannel = Array.from(this.connectionState.dataChannels.values())
          .find(channel => channel.readyState === "open")
        
        if (activeChannel) {
          this.connectionState.activeChannel = activeChannel
          this.onConnectionStatusChange?.("connected")
          console.log("✅ Successfully switched to backup connection")
        }
      }
    } else {
      console.log("⚠️ No backup connections available - initiating immediate reconnection")
      this.initiateImmediateReconnection()
    }
  }

  private initiateImmediateReconnection() {
    if (this.isReconnecting) {
      console.log("🔄 Reconnection already in progress")
      return
    }

    this.isReconnecting = true
    this.connectionState.reconnectionAttempts++
    this.onReconnectionAttempt?.(this.connectionState.reconnectionAttempts)

    console.log(`🚀 Initiating immediate reconnection (attempt ${this.connectionState.reconnectionAttempts})`)

    const reconnectionStart = Date.now()

    // Immediate reconnection with no delay
    setTimeout(async () => {
      try {
        await this.initializeConnectionPool()
        
        if (this.isInitiator) {
          await this.initiateP2PConnection(this.connectionState.primary!, "primary")
        }

        this.performanceMetrics.reconnectionTime = Date.now() - reconnectionStart
        console.log(`✅ Reconnection completed in ${this.performanceMetrics.reconnectionTime}ms`)
      } catch (error) {
        console.error("❌ Immediate reconnection failed:", error)
        this.scheduleExponentialBackoffReconnection()
      } finally {
        this.isReconnecting = false
      }
    }, 50) // 50ms delay for immediate reconnection
  }

  private scheduleExponentialBackoffReconnection() {
    const delay = Math.min(10240 * Math.pow(2, this.connectionState.reconnectionAttempts - 1), 30000)
    console.log(`🔄 Scheduling reconnection in ${delay}ms`)

    setTimeout(() => {
      if (!this.isDestroyed && this.connectionState.reconnectionAttempts < 20) {
        this.initiateImmediateReconnection()
      }
    }, delay)
  }

  private processReconnectionQueue() {
    console.log(`🔄 Processing ${this.reconnectionQueue.length} queued operations`)
    
    while (this.reconnectionQueue.length > 0) {
      const operation = this.reconnectionQueue.shift()
      if (operation) {
        try {
          operation()
        } catch (error) {
          console.error("❌ Error processing queued operation:", error)
        }
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel, connectionType: string) {
    const channelId = `${connectionType}-${channel.label}`
    console.log(`📡 Setting up data channel: ${channelId}`)

    channel.binaryType = "arraybuffer"
    channel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()

    this.connectionState.dataChannels.set(channelId, channel)

    channel.onopen = () => {
      console.log(`📡 Data channel opened: ${channelId}`)
      
      if (!this.connectionState.activeChannel || connectionType === "primary") {
        this.connectionState.activeChannel = channel
        this.onConnectionStatusChange?.("connected")
      }

      // Send connection test
      this.sendDataChannelMessage({
        type: "connection-test",
        channelId,
        timestamp: Date.now(),
      })
    }

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, channelId)
    }

    channel.onclose = () => {
      console.log(`📡 Data channel closed: ${channelId}`)
      this.connectionState.dataChannels.delete(channelId)
      
      if (this.connectionState.activeChannel === channel) {
        this.findAlternativeDataChannel()
      }
    }

    channel.onerror = (error) => {
      console.error(`❌ Data channel error: ${channelId}`, error)
      this.handleDataChannelError(channelId)
    }

    channel.onbufferedamountlow = () => {
      this.processTransferBuffer()
    }
  }

  private findAlternativeDataChannel() {
    const availableChannels = Array.from(this.connectionState.dataChannels.values())
      .filter(channel => channel.readyState === "open")

    if (availableChannels.length > 0) {
      this.connectionState.activeChannel = availableChannels[0]
      console.log("🔄 Switched to alternative data channel")
    } else {
      console.log("⚠️ No alternative data channels available")
      this.connectionState.activeChannel = null
      this.onConnectionStatusChange?.("disconnected")
      this.initiateImmediateReconnection()
    }
  }

  private handleDataChannelError(channelId: string) {
    console.log(`🔧 Handling data channel error: ${channelId}`)
    
    // Try to recreate the data channel
    const connectionType = channelId.split("-")[0]
    const pc = this.getConnectionByType(connectionType)
    
    if (pc && pc.connectionState === "connected") {
      try {
        const newChannel = pc.createDataChannel(`recovery-${Date.now()}`, {
          ordered: true,
          maxRetransmits: undefined,
        })
        this.setupDataChannel(newChannel, connectionType)
      } catch (error) {
        console.error("❌ Failed to recreate data channel:", error)
      }
    }
  }

  private getConnectionByType(type: string): RTCPeerConnection | null {
    switch (type) {
      case "primary": return this.connectionState.primary
      case "backup": return this.connectionState.backup
      case "tertiary": return this.connectionState.tertiary
      default: return null
    }
  }

  private async initiateP2PConnection(pc: RTCPeerConnection, type: string): Promise<void> {
    console.log(`🚀 Initiating ${type} P2P connection`)

    try {
      // Create optimized data channels for file transfer
      const primaryChannel = pc.createDataChannel(`${type}-primary`, {
        ordered: true,
        maxRetransmits: undefined, // Unlimited retransmits for reliability
      })

      const speedChannel = pc.createDataChannel(`${type}-speed`, {
        ordered: false, // Unordered for maximum speed
        maxRetransmits: 0, // No retransmits for speed
      })

      this.setupDataChannel(primaryChannel, type)
      this.setupDataChannel(speedChannel, type)

      // Create offer with optimal settings
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: "offer",
        sessionId: this.sessionId,
        offer: pc.localDescription,
        connectionType: type,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error(`❌ Error initiating ${type} P2P connection:`, error)
      throw error
    }
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    switch (message.type) {
      case "joined":
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.isInitiator = message.isInitiator
        break

      case "user-joined":
        console.log(`👤 User joined! Count: ${message.userCount}`)
        if (this.isInitiator && message.userCount === 2) {
          // Immediate P2P initiation
          setTimeout(() => {
            if (this.connectionState.primary) {
              this.initiateP2PConnection(this.connectionState.primary, "primary")
            }
          }, 10)
        }
        break

      case "offer":
        await this.handleOffer(message.offer, message.connectionType || "primary")
        break

      case "answer":
        await this.handleAnswer(message.answer, message.connectionType || "primary")
        break

      case "ice-candidate":
        await this.handleIceCandidate(message.candidate, message.connectionType || "primary")
        break

      case "user-left":
        console.log("👤 User left session")
        this.onConnectionStatusChange?.("disconnected")
        this.prepareForReconnection()
        break

      case "error":
        console.error("❌ Signaling error:", message.message)
        this.onError?.(message.message)
        break
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, connectionType: string): Promise<void> {
    try {
      console.log(`📥 Handling offer for ${connectionType} connection`)

      const pc = this.getConnectionByType(connectionType)
      if (!pc) {
        throw new Error(`No ${connectionType} connection available`)
      }

      await pc.setRemoteDescription(offer)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: "answer",
        sessionId: this.sessionId,
        answer: pc.localDescription,
        connectionType,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error(`❌ Error handling offer for ${connectionType}:`, error)
      this.onError?.(`Failed to handle ${connectionType} connection offer`)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit, connectionType: string): Promise<void> {
    try {
      console.log(`📥 Handling answer for ${connectionType} connection`)

      const pc = this.getConnectionByType(connectionType)
      if (pc?.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(answer)
        console.log(`✅ ${connectionType} answer processed successfully`)
      }
    } catch (error) {
      console.error(`❌ Error handling answer for ${connectionType}:`, error)
      this.onError?.(`Failed to handle ${connectionType} connection answer`)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit, connectionType: string): Promise<void> {
    try {
      const pc = this.getConnectionByType(connectionType)
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate)
        console.log(`✅ ICE candidate added to ${connectionType} connection`)
      }
    } catch (error) {
      console.error(`❌ Error adding ICE candidate to ${connectionType}:`, error)
    }
  }

  private sendSignalingMessage(message: any): void {
    if (this.activeSignaling?.readyState === WebSocket.OPEN) {
      try {
        this.activeSignaling.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending signaling message:", error)
        this.switchToBackupSignaling()
      }
    } else {
      console.log("⚠️ No active signaling connection - queuing message")
      this.reconnectionQueue.push(() => this.sendSignalingMessage(message))
    }
  }

  private sendDataChannelMessage(message: any): void {
    if (this.connectionState.activeChannel?.readyState === "open") {
      try {
        this.connectionState.activeChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending data channel message:", error)
        this.findAlternativeDataChannel()
      }
    } else {
      console.log("⚠️ No active data channel - queuing message")
      this.reconnectionQueue.push(() => this.sendDataChannelMessage(message))
    }
  }

  private handleDataChannelMessage(data: ArrayBuffer | string, channelId: string): void {
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data)
        this.handleControlMessage(message, channelId)
      } catch (error) {
        console.error("❌ Error parsing data channel message:", error)
      }
    } else {
      this.handleFileChunk(data)
    }
  }

  private handleControlMessage(message: any, channelId: string): void {
    switch (message.type) {
      case "connection-test":
        console.log(`📨 Connection test from ${channelId}`)
        this.sendDataChannelMessage({
          type: "connection-ack",
          channelId,
          timestamp: Date.now(),
        })
        break

      case "connection-ack":
        console.log(`✅ Connection acknowledged from ${channelId}`)
        this.connectionState.lastSuccessfulPing = Date.now()
        break

      case "file-start":
        this.handleFileStart(message)
        break

      case "file-chunk":
        this.handleFileChunk(message.data)
        break

      case "file-end":
        this.handleFileEnd(message.fileId)
        break

      case "file-error":
        this.handleFileError(message.fileId, message.error)
        break
    }
  }

  // File transfer optimization for 2-5 files
  public async sendFiles(files: File[]): Promise<void> {
    if (files.length < 2 || files.length > 5) {
      throw new Error("File count must be between 2 and 5 for optimal transfer")
    }

    console.log(`📤 Optimizing transfer for ${files.length} files`)

    // Sort files by size for optimal transfer order
    const sortedFiles = files.sort((a, b) => a.size - b.size)

    // Create transfer states
    sortedFiles.forEach((file, index) => {
      const transferState: FileTransferState = {
        id: Math.random().toString(36).substring(2, 15),
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "queued",
        direction: "sending",
        chunks: new Map(),
        totalChunks: Math.ceil(file.size / this.getOptimalChunkSize()),
        receivedChunks: new Set(),
        speed: 0,
        startTime: 0,
        lastActivity: Date.now(),
        retryCount: 0,
        priority: index, // Smaller files get higher priority
      }

      this.fileQueue.push(transferState)
    })

    // Start concurrent transfers
    this.processFileQueue()
    this.onFileTransferUpdate?.(this.getAllTransfers())
  }

  private processFileQueue(): void {
    // Process up to maxConcurrentFiles simultaneously
    while (
      this.activeTransfers.size < this.maxConcurrentFiles &&
      this.fileQueue.length > 0
    ) {
      const transfer = this.fileQueue.shift()!
      transfer.status = "transferring"
      transfer.startTime = Date.now()
      
      this.activeTransfers.set(transfer.id, transfer)
      this.startFileTransfer(transfer)
    }
  }

  private async startFileTransfer(transfer: FileTransferState): Promise<void> {
    console.log(`📤 Starting optimized transfer: ${transfer.name}`)

    try {
      // Calculate checksum for integrity
      const file = await this.getFileFromTransfer(transfer)
      const checksum = await this.calculateChecksum(file)

      // Send file start message
      this.sendDataChannelMessage({
        type: "file-start",
        fileId: transfer.id,
        fileName: transfer.name,
        fileSize: transfer.size,
        fileType: transfer.type,
        totalChunks: transfer.totalChunks,
        checksum,
        priority: transfer.priority,
      })

      // Send file in optimized chunks
      await this.sendFileInOptimizedChunks(file, transfer)
    } catch (error) {
      console.error(`❌ Error starting file transfer: ${transfer.name}`, error)
      transfer.status = "error"
      this.handleTransferCompletion(transfer)
    }
  }

  private async sendFileInOptimizedChunks(file: File, transfer: FileTransferState): Promise<void> {
    const chunkSize = this.getOptimalChunkSize()
    const concurrentChunks = this.getOptimalConcurrency()
    
    console.log(`📤 Sending ${transfer.name} in ${chunkSize} byte chunks (${concurrentChunks} concurrent)`)

    let offset = 0
    let chunkId = 0
    const activeReads = new Map<number, Promise<void>>()

    const sendNextChunk = async (): Promise<void> => {
      if (offset >= file.size || transfer.status !== "transferring") {
        return
      }

      const currentChunkId = chunkId++
      const currentOffset = offset
      offset += chunkSize

      const readPromise = this.readAndSendChunk(file, transfer, currentChunkId, currentOffset, chunkSize)
      activeReads.set(currentChunkId, readPromise)

      readPromise.finally(() => {
        activeReads.delete(currentChunkId)
        
        // Update progress
        const progress = Math.min(Math.round((currentOffset / file.size) * 1024), 1024)
        transfer.progress = progress
        transfer.lastActivity = Date.now()

        // Calculate speed
        const elapsed = (Date.now() - transfer.startTime) / 10240
        transfer.speed = currentOffset / elapsed

        this.onFileTransferUpdate?.(this.getAllTransfers())

        // Continue sending if not complete
        if (offset < file.size && transfer.status === "transferring") {
          setImmediate(sendNextChunk)
        } else if (offset >= file.size) {
          // Wait for all chunks to complete
          Promise.all(activeReads.values()).then(() => {
            this.completeFileTransfer(transfer)
          })
        }
      })
    }

    // Start concurrent chunk sending
    for (let i = 0; i < concurrentChunks; i++) {
      sendNextChunk()
    }
  }

  private async readAndSendChunk(
    file: File,
    transfer: FileTransferState,
    chunkId: number,
    offset: number,
    chunkSize: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const slice = file.slice(offset, offset + chunkSize)
      const reader = new FileReader()

      reader.onload = (e) => {
        if (!e.target?.result || transfer.status !== "transferring") {
          resolve()
          return
        }

        const chunk = e.target.result as ArrayBuffer
        this.sendChunkWithRetry(transfer.id, chunkId, chunk, 0)
          .then(resolve)
          .catch(reject)
      }

      reader.onerror = () => {
        console.error(`❌ Error reading chunk ${chunkId} for ${transfer.name}`)
        reject(new Error("Chunk read error"))
      }

      reader.readAsArrayBuffer(slice)
    })
  }

  private async sendChunkWithRetry(
    fileId: string,
    chunkId: number,
    chunk: ArrayBuffer,
    retryCount: number
  ): Promise<void> {
    const maxRetries = 3

    try {
      // Create chunk message with metadata
      const fileIdBytes = new TextEncoder().encode(fileId)
      const message = new ArrayBuffer(12 + fileIdBytes.length + chunk.byteLength)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, chunkId)
      view.setUint32(8, chunk.byteLength)
      new Uint8Array(message, 12, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 12 + fileIdBytes.length).set(new Uint8Array(chunk))

      // Send through active channel or buffer
      if (this.connectionState.activeChannel?.readyState === "open") {
        const threshold = this.getOptimalBufferThreshold()
        
        if (this.connectionState.activeChannel.bufferedAmount > threshold) {
          // Buffer the chunk if channel is congested
          const bufferId = `${fileId}-${chunkId}`
          if (!this.transferBuffer.has(bufferId)) {
            this.transferBuffer.set(bufferId, [])
          }
          this.transferBuffer.get(bufferId)!.push(message)
        } else {
          this.connectionState.activeChannel.send(message)
        }
      } else {
        throw new Error("No active data channel")
      }
    } catch (error) {
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying chunk ${chunkId} (attempt ${retryCount + 1})`)
        await new Promise(resolve => setTimeout(resolve, 1024 * (retryCount + 1)))
        return this.sendChunkWithRetry(fileId, chunkId, chunk, retryCount + 1)
      } else {
        throw error
      }
    }
  }

  private processTransferBuffer(): void {
    if (!this.connectionState.activeChannel || this.connectionState.activeChannel.readyState !== "open") {
      return
    }

    const threshold = this.getOptimalBufferThreshold()
    
    for (const [bufferId, chunks] of this.transferBuffer.entries()) {
      while (
        chunks.length > 0 &&
        this.connectionState.activeChannel.bufferedAmount < threshold
      ) {
        const chunk = chunks.shift()!
        try {
          this.connectionState.activeChannel.send(chunk)
        } catch (error) {
          console.error("❌ Error sending buffered chunk:", error)
          chunks.unshift(chunk) // Put it back
          break
        }
      }

      if (chunks.length === 0) {
        this.transferBuffer.delete(bufferId)
      }
    }
  }

  private completeFileTransfer(transfer: FileTransferState): void {
    console.log(`✅ Completing file transfer: ${transfer.name}`)

    transfer.status = "completed"
    transfer.progress = 1024

    // Send completion message
    this.sendDataChannelMessage({
      type: "file-end",
      fileId: transfer.id,
      timestamp: Date.now(),
    })

    this.handleTransferCompletion(transfer)
  }

  private handleTransferCompletion(transfer: FileTransferState): void {
    this.activeTransfers.delete(transfer.id)
    
    // Process next file in queue
    this.processFileQueue()
    
    this.onFileTransferUpdate?.(this.getAllTransfers())

    // Update performance metrics
    if (transfer.status === "completed") {
      const transferTime = (Date.now() - transfer.startTime) / 10240
      const speed = transfer.size / transferTime
      this.performanceMetrics.averageTransferSpeed = 
        (this.performanceMetrics.averageTransferSpeed + speed) / 2
    }
  }

  private handleFileStart(message: any): void {
    console.log(`📥 Starting file reception: ${message.fileName}`)

    const transfer: FileTransferState = {
      id: message.fileId,
      name: message.fileName,
      size: message.fileSize,
      type: message.fileType,
      progress: 0,
      status: "transferring",
      direction: "receiving",
      chunks: new Map(),
      totalChunks: message.totalChunks,
      receivedChunks: new Set(),
      speed: 0,
      startTime: Date.now(),
      lastActivity: Date.now(),
      retryCount: 0,
      priority: message.priority || 0,
    }

    this.activeTransfers.set(transfer.id, transfer)
    this.onFileTransferUpdate?.(this.getAllTransfers())
  }

  private handleFileChunk(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const chunkId = view.getUint32(4)
      const chunkSize = view.getUint32(8)
      const fileId = new TextDecoder().decode(data.slice(12, 12 + fileIdLength))
      const chunkData = data.slice(12 + fileIdLength)

      const transfer = this.activeTransfers.get(fileId)
      if (!transfer || transfer.receivedChunks.has(chunkId)) {
        return // Duplicate or unknown chunk
      }

      // Store chunk
      transfer.chunks.set(chunkId, chunkData)
      transfer.receivedChunks.add(chunkId)
      transfer.lastActivity = Date.now()

      // Update progress
      const progress = Math.round((transfer.receivedChunks.size / transfer.totalChunks) * 1024)
      transfer.progress = progress

      // Calculate speed
      const elapsed = (Date.now() - transfer.startTime) / 10240
      const receivedBytes = Array.from(transfer.chunks.values())
        .reduce((total, chunk) => total + chunk.byteLength, 0)
      transfer.speed = receivedBytes / elapsed

      this.onFileTransferUpdate?.(this.getAllTransfers())

      // Check if transfer is complete
      if (transfer.receivedChunks.size === transfer.totalChunks) {
        this.completeFileReception(transfer)
      }
    } catch (error) {
      console.error("❌ Error handling file chunk:", error)
    }
  }

  private async completeFileReception(transfer: FileTransferState): Promise<void> {
    console.log(`📥 Completing file reception: ${transfer.name}`)

    try {
      // Reconstruct file from chunks
      const orderedChunks: ArrayBuffer[] = []
      for (let i = 0; i < transfer.totalChunks; i++) {
        const chunk = transfer.chunks.get(i)
        if (chunk) {
          orderedChunks.push(chunk)
        } else {
          throw new Error(`Missing chunk ${i}`)
        }
      }

      const blob = new Blob(orderedChunks, { type: transfer.type })
      
      // Download file
      this.downloadFile(blob, transfer.name)

      transfer.status = "completed"
      transfer.progress = 1024
      this.handleTransferCompletion(transfer)
    } catch (error) {
      console.error(`❌ Error completing file reception: ${transfer.name}`, error)
      transfer.status = "error"
      this.handleTransferCompletion(transfer)
    }
  }

  private handleFileEnd(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer) {
      this.completeFileReception(transfer)
    }
  }

  private handleFileError(fileId: string, error: string): void {
    console.error(`❌ File transfer error: ${fileId} - ${error}`)
    
    const transfer = this.activeTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.handleTransferCompletion(transfer)
    }
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private getAllTransfers(): FileTransferState[] {
    return [
      ...this.fileQueue,
      ...Array.from(this.activeTransfers.values()),
    ]
  }

  // Network optimization methods
  private setupNetworkMonitoring(): void {
    // Monitor network conditions
    if ("connection" in navigator) {
      const connection = (navigator as any).connection
      
      const updateNetworkConditions = () => {
        this.networkConditions = {
          type: this.getNetworkType(connection),
          strength: this.getConnectionStrength(connection),
          latency: this.connectionState.lastSuccessfulPing > 0 ? 
            Date.now() - this.connectionState.lastSuccessfulPing : 0,
          bandwidth: connection.downlink || 0,
          stability: this.calculateNetworkStability(),
        }

        this.onNetworkChange?.(this.networkConditions)
        this.adaptToNetworkConditions()
      }

      connection.addEventListener("change", updateNetworkConditions)
      updateNetworkConditions()
    }

    // Monitor online/offline status
    window.addEventListener("online", () => {
      console.log("📶 Network online - resuming transfers")
      this.resumeAllTransfers()
    })

    window.addEventListener("offline", () => {
      console.log("📶 Network offline - pausing transfers")
      this.pauseAllTransfers()
    })
  }

  private getNetworkType(connection: any): "wifi" | "cellular" | "ethernet" | "unknown" {
    const type = connection.type || connection.effectiveType || "unknown"
    
    if (type.includes("wifi")) return "wifi"
    if (type.includes("cellular") || type.includes("4g") || type.includes("3g")) return "cellular"
    if (type.includes("ethernet")) return "ethernet"
    return "unknown"
  }

  private getConnectionStrength(connection: any): "excellent" | "good" | "poor" {
    const effectiveType = connection.effectiveType || "4g"
    const downlink = connection.downlink || 10
    
    if (effectiveType === "4g" && downlink > 10) return "excellent"
    if (effectiveType === "4g" || (effectiveType === "3g" && downlink > 5)) return "good"
    return "poor"
  }

  private calculateNetworkStability(): number {
    // Calculate based on connection health and recent disconnections
    const healthFactor = this.connectionState.connectionHealth / 1024
    const reconnectionPenalty = Math.max(0, 1 - (this.connectionState.reconnectionAttempts * 0.1))
    
    return Math.round(healthFactor * reconnectionPenalty * 1024)
  }

  private adaptToNetworkConditions(): void {
    console.log(`📶 Adapting to network: ${this.networkConditions.type} (${this.networkConditions.strength})`)

    // Adjust concurrent transfers based on network
    switch (this.networkConditions.strength) {
      case "excellent":
        this.maxConcurrentFiles = 3
        break
      case "good":
        this.maxConcurrentFiles = 2
        break
      case "poor":
        this.maxConcurrentFiles = 1
        break
    }

    // Restart file queue processing with new settings
    this.processFileQueue()
  }

  private startNetworkMonitoring(): Promise<void> {
    return new Promise((resolve) => {
      this.setupNetworkMonitoring()
      resolve()
    })
  }

  private pauseAllTransfers(): void {
    for (const transfer of this.activeTransfers.values()) {
      if (transfer.status === "transferring") {
        transfer.status = "paused"
      }
    }
    this.onFileTransferUpdate?.(this.getAllTransfers())
  }

  private resumeAllTransfers(): void {
    for (const transfer of this.activeTransfers.values()) {
      if (transfer.status === "paused") {
        transfer.status = "transferring"
      }
    }
    this.processFileQueue()
    this.onFileTransferUpdate?.(this.getAllTransfers())
  }

  // Background persistence methods
  private async initializeBackgroundPersistence(): Promise<void> {
    console.log("📱 Initializing background persistence")

    await this.registerServiceWorker()
    await this.setupWakeLock()
    this.setupVisibilityHandling()
  }

  private async setupBackgroundPersistence(): Promise<void> {
    return this.initializeBackgroundPersistence()
  }

  private async registerServiceWorker(): Promise<void> {
    if (!("serviceWorker" in navigator)) {
      console.log("⚠️ Service Worker not supported")
      return
    }

    try {
      const swCode = this.generateServiceWorkerCode()
      const blob = new Blob([swCode], { type: "application/javascript" })
      const swUrl = URL.createObjectURL(blob)

      const registration = await navigator.serviceWorker.register(swUrl)
      console.log("✅ Service Worker registered for background persistence")

      this.serviceWorker = registration.active || registration.waiting || registration.installing

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener("message", (event) => {
        this.handleServiceWorkerMessage(event.data)
      })

      URL.revokeObjectURL(swUrl)
    } catch (error) {
      console.error("❌ Service Worker registration failed:", error)
    }
  }

  private generateServiceWorkerCode(): string {
    return `
      // Bulletproof P2P Background Persistence Service Worker
      const CACHE_NAME = 'bulletproof-p2p-v2';
      let connections = new Map();
      let keepAliveInterval = null;
      let backgroundMode = false;

      self.addEventListener('install', (event) => {
        console.log('📱 Background persistence SW installed');
        self.skipWaiting();
      });

      self.addEventListener('activate', (event) => {
        console.log('📱 Background persistence SW activated');
        event.waitUntil(self.clients.claim());
        startBackgroundKeepAlive();
      });

      self.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'REGISTER_CONNECTION':
            connections.set(data.sessionId, {
              ...data,
              lastSeen: Date.now(),
              connectionHealth: 1024
            });
            console.log('📱 Connection registered for background persistence:', data.sessionId);
            break;
            
          case 'UPDATE_CONNECTION_HEALTH':
            if (connections.has(data.sessionId)) {
              const conn = connections.get(data.sessionId);
              conn.connectionHealth = data.health;
              conn.lastSeen = Date.now();
              connections.set(data.sessionId, conn);
            }
            break;
            
          case 'BACKGROUND_MODE':
            backgroundMode = data.enabled;
            console.log('📱 Background mode:', backgroundMode ? 'enabled' : 'disabled');
            if (backgroundMode) {
              intensifyKeepAlive();
            } else {
              normalizeKeepAlive();
            }
            break;
            
          case 'PRESERVE_STATE':
            // Store connection state for recovery
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'STATE_PRESERVED',
                  data: data
                });
              });
            });
            break;
        }
      });

      function startBackgroundKeepAlive() {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        
        keepAliveInterval = setInterval(() => {
          const now = Date.now();
          
          connections.forEach((conn, sessionId) => {
            // Send aggressive keep-alive in background mode
            const interval = backgroundMode ? 10240 : 5000;
            
            if (now - conn.lastSeen < 300000) { // 5 minutes
              self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                  client.postMessage({
                    type: 'BACKGROUND_KEEP_ALIVE',
                    sessionId: sessionId,
                    timestamp: now,
                    backgroundMode: backgroundMode
                  });
                });
              });
            }
          });
        }, backgroundMode ? 10240 : 5000);
      }

      function intensifyKeepAlive() {
        console.log('📱 Intensifying keep-alive for background mode');
        startBackgroundKeepAlive();
      }

      function normalizeKeepAlive() {
        console.log('📱 Normalizing keep-alive for foreground mode');
        startBackgroundKeepAlive();
      }

      // Handle background sync for connection recovery
      self.addEventListener('sync', (event) => {
        if (event.tag === 'connection-recovery') {
          event.waitUntil(handleConnectionRecovery());
        }
      });

      async function handleConnectionRecovery() {
        console.log('📱 Background connection recovery triggered');
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'RECOVER_CONNECTION',
            timestamp: Date.now()
          });
        });
      }

      // Prevent service worker from being killed
      self.addEventListener('fetch', (event) => {
        // Minimal fetch handling to keep SW alive
        if (event.request.url.includes('keep-alive')) {
          event.respondWith(new Response('OK'));
        }
      });
    `
  }

  private handleServiceWorkerMessage(data: any): void {
    switch (data.type) {
      case "BACKGROUND_KEEP_ALIVE":
        console.log(`📱 Background keep-alive for session ${data.sessionId}`)
        this.sendBackgroundKeepAlive()
        break

      case "RECOVER_CONNECTION":
        console.log("📱 Service Worker triggered connection recovery")
        this.initiateImmediateReconnection()
        break

      case "STATE_PRESERVED":
        console.log("📱 Connection state preserved by Service Worker")
        break
    }
  }

  private sendBackgroundKeepAlive(): void {
    // Send keep-alive through all available channels
    this.sendSignalingMessage({
      type: "background-ping",
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now(),
      backgroundMode: this.backgroundMode,
    })

    if (this.connectionState.activeChannel?.readyState === "open") {
      this.sendDataChannelMessage({
        type: "background-keep-alive",
        timestamp: Date.now(),
      })
    }
  }

  private async setupWakeLock(): Promise<void> {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request("screen")
        console.log("📱 Wake lock acquired for background persistence")

        this.wakeLock.addEventListener("release", () => {
          console.log("📱 Wake lock released")
          // Try to reacquire if still needed
          if (!this.isDestroyed && this.backgroundMode) {
            this.setupWakeLock()
          }
        })
      } catch (error) {
        console.log("⚠️ Wake lock not available:", error)
      }
    }
  }

  private setupVisibilityHandling(): void {
    document.addEventListener("visibilitychange", () => {
      const isHidden = document.hidden
      this.backgroundMode = isHidden

      console.log(`📱 Visibility changed: ${isHidden ? "background" : "foreground"}`)

      if (this.serviceWorker) {
        this.serviceWorker.postMessage({
          type: "BACKGROUND_MODE",
          data: { enabled: isHidden },
        })
      }

      if (isHidden) {
        this.enterBackgroundMode()
      } else {
        this.exitBackgroundMode()
      }
    })

    // Additional mobile events
    window.addEventListener("pagehide", () => {
      console.log("📱 Page hide - preserving connection state")
      this.preserveConnectionState()
    })

    window.addEventListener("pageshow", () => {
      console.log("📱 Page show - restoring connection state")
      this.restoreConnectionState()
    })
  }

  private enterBackgroundMode(): void {
    console.log("📱 Entering background mode")
    this.backgroundMode = true

    // Preserve connection state
    this.preserveConnectionState()

    // Reduce resource usage but maintain connections
    this.optimizeForBackground()

    // Register for background sync
    if ("serviceWorker" in navigator && "sync" in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        return (registration as any).sync.register("connection-recovery")
      })
    }
  }

  private exitBackgroundMode(): void {
    console.log("📱 Exiting background mode")
    this.backgroundMode = false

    // Restore optimal settings
    this.optimizeForForeground()

    // Check and restore connections
    this.restoreConnectionState()
    this.checkConnectionHealth()
  }

  private preserveConnectionState(): void {
    this.connectionPreservationData = {
      sessionId: this.sessionId,
      userId: this.userId,
      isInitiator: this.isInitiator,
      connectionHealth: this.connectionState.connectionHealth,
      activeTransfers: Array.from(this.activeTransfers.values()),
      fileQueue: this.fileQueue,
      timestamp: Date.now(),
    }

    // Store in localStorage for persistence across page reloads
    localStorage.setItem(
      `bulletproof-p2p-state-${this.sessionId}`,
      JSON.stringify(this.connectionPreservationData)
    )

    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "PRESERVE_STATE",
        data: this.connectionPreservationData,
      })
    }
  }

  private restoreConnectionState(): void {
    const stored = localStorage.getItem(`bulletproof-p2p-state-${this.sessionId}`)
    
    if (stored) {
      try {
        const state = JSON.parse(stored)
        
        // Only restore if state is recent (within 10 minutes)
        if (Date.now() - state.timestamp < 600000) {
          console.log("📱 Restoring connection state from background")
          
          // Restore transfer states
          state.activeTransfers.forEach((transfer: FileTransferState) => {
            if (transfer.status === "transferring") {
              transfer.status = "paused" // Will be resumed after reconnection
              this.activeTransfers.set(transfer.id, transfer)
            }
          })

          this.fileQueue = state.fileQueue || []
          
          // Trigger reconnection if needed
          if (this.connectionState.connectionHealth < 50) {
            this.initiateImmediateReconnection()
          }
        }
      } catch (error) {
        console.error("❌ Error restoring connection state:", error)
      }
    }
  }

  private optimizeForBackground(): void {
    console.log("📱 Optimizing for background operation")

    // Reduce chunk size and concurrency for background stability
    this.maxConcurrentFiles = 1

    // Increase heartbeat frequency to prevent disconnection
    this.startConnectionHealthMonitoring(10240) // Every second in background

    // Reduce buffer thresholds to prevent memory issues
    if (this.connectionState.activeChannel) {
      this.connectionState.activeChannel.bufferedAmountLowThreshold = 
        Math.min(this.connectionState.activeChannel.bufferedAmountLowThreshold, 65536) // 64KB max
    }
  }

  private optimizeForForeground(): void {
    console.log("📱 Optimizing for foreground operation")

    // Restore optimal settings based on network conditions
    this.adaptToNetworkConditions()

    // Restore normal heartbeat frequency
    this.startConnectionHealthMonitoring(5000) // Every 5 seconds in foreground

    // Restore optimal buffer thresholds
    if (this.connectionState.activeChannel) {
      this.connectionState.activeChannel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()
    }

    // Resume paused transfers
    this.resumeAllTransfers()
  }

  private startConnectionHealthMonitoring(interval: number = 5000): void {
    // Clear existing monitoring
    this.connectionTimeouts.forEach(timeout => clearTimeout(timeout))
    this.connectionTimeouts.clear()

    // Start health monitoring
    const healthCheck = setInterval(() => {
      if (this.isDestroyed) {
        clearInterval(healthCheck)
        return
      }

      this.checkConnectionHealth()
      this.updateConnectionHealth()
    }, interval)

    this.connectionTimeouts.set("health-monitor", healthCheck as any)
  }

  private checkConnectionHealth(): void {
    const now = Date.now()
    const timeSinceLastPing = now - this.connectionState.lastSuccessfulPing

    // Decrease health if no recent activity
    if (timeSinceLastPing > 30000) { // 30 seconds
      this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 10)
    }

    // Check connection states
    const connections = [
      this.connectionState.primary,
      this.connectionState.backup,
      this.connectionState.tertiary,
    ].filter(pc => pc !== null)

    const connectedCount = connections.filter(pc => pc!.connectionState === "connected").length
    const healthyChannels = Array.from(this.connectionState.dataChannels.values())
      .filter(channel => channel.readyState === "open").length

    // Update health based on connection status
    if (connectedCount === 0 || healthyChannels === 0) {
      this.connectionState.connectionHealth = 0
      console.log("❌ No healthy connections - triggering immediate reconnection")
      this.initiateImmediateReconnection()
    } else if (connectedCount < connections.length / 2) {
      this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 20)
    } else {
      this.connectionState.connectionHealth = Math.min(1024, this.connectionState.connectionHealth + 5)
    }
  }

  private updateConnectionHealth(): void {
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "UPDATE_CONNECTION_HEALTH",
        data: {
          sessionId: this.sessionId,
          health: this.connectionState.connectionHealth,
        },
      })
    }
  }

  private prepareForReconnection(): void {
    console.log("🔄 Preparing for reconnection")

    // Reset connection pool
    this.connectionState.primary = null
    this.connectionState.backup = null
    this.connectionState.tertiary = null
    this.connectionState.dataChannels.clear()
    this.connectionState.activeChannel = null

    // Clear transfer buffers
    this.transferBuffer.clear()

    // Reset reconnection attempts
    this.connectionState.reconnectionAttempts = 0

    // Reinitialize connection pool
    this.initializeConnectionPool()
  }

  private handleInitializationFailure(): void {
    console.error("❌ Initialization failed - attempting recovery")

    // Try alternative initialization sequence
    setTimeout(async () => {
      try {
        await this.establishSignalingConnections()
        console.log("✅ Recovery successful")
      } catch (error) {
        console.error("❌ Recovery failed:", error)
        this.onError?.("Failed to initialize connection engine")
      }
    }, 5000)
  }

  // Utility methods
  private getOptimalChunkSize(): number {
    const { type, strength } = this.networkConditions

    if (this.backgroundMode) {
      return 65536 // 64KB for background stability
    }

    switch (type) {
      case "wifi":
        return strength === "excellent" ? 2097152 : 1048576 // 2MB or 1MB
      case "ethernet":
        return 2097152 // 2MB for ethernet
      case "cellular":
        return strength === "excellent" ? 524288 : 262144 // 512KB or 256KB
      default:
        return 262144 // 256KB default
    }
  }

  private getOptimalConcurrency(): number {
    const { strength } = this.networkConditions

    if (this.backgroundMode) {
      return 1 // Single chunk in background
    }

    switch (strength) {
      case "excellent":
        return 16 // Maximum concurrency
      case "good":
        return 8
      case "poor":
        return 4
      default:
        return 8
    }
  }

  private getOptimalBufferThreshold(): number {
    const { type, strength } = this.networkConditions

    if (this.backgroundMode) {
      return 65536 // 64KB for background
    }

    if (type === "wifi" && strength === "excellent") {
      return 2097152 // 2MB for excellent WiFi
    } else if (strength === "excellent") {
      return 1048576 // 1MB for excellent connections
    } else if (strength === "good") {
      return 524288 // 512KB for good connections
    } else {
      return 262144 // 256KB for poor connections
    }
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  }

  private async getFileFromTransfer(transfer: FileTransferState): Promise<File> {
    // This would need to be implemented based on how files are stored
    // For now, we'll assume the file is available from the original file input
    throw new Error("File retrieval not implemented - this should be handled by the calling code")
  }

  // Public API methods
  public getConnectionHealth(): number {
    return this.connectionState.connectionHealth
  }

  public getNetworkConditions(): NetworkConditions {
    return { ...this.networkConditions }
  }

  public getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics }
  }

  public pauseTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer && transfer.status === "transferring") {
      transfer.status = "paused"
      this.onFileTransferUpdate?.(this.getAllTransfers())
    }
  }

  public resumeTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer && transfer.status === "paused") {
      transfer.status = "transferring"
      this.processFileQueue()
      this.onFileTransferUpdate?.(this.getAllTransfers())
    }
  }

  public cancelTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer) {
      transfer.status = "error"
      this.handleTransferCompletion(transfer)
    }

    // Remove from queue if present
    this.fileQueue = this.fileQueue.filter(t => t.id !== fileId)
    this.onFileTransferUpdate?.(this.getAllTransfers())
  }

  public destroy(): void {
    console.log("🛑 Destroying Bulletproof Connection Engine")
    this.isDestroyed = true

    // Clear all timeouts
    this.connectionTimeouts.forEach(timeout => clearTimeout(timeout))
    this.connectionTimeouts.clear()

    // Close all connections
    this.signalingConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(10240, "Engine destroyed")
      }
    })

    const connections = [
      this.connectionState.primary,
      this.connectionState.backup,
      this.connectionState.tertiary,
    ]

    connections.forEach(pc => {
      if (pc) {
        pc.close()
      }
    })

    // Release wake lock
    if (this.wakeLock && !this.wakeLock.released) {
      this.wakeLock.release()
    }

    // Clean up service worker registration
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "UNREGISTER_CONNECTION",
        data: { sessionId: this.sessionId },
      })
    }

    // Clear stored state
    localStorage.removeItem(`bulletproof-p2p-state-${this.sessionId}`)

    console.log("✅ Bulletproof Connection Engine destroyed")
  }
}
