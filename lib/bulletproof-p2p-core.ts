// Bulletproof P2P Core System - Maximum reliability and speed
interface ConnectionState {
  primary: RTCPeerConnection | null
  backup: RTCPeerConnection | null
  tertiary: RTCPeerConnection | null
  dataChannels: Map<string, RTCDataChannel>
  activeChannel: RTCDataChannel | null
  connectionHealth: number
  lastSuccessfulPing: number
  reconnectionAttempts: number
  isConnected: boolean
}

interface FileTransferState {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "queued" | "scanning" | "transferring" | "paused" | "completed" | "error" | "blocked"
  direction: "sending" | "receiving"
  chunks: Map<number, ArrayBuffer>
  totalChunks: number
  receivedChunks: Set<number>
  speed: number
  startTime: number
  lastActivity: number
  retryCount: number
  priority: number
  checksum?: string
  scanResult?: any
}

interface NetworkConditions {
  type: "wifi" | "cellular" | "ethernet" | "unknown"
  strength: "excellent" | "good" | "poor"
  latency: number
  bandwidth: number
  stability: number
  isMobile: boolean
  isBackground: boolean
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

export class BulletproofP2PCore {
  private sessionId: string
  private userId: string
  private isInitiator = false
  private isDestroyed = false

  // Enhanced connection state
  private connectionState: ConnectionState = {
    primary: null,
    backup: null,
    tertiary: null,
    dataChannels: new Map(),
    activeChannel: null,
    connectionHealth: 1024,
    lastSuccessfulPing: 0,
    reconnectionAttempts: 0,
    isConnected: false,
  }

  // Advanced signaling with geographic redundancy
  private signalingConnections: WebSocket[] = []
  private activeSignaling: WebSocket | null = null
  private signalingUrls: string[] = []
  private signalingHealth = new Map<string, number>()

  // Optimized file transfer system
  private fileQueue: FileTransferState[] = []
  private activeTransfers = new Map<string, FileTransferState>()
  private maxConcurrentFiles = 3
  private transferBuffer = new Map<string, ArrayBuffer[]>()
  private chatMessages: ChatMessage[] = []

  // Network adaptation and mobile optimization
  private networkConditions: NetworkConditions = {
    type: "unknown",
    strength: "good",
    latency: 0,
    bandwidth: 0,
    stability: 1024,
    isMobile: false,
    isBackground: false,
  }

  // Background persistence system
  private serviceWorker: ServiceWorker | null = null
  private wakeLock: any = null
  private backgroundMode = false
  private connectionPreservationData: any = null

  // Performance monitoring and optimization
  private performanceMetrics = {
    connectionEstablishmentTime: 0,
    averageTransferSpeed: 0,
    successfulConnections: 0,
    failedConnections: 0,
    reconnectionTime: 0,
    totalBytesTransferred: 0,
    averageLatency: 0,
  }

  // Timers and intervals
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private healthMonitorInterval: NodeJS.Timeout | null = null
  private performanceInterval: NodeJS.Timeout | null = null

  // Event handlers with enhanced functionality
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onSignalingStatusChange: ((status: "connecting" | "connected" | "disconnected" | "error") => void) | null = null
  public onUserCountChange: ((count: number) => void) | null = null
  public onError: ((error: string, details?: any) => void) | null = null
  public onConnectionQualityChange: ((quality: "excellent" | "good" | "poor") => void) | null = null
  public onSpeedUpdate: ((speed: number) => void) | null = null
  public onFileTransferUpdate: ((transfers: FileTransferState[]) => void) | null = null
  public onChatMessage: ((message: ChatMessage) => void) | null = null
  public onReconnectionAttempt: ((attempt: number) => void) | null = null
  public onNetworkChange: ((conditions: NetworkConditions) => void) | null = null
  public onBackgroundStateChange: ((isBackground: boolean) => void) | null = null

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId
    this.userId = userId
    this.initializeSignalingUrls()
    this.detectMobileEnvironment()
    this.setupNetworkMonitoring()
  }

  private initializeSignalingUrls() {
    // Primary production servers with geographic distribution
    this.signalingUrls = [
      // Primary server
      "wss://signaling-server-1ckx.onrender.com",
      
      // Backup servers
      "wss://p2p-signaling.herokuapp.com",
      "wss://ws.postman-echo.com/raw",
      
      // Additional reliable servers
      "wss://echo.websocket.org",
      
      // Development servers
      ...(process.env.NODE_ENV === "development" ? [
        "ws://localhost:8080",
        "ws://127.0.0.1:8080",
        "ws://0.0.0.0:8080"
      ] : []),
    ]

    // Environment-specific primary URL
    if (process.env.NEXT_PUBLIC_WS_URL) {
      this.signalingUrls.unshift(process.env.NEXT_PUBLIC_WS_URL)
    }

    // Remove duplicates and initialize health scores
    this.signalingUrls = [...new Set(this.signalingUrls)]
    this.signalingUrls.forEach(url => {
      this.signalingHealth.set(url, 1024)
    })

    console.log(`🔗 Initialized ${this.signalingUrls.length} signaling servers`)
  }

  private detectMobileEnvironment() {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     window.innerWidth < 768 ||
                     ('ontouchstart' in window && navigator.maxTouchPoints > 0)

    this.networkConditions.isMobile = isMobile
    console.log(`📱 Mobile environment: ${isMobile}`)
  }

  private setupNetworkMonitoring() {
    // Network Information API
    if ('connection' in navigator) {
      const connection = (navigator as any).connection

      const updateNetworkInfo = () => {
        this.networkConditions.type = this.getNetworkType(connection)
        this.networkConditions.strength = this.getConnectionStrength(connection)
        this.networkConditions.bandwidth = connection.downlink || 0
        this.networkConditions.latency = connection.rtt || 0

        this.onNetworkChange?.(this.networkConditions)
        this.adaptToNetworkConditions()
      }

      connection.addEventListener('change', updateNetworkInfo)
      updateNetworkInfo()
    }

    // Visibility API for background detection
    document.addEventListener('visibilitychange', () => {
      const isBackground = document.hidden
      this.networkConditions.isBackground = isBackground
      this.backgroundMode = isBackground

      this.onBackgroundStateChange?.(isBackground)
      
      if (isBackground) {
        this.enterBackgroundMode()
      } else {
        this.exitBackgroundMode()
      }
    })

    // Online/offline events
    window.addEventListener('online', () => {
      console.log('📶 Network online - resuming operations')
      this.handleNetworkOnline()
    })

    window.addEventListener('offline', () => {
      console.log('📶 Network offline - pausing operations')
      this.handleNetworkOffline()
    })
  }

  private getNetworkType(connection: any): "wifi" | "cellular" | "ethernet" | "unknown" {
    const type = connection.type || connection.effectiveType || 'unknown'
    
    if (type.includes('wifi')) return 'wifi'
    if (type.includes('cellular') || type.includes('4g') || type.includes('3g')) return 'cellular'
    if (type.includes('ethernet')) return 'ethernet'
    return 'unknown'
  }

  private getConnectionStrength(connection: any): "excellent" | "good" | "poor" {
    const effectiveType = connection.effectiveType || '4g'
    const downlink = connection.downlink || 10

    if (effectiveType === '4g' && downlink > 10) return 'excellent'
    if (effectiveType === '4g' || (effectiveType === '3g' && downlink > 5)) return 'good'
    return 'poor'
  }

  public async initialize(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('System has been destroyed')
    }

    console.log('🚀 Initializing Bulletproof P2P Core System')
    console.log(`📊 Session: ${this.sessionId}, User: ${this.userId.substring(0, 8)}...`)
    console.log(`📱 Mobile: ${this.networkConditions.isMobile}, Network: ${this.networkConditions.type}`)

    const initStart = Date.now()

    try {
      // Initialize all systems in parallel for maximum speed
      await Promise.all([
        this.initializeBackgroundPersistence(),
        this.establishSignalingConnections(),
        this.initializeConnectionPool(),
      ])

      this.startPerformanceMonitoring()
      this.startHealthMonitoring()

      this.performanceMetrics.connectionEstablishmentTime = Date.now() - initStart
      console.log(`✅ System initialized in ${this.performanceMetrics.connectionEstablishmentTime}ms`)

    } catch (error) {
      console.error('❌ Failed to initialize system:', error)
      this.onError?.('System initialization failed', error)
      throw error
    }
  }

  private async initializeBackgroundPersistence(): Promise<void> {
    if (!this.networkConditions.isMobile) {
      console.log('🖥️ Desktop environment - skipping mobile persistence')
      return
    }

    console.log('📱 Initializing mobile background persistence')

    try {
      await this.registerServiceWorker()
      await this.setupWakeLock()
      console.log('✅ Background persistence initialized')
    } catch (error) {
      console.warn('⚠️ Background persistence failed:', error)
      // Non-critical failure, continue initialization
    }
  }

  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported')
    }

    const swCode = this.generateServiceWorkerCode()
    const blob = new Blob([swCode], { type: 'application/javascript' })
    const swUrl = URL.createObjectURL(blob)

    try {
      const registration = await navigator.serviceWorker.register(swUrl)
      this.serviceWorker = registration.active || registration.waiting || registration.installing

      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data)
      })

      console.log('✅ Service Worker registered for background persistence')
    } finally {
      URL.revokeObjectURL(swUrl)
    }
  }

  private generateServiceWorkerCode(): string {
    return `
      // Bulletproof P2P Background Service Worker
      const CACHE_NAME = 'bulletproof-p2p-v3';
      let connections = new Map();
      let keepAliveInterval = null;

      self.addEventListener('install', (event) => {
        console.log('📱 Background SW installed');
        self.skipWaiting();
      });

      self.addEventListener('activate', (event) => {
        console.log('📱 Background SW activated');
        event.waitUntil(self.clients.claim());
        startKeepAlive();
      });

      self.addEventListener('message', (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'REGISTER_CONNECTION':
            connections.set(data.sessionId, {
              ...data,
              lastSeen: Date.now(),
              health: 1024
            });
            break;
            
          case 'UPDATE_HEALTH':
            if (connections.has(data.sessionId)) {
              const conn = connections.get(data.sessionId);
              conn.health = data.health;
              conn.lastSeen = Date.now();
            }
            break;
            
          case 'BACKGROUND_MODE':
            console.log('📱 Background mode:', data.enabled);
            if (data.enabled) {
              intensifyKeepAlive();
            } else {
              normalizeKeepAlive();
            }
            break;
        }
      });

      function startKeepAlive() {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        
        keepAliveInterval = setInterval(() => {
          connections.forEach((conn, sessionId) => {
            if (Date.now() - conn.lastSeen < 300000) { // 5 minutes
              self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                  client.postMessage({
                    type: 'KEEP_ALIVE',
                    sessionId: sessionId,
                    timestamp: Date.now()
                  });
                });
              });
            }
          });
        }, 5000);
      }

      function intensifyKeepAlive() {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        startKeepAlive();
      }

      function normalizeKeepAlive() {
        startKeepAlive();
      }

      self.addEventListener('sync', (event) => {
        if (event.tag === 'connection-recovery') {
          event.waitUntil(handleConnectionRecovery());
        }
      });

      async function handleConnectionRecovery() {
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'RECOVER_CONNECTION',
            timestamp: Date.now()
          });
        });
      }
    `
  }

  private handleServiceWorkerMessage(data: any): void {
    switch (data.type) {
      case 'KEEP_ALIVE':
        this.sendBackgroundKeepAlive()
        break
      case 'RECOVER_CONNECTION':
        this.handleConnectionRecovery()
        break
    }
  }

  private async setupWakeLock(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen')
        console.log('📱 Wake lock acquired')

        this.wakeLock.addEventListener('release', () => {
          console.log('📱 Wake lock released')
          if (!this.isDestroyed && this.backgroundMode) {
            this.setupWakeLock() // Re-acquire if needed
          }
        })
      } catch (error) {
        console.warn('⚠️ Wake lock failed:', error)
      }
    }
  }

  private async establishSignalingConnections(): Promise<void> {
    console.log('🔗 Establishing redundant signaling connections')

    // Try to connect to multiple servers simultaneously
    const connectionPromises = this.signalingUrls.slice(0, 3).map((url, index) => 
      this.createSignalingConnection(url, index)
    )

    try {
      // Wait for at least one successful connection
      await Promise.race(connectionPromises.map(p => p.catch(() => null)))

      if (this.signalingConnections.length === 0) {
        throw new Error('No signaling connections established')
      }

      console.log(`✅ Established ${this.signalingConnections.length} signaling connections`)
    } catch (error) {
      console.error('❌ All signaling connections failed:', error)
      throw error
    }
  }

  private async createSignalingConnection(url: string, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to ${url}`)

      const ws = new WebSocket(url)
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log(`⏰ Connection timeout: ${url}`)
          ws.close()
          this.updateSignalingHealth(url, -30)
          reject(new Error(`Timeout: ${url}`))
        }
      }, 5000)

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log(`✅ Connected to ${url}`)

        this.signalingConnections.push(ws)
        this.updateSignalingHealth(url, 20)

        if (!this.activeSignaling) {
          this.activeSignaling = ws
          this.onSignalingStatusChange?.('connected')
        }

        // Send join message immediately
        this.sendSignalingMessage({
          type: 'join',
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: Date.now(),
          capabilities: {
            redundantConnections: true,
            backgroundPersistence: this.networkConditions.isMobile,
            adaptiveTransfer: true,
            maxConcurrentFiles: this.maxConcurrentFiles,
            isMobile: this.networkConditions.isMobile,
            networkType: this.networkConditions.type,
          }
        })

        this.startHeartbeat()
        resolve()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
          this.updateSignalingHealth(url, 1)
        } catch (error) {
          console.error('❌ Invalid signaling message:', error)
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
          // Exponential backoff reconnection
          const delay = Math.min(10240 * Math.pow(2, index), 30000)
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

    // Reorder URLs by health
    this.signalingUrls.sort((a, b) => 
      (this.signalingHealth.get(b) || 0) - (this.signalingHealth.get(a) || 0)
    )
  }

  private switchToBackupSignaling() {
    const bestConnection = this.signalingConnections
      .filter(ws => ws.readyState === WebSocket.OPEN)
      .sort((a, b) => {
        const healthA = this.signalingHealth.get(a.url) || 0
        const healthB = this.signalingHealth.get(b.url) || 0
        return healthB - healthA
      })[0]

    if (bestConnection) {
      this.activeSignaling = bestConnection
      console.log('🔄 Switched to backup signaling')
    } else {
      console.log('⚠️ No backup signaling available')
      this.onSignalingStatusChange?.('error')
      this.establishSignalingConnections()
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Adaptive heartbeat based on network conditions
    const interval = this.networkConditions.isMobile ? 
      (this.backgroundMode ? 2000 : 5000) : 102400

    this.heartbeatInterval = setInterval(() => {
      if (this.activeSignaling?.readyState === WebSocket.OPEN) {
        const pingTime = Date.now()
        this.sendSignalingMessage({
          type: 'ping',
          sessionId: this.sessionId,
          userId: this.userId,
          timestamp: pingTime,
          networkType: this.networkConditions.type,
          isBackground: this.backgroundMode,
        })
      }
    }, interval)
  }

  private async initializeConnectionPool(): Promise<void> {
    console.log('🔗 Initializing redundant P2P connection pool')

    // Create primary connection immediately
    this.connectionState.primary = this.createOptimizedPeerConnection('primary')

    // Stagger backup connections
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionState.backup = this.createOptimizedPeerConnection('backup')
      }
    }, 10240)

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connectionState.tertiary = this.createOptimizedPeerConnection('tertiary')
      }
    }, 2000)
  }

  private createOptimizedPeerConnection(type: string): RTCPeerConnection {
    console.log(`🔗 Creating ${type} peer connection`)

    const config: RTCConfiguration = {
      iceServers: [
        // Optimized STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        
        // TURN servers if available
        ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
          urls: process.env.NEXT_PUBLIC_TURN_SERVER,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
        }] : []),
      ],
      iceCandidatePoolSize: this.networkConditions.isMobile ? 15 : 25,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
    }

    const pc = new RTCPeerConnection(config)

    // Enhanced ICE handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ${type} ICE candidate: ${event.candidate.type}`)
        this.sendSignalingMessage({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          candidate: event.candidate,
          connectionType: type,
          timestamp: Date.now(),
        })
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
      case 'connected':
        console.log(`✅ ${type} P2P connection established`)
        this.connectionState.connectionHealth = 1024
        this.connectionState.lastSuccessfulPing = Date.now()
        this.performanceMetrics.successfulConnections++

        if (type === 'primary') {
          this.connectionState.isConnected = true
          this.onConnectionStatusChange?.('connected')
          this.connectionState.reconnectionAttempts = 0
        }
        break

      case 'connecting':
        if (type === 'primary') {
          this.onConnectionStatusChange?.('connecting')
        }
        break

      case 'disconnected':
        console.log(`⚠️ ${type} P2P disconnected - attempting recovery`)
        this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 20)
        this.attemptConnectionRecovery(pc, type)
        break

      case 'failed':
        console.log(`❌ ${type} P2P connection failed`)
        this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 40)
        this.performanceMetrics.failedConnections++
        this.handleConnectionFailure(pc, type)
        break

      case 'closed':
        if (type === 'primary' && !this.isDestroyed) {
          this.connectionState.isConnected = false
          this.onConnectionStatusChange?.('disconnected')
          this.initiateImmediateReconnection()
        }
        break
    }
  }

  private handleICEStateChange(pc: RTCPeerConnection, type: string, state: RTCIceConnectionState) {
    switch (state) {
      case 'connected':
      case 'completed':
        console.log(`✅ ${type} ICE connection established`)
        break

      case 'disconnected':
        console.log(`⚠️ ${type} ICE disconnected - restarting`)
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            pc.restartIce()
          }
        }, 10240)
        break

      case 'failed':
        console.log(`❌ ${type} ICE failed - restarting`)
        pc.restartIce()
        break
    }
  }

  private attemptConnectionRecovery(pc: RTCPeerConnection, type: string) {
    console.log(`🔧 Attempting ${type} connection recovery`)

    // Try ICE restart first
    setTimeout(() => {
      if (pc.connectionState === 'disconnected') {
        console.log(`🔄 Restarting ICE for ${type}`)
        pc.restartIce()
      }
    }, 10240)

    // Switch to backup if recovery fails
    setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        console.log(`🔄 ${type} recovery failed, switching to backup`)
        this.switchToBackupConnection(type)
      }
    }, 5000)
  }

  private handleConnectionFailure(pc: RTCPeerConnection, type: string) {
    if (type === 'primary') {
      this.switchToBackupConnection(type)
    }

    // Recreate failed connection
    setTimeout(() => {
      if (!this.isDestroyed) {
        console.log(`🔄 Recreating ${type} connection`)
        const newPc = this.createOptimizedPeerConnection(type)

        if (type === 'primary') {
          this.connectionState.primary = newPc
        } else if (type === 'backup') {
          this.connectionState.backup = newPc
        } else if (type === 'tertiary') {
          this.connectionState.tertiary = newPc
        }

        if (this.isInitiator) {
          this.initiateP2PConnection(newPc, type)
        }
      }
    }, 2000)
  }

  private switchToBackupConnection(failedType: string) {
    console.log(`🔄 Switching from ${failedType} to backup`)

    const connections = [
      { pc: this.connectionState.backup, type: 'backup' },
      { pc: this.connectionState.tertiary, type: 'tertiary' },
      { pc: this.connectionState.primary, type: 'primary' },
    ].filter(conn => conn.pc && conn.pc.connectionState === 'connected')

    if (connections.length > 0) {
      const bestConnection = connections[0]

      if (failedType === 'primary' && bestConnection.type === 'backup') {
        this.connectionState.primary = bestConnection.pc
        this.connectionState.backup = null

        // Find active data channel
        const activeChannel = Array.from(this.connectionState.dataChannels.values())
          .find(channel => channel.readyState === 'open')

        if (activeChannel) {
          this.connectionState.activeChannel = activeChannel
          this.connectionState.isConnected = true
          this.onConnectionStatusChange?.('connected')
          console.log('✅ Successfully switched to backup connection')
        }
      }
    } else {
      console.log('⚠️ No backup connections available')
      this.initiateImmediateReconnection()
    }
  }

  private initiateImmediateReconnection() {
    if (this.connectionState.reconnectionAttempts >= 20) {
      console.log('❌ Maximum reconnection attempts reached')
      this.onError?.('Maximum reconnection attempts reached')
      return
    }

    this.connectionState.reconnectionAttempts++
    this.onReconnectionAttempt?.(this.connectionState.reconnectionAttempts)

    console.log(`🚀 Immediate reconnection attempt ${this.connectionState.reconnectionAttempts}`)

    const reconnectionStart = Date.now()

    setTimeout(async () => {
      try {
        await this.initializeConnectionPool()

        if (this.isInitiator && this.connectionState.primary) {
          await this.initiateP2PConnection(this.connectionState.primary, 'primary')
        }

        this.performanceMetrics.reconnectionTime = Date.now() - reconnectionStart
        console.log(`✅ Reconnection completed in ${this.performanceMetrics.reconnectionTime}ms`)
      } catch (error) {
        console.error('❌ Immediate reconnection failed:', error)
        this.scheduleExponentialBackoffReconnection()
      }
    }, 1024) // 1024ms delay for immediate reconnection
  }

  private scheduleExponentialBackoffReconnection() {
    const delay = Math.min(10240 * Math.pow(2, this.connectionState.reconnectionAttempts - 1), 30000)
    console.log(`🔄 Scheduling reconnection in ${delay}ms`)

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isDestroyed) {
        this.initiateImmediateReconnection()
      }
    }, delay)
  }

  private async initiateP2PConnection(pc: RTCPeerConnection, type: string): Promise<void> {
    console.log(`🚀 Initiating ${type} P2P connection`)

    try {
      // Create optimized data channels
      const primaryChannel = pc.createDataChannel(`${type}-primary`, {
        ordered: true,
        maxRetransmits: undefined, // Unlimited for reliability
      })

      const speedChannel = pc.createDataChannel(`${type}-speed`, {
        ordered: false, // Unordered for speed
        maxRetransmits: 0,
      })

      this.setupDataChannel(primaryChannel, type)
      this.setupDataChannel(speedChannel, `${type}-speed`)

      // Create offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        iceRestart: false,
      })

      await pc.setLocalDescription(offer)

      this.sendSignalingMessage({
        type: 'offer',
        sessionId: this.sessionId,
        offer: pc.localDescription,
        connectionType: type,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error(`❌ Error initiating ${type} P2P:`, error)
      throw error
    }
  }

  private setupDataChannel(channel: RTCDataChannel, type: string) {
    const channelId = `${type}-${channel.label}`
    console.log(`📡 Setting up data channel: ${channelId}`)

    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = this.getOptimalBufferThreshold()

    this.connectionState.dataChannels.set(channelId, channel)

    channel.onopen = () => {
      console.log(`📡 Data channel opened: ${channelId}`)

      if (!this.connectionState.activeChannel || type.includes('primary')) {
        this.connectionState.activeChannel = channel
        this.connectionState.isConnected = true
        this.onConnectionStatusChange?.('connected')
      }

      // Send connection test
      this.sendDataChannelMessage({
        type: 'connection-test',
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
      .filter(channel => channel.readyState === 'open')

    if (availableChannels.length > 0) {
      this.connectionState.activeChannel = availableChannels[0]
      console.log('🔄 Switched to alternative data channel')
    } else {
      console.log('⚠️ No alternative data channels available')
      this.connectionState.activeChannel = null
      this.connectionState.isConnected = false
      this.onConnectionStatusChange?.('disconnected')
      this.initiateImmediateReconnection()
    }
  }

  private handleDataChannelError(channelId: string) {
    console.log(`🔧 Handling data channel error: ${channelId}`)

    const connectionType = channelId.split('-')[0]
    const pc = this.getConnectionByType(connectionType)

    if (pc && pc.connectionState === 'connected') {
      try {
        const newChannel = pc.createDataChannel(`recovery-${Date.now()}`, {
          ordered: true,
          maxRetransmits: undefined,
        })
        this.setupDataChannel(newChannel, connectionType)
      } catch (error) {
        console.error('❌ Failed to recreate data channel:', error)
      }
    }
  }

  private getConnectionByType(type: string): RTCPeerConnection | null {
    switch (type) {
      case 'primary': return this.connectionState.primary
      case 'backup': return this.connectionState.backup
      case 'tertiary': return this.connectionState.tertiary
      default: return null
    }
  }

  private getOptimalBufferThreshold(): number {
    const { type, strength, isMobile } = this.networkConditions

    if (isMobile && this.backgroundMode) {
      return 65536 // 64KB for mobile background
    }

    if (type === 'wifi' && strength === 'excellent') {
      return 2097152 // 2MB for excellent WiFi
    } else if (strength === 'excellent') {
      return 1048576 // 1MB for excellent connections
    } else if (strength === 'good') {
      return 524288 // 512KB for good connections
    } else {
      return 262144 // 256KB for poor connections
    }
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'joined':
        console.log(`👤 Joined session (${message.userCount}/2 users)`)
        this.onUserCountChange?.(message.userCount)
        this.isInitiator = message.isInitiator
        break

      case 'user-joined':
        console.log(`👤 User joined! Count: ${message.userCount}`)
        this.onUserCountChange?.(message.userCount)
        if (this.isInitiator && message.userCount === 2) {
          setTimeout(() => {
            if (this.connectionState.primary) {
              this.initiateP2PConnection(this.connectionState.primary, 'primary')
            }
          }, 50) // Ultra-fast initiation
        }
        break

      case 'pong':
        this.handlePong(message.timestamp)
        break

      case 'offer':
        await this.handleOffer(message.offer, message.connectionType || 'primary')
        break

      case 'answer':
        await this.handleAnswer(message.answer, message.connectionType || 'primary')
        break

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate, message.connectionType || 'primary')
        break

      case 'user-left':
        console.log('👤 User left session')
        this.onUserCountChange?.(message.userCount)
        this.connectionState.isConnected = false
        this.onConnectionStatusChange?.('disconnected')
        break

      case 'error':
        console.error('❌ Signaling error:', message.message)
        this.onError?.(message.message, message)
        break
    }
  }

  private handlePong(timestamp: number) {
    if (timestamp) {
      const latency = Date.now() - timestamp
      this.networkConditions.latency = latency
      this.performanceMetrics.averageLatency = 
        (this.performanceMetrics.averageLatency + latency) / 2

      this.connectionState.lastSuccessfulPing = Date.now()
      this.connectionState.connectionHealth = Math.min(1024, this.connectionState.connectionHealth + 1)

      this.updateConnectionQuality()
    }
  }

  private updateConnectionQuality() {
    const { latency, bandwidth, stability } = this.networkConditions

    if (latency < 50 && bandwidth > 10 && stability > 80) {
      this.networkConditions.strength = 'excellent'
    } else if (latency < 150 && bandwidth > 5 && stability > 60) {
      this.networkConditions.strength = 'good'
    } else {
      this.networkConditions.strength = 'poor'
    }

    this.onConnectionQualityChange?.(this.networkConditions.strength)
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, connectionType: string): Promise<void> {
    try {
      console.log(`📥 Handling offer for ${connectionType}`)

      const pc = this.getConnectionByType(connectionType)
      if (!pc) {
        throw new Error(`No ${connectionType} connection available`)
      }

      await pc.setRemoteDescription(offer)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: 'answer',
        sessionId: this.sessionId,
        answer: pc.localDescription,
        connectionType,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error(`❌ Error handling offer for ${connectionType}:`, error)
      this.onError?.(`Failed to handle ${connectionType} offer`, error)
    }
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit, connectionType: string): Promise<void> {
    try {
      console.log(`📥 Handling answer for ${connectionType}`)

      const pc = this.getConnectionByType(connectionType)
      if (pc?.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(answer)
      }
    } catch (error) {
      console.error(`❌ Error handling answer for ${connectionType}:`, error)
      this.onError?.(`Failed to handle ${connectionType} answer`, error)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit, connectionType: string): Promise<void> {
    try {
      const pc = this.getConnectionByType(connectionType)
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate)
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
        console.error('❌ Error sending signaling message:', error)
        this.switchToBackupSignaling()
      }
    }
  }

  private sendDataChannelMessage(message: any): void {
    if (this.connectionState.activeChannel?.readyState === 'open') {
      try {
        this.connectionState.activeChannel.send(JSON.stringify(message))
      } catch (error) {
        console.error('❌ Error sending data channel message:', error)
        this.findAlternativeDataChannel()
      }
    }
  }

  private handleDataChannelMessage(data: ArrayBuffer | string, channelId: string): void {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data)
        this.handleControlMessage(message, channelId)
      } catch (error) {
        console.error('❌ Error parsing data channel message:', error)
      }
    } else {
      this.handleFileChunk(data)
    }
  }

  private handleControlMessage(message: any, channelId: string): void {
    switch (message.type) {
      case 'connection-test':
        console.log(`📨 Connection test from ${channelId}`)
        this.sendDataChannelMessage({
          type: 'connection-ack',
          channelId,
          timestamp: Date.now(),
        })
        break

      case 'connection-ack':
        console.log(`✅ Connection acknowledged from ${channelId}`)
        this.connectionState.lastSuccessfulPing = Date.now()
        break

      case 'chat-message':
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.content,
          sender: message.sender,
          timestamp: new Date(message.timestamp),
          type: message.messageType || 'text',
        }
        this.chatMessages.push(chatMessage)
        this.onChatMessage?.(chatMessage)
        break

      case 'file-start':
        this.handleFileStart(message)
        break

      case 'file-end':
        this.handleFileEnd(message.fileId)
        break

      case 'file-error':
        this.handleFileError(message.fileId, message.error)
        break
    }
  }

  // File transfer methods
  public async sendFiles(files: File[]): Promise<void> {
    if (!this.connectionState.isConnected) {
      throw new Error('Not connected - cannot send files')
    }

    if (files.length < 1 || files.length > 5) {
      throw new Error('File count must be between 1 and 5')
    }

    console.log(`📤 Starting file transfer: ${files.length} files`)
    console.log(`📊 Total size: ${(files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(1)}MB`)

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
        status: 'queued',
        direction: 'sending',
        chunks: new Map(),
        totalChunks: Math.ceil(file.size / this.getOptimalChunkSize()),
        receivedChunks: new Set(),
        speed: 0,
        startTime: 0,
        lastActivity: Date.now(),
        retryCount: 0,
        priority: index,
      }

      this.fileQueue.push(transferState)
    })

    this.processFileQueue()
    this.updateFileTransfers()
  }

  private processFileQueue(): void {
    while (this.activeTransfers.size < this.maxConcurrentFiles && this.fileQueue.length > 0) {
      const transfer = this.fileQueue.shift()!
      transfer.status = 'transferring'
      transfer.startTime = Date.now()

      this.activeTransfers.set(transfer.id, transfer)
      this.startFileTransfer(transfer)
    }
  }

  private async startFileTransfer(transfer: FileTransferState): Promise<void> {
    console.log(`📤 Starting transfer: ${transfer.name}`)

    try {
      // Get file from transfer (this would need to be implemented based on how files are stored)
      const file = await this.getFileFromTransfer(transfer)
      const checksum = await this.calculateChecksum(file)
      transfer.checksum = checksum

      // Send file start message
      this.sendDataChannelMessage({
        type: 'file-start',
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
      transfer.status = 'error'
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
      if (offset >= file.size || transfer.status !== 'transferring') {
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
        this.performanceMetrics.totalBytesTransferred += chunkSize

        this.updateFileTransfers()
        this.onSpeedUpdate?.(transfer.speed)

        // Continue sending
        if (offset < file.size && transfer.status === 'transferring') {
          setImmediate(sendNextChunk)
        } else if (offset >= file.size) {
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
        if (!e.target?.result || transfer.status !== 'transferring') {
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
        reject(new Error('Chunk read error'))
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
      if (this.connectionState.activeChannel?.readyState === 'open') {
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
        throw new Error('No active data channel')
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
    if (!this.connectionState.activeChannel || this.connectionState.activeChannel.readyState !== 'open') {
      return
    }

    const threshold = this.getOptimalBufferThreshold()

    for (const [bufferId, chunks] of this.transferBuffer.entries()) {
      while (chunks.length > 0 && this.connectionState.activeChannel.bufferedAmount < threshold) {
        const chunk = chunks.shift()!
        try {
          this.connectionState.activeChannel.send(chunk)
        } catch (error) {
          console.error('❌ Error sending buffered chunk:', error)
          chunks.unshift(chunk)
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

    transfer.status = 'completed'
    transfer.progress = 1024

    // Send completion message
    this.sendDataChannelMessage({
      type: 'file-end',
      fileId: transfer.id,
      timestamp: Date.now(),
    })

    this.handleTransferCompletion(transfer)
  }

  private handleTransferCompletion(transfer: FileTransferState): void {
    this.activeTransfers.delete(transfer.id)
    this.processFileQueue()
    this.updateFileTransfers()

    // Update performance metrics
    if (transfer.status === 'completed') {
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
      status: 'transferring',
      direction: 'receiving',
      chunks: new Map(),
      totalChunks: message.totalChunks,
      receivedChunks: new Set(),
      speed: 0,
      startTime: Date.now(),
      lastActivity: Date.now(),
      retryCount: 0,
      priority: message.priority || 0,
      checksum: message.checksum,
    }

    this.activeTransfers.set(transfer.id, transfer)
    this.updateFileTransfers()
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
        return
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

      this.updateFileTransfers()
      this.onSpeedUpdate?.(transfer.speed)

      // Check if transfer is complete
      if (transfer.receivedChunks.size === transfer.totalChunks) {
        this.completeFileReception(transfer)
      }
    } catch (error) {
      console.error('❌ Error handling file chunk:', error)
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

      // Verify checksum if provided
      if (transfer.checksum) {
        const isValid = await this.verifyChecksum(blob, transfer.checksum)
        if (!isValid) {
          throw new Error('File integrity check failed')
        }
      }

      // Download file
      this.downloadFile(blob, transfer.name)

      transfer.status = 'completed'
      transfer.progress = 1024
      this.handleTransferCompletion(transfer)
    } catch (error) {
      console.error(`❌ Error completing file reception: ${transfer.name}`, error)
      transfer.status = 'error'
      this.handleTransferCompletion(transfer)
      this.onError?.('File reception failed', error)
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
      transfer.status = 'error'
      this.handleTransferCompletion(transfer)
    }

    this.onError?.('File transfer error', { fileId, error })
  }

  private async verifyChecksum(blob: Blob, expectedChecksum: string): Promise<boolean> {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const actualChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      return actualChecksum === expectedChecksum
    } catch (error) {
      console.error('❌ Error verifying checksum:', error)
      return false
    }
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  private async getFileFromTransfer(transfer: FileTransferState): Promise<File> {
    // This would need to be implemented based on how files are stored
    // For now, we'll throw an error to indicate this needs implementation
    throw new Error('File retrieval not implemented - this should be handled by the calling code')
  }

  private getOptimalChunkSize(): number {
    const { type, strength, isMobile } = this.networkConditions

    if (isMobile && this.backgroundMode) {
      return 65536 // 64KB for mobile background
    }

    switch (type) {
      case 'wifi':
        return strength === 'excellent' ? 2097152 : 1048576 // 2MB or 1MB
      case 'ethernet':
        return 2097152 // 2MB for ethernet
      case 'cellular':
        return strength === 'excellent' ? 524288 : 262144 // 512KB or 256KB
      default:
        return 262144 // 256KB default
    }
  }

  private getOptimalConcurrency(): number {
    const { strength, isMobile } = this.networkConditions

    if (isMobile && this.backgroundMode) {
      return 1 // Single chunk in background
    }

    switch (strength) {
      case 'excellent':
        return isMobile ? 8 : 16
      case 'good':
        return isMobile ? 4 : 8
      case 'poor':
        return isMobile ? 2 : 4
      default:
        return 4
    }
  }

  private updateFileTransfers(): void {
    const transfers = [...this.fileQueue, ...Array.from(this.activeTransfers.values())]
    this.onFileTransferUpdate?.(transfers)
  }

  private adaptToNetworkConditions(): void {
    console.log(`📶 Adapting to network: ${this.networkConditions.type} (${this.networkConditions.strength})`)

    // Adjust concurrent transfers based on network
    switch (this.networkConditions.strength) {
      case 'excellent':
        this.maxConcurrentFiles = this.networkConditions.isMobile ? 2 : 3
        break
      case 'good':
        this.maxConcurrentFiles = 2
        break
      case 'poor':
        this.maxConcurrentFiles = 1
        break
    }

    // Restart file queue processing with new settings
    this.processFileQueue()
  }

  private startPerformanceMonitoring(): void {
    this.performanceInterval = setInterval(() => {
      this.updatePerformanceMetrics()
    }, 5000) // Every 5 seconds
  }

  private updatePerformanceMetrics(): void {
    // Calculate average transfer speed from active transfers
    const activeTransfers = Array.from(this.activeTransfers.values())
    if (activeTransfers.length > 0) {
      const totalSpeed = activeTransfers.reduce((sum, transfer) => sum + transfer.speed, 0)
      this.performanceMetrics.averageTransferSpeed = totalSpeed / activeTransfers.length
    }

    // Log performance metrics
    console.log('📊 Performance Metrics:', {
      connectionHealth: this.connectionState.connectionHealth,
      averageLatency: this.performanceMetrics.averageLatency,
      averageSpeed: Math.round(this.performanceMetrics.averageTransferSpeed / 1024) + ' KB/s',
      totalTransferred: Math.round(this.performanceMetrics.totalBytesTransferred / 1024 / 1024) + ' MB',
      successRate: Math.round((this.performanceMetrics.successfulConnections / 
        (this.performanceMetrics.successfulConnections + this.performanceMetrics.failedConnections)) * 1024) + '%',
    })
  }

  private startHealthMonitoring(): void {
    this.healthMonitorInterval = setInterval(() => {
      this.monitorConnectionHealth()
    }, 102400) // Every 10 seconds
  }

  private monitorConnectionHealth(): void {
    const now = Date.now()
    const timeSinceLastPing = now - this.connectionState.lastSuccessfulPing

    // Degrade health based on time since last successful ping
    if (timeSinceLastPing > 30000) { // 30 seconds
      this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 10)
    } else if (timeSinceLastPing > 15000) { // 15 seconds
      this.connectionState.connectionHealth = Math.max(0, this.connectionState.connectionHealth - 5)
    }

    // Check for stalled transfers
    const stalledTransfers = Array.from(this.activeTransfers.values())
      .filter(transfer => now - transfer.lastActivity > 30000)

    stalledTransfers.forEach(transfer => {
      console.log(`⚠️ Stalled transfer detected: ${transfer.name}`)
      if (transfer.retryCount < 3) {
        transfer.retryCount++
        transfer.lastActivity = now
        // Restart transfer logic would go here
      } else {
        transfer.status = 'error'
        this.handleTransferCompletion(transfer)
      }
    })

    // Trigger reconnection if health is too low
    if (this.connectionState.connectionHealth < 20 && this.connectionState.isConnected) {
      console.log('⚠️ Connection health critical - triggering reconnection')
      this.initiateImmediateReconnection()
    }
  }

  // Chat functionality
  public sendChatMessage(content: string, type: 'text' | 'clipboard' = 'text'): void {
    if (!this.connectionState.isConnected) {
      throw new Error('Not connected - cannot send message')
    }

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      content,
      sender: this.userId,
      timestamp: new Date(),
      type,
    }

    this.chatMessages.push(message)
    this.onChatMessage?.(message)

    this.sendDataChannelMessage({
      type: 'chat-message',
      id: message.id,
      content: message.content,
      sender: message.sender,
      timestamp: message.timestamp.getTime(),
      messageType: message.type,
    })
  }

  public getChatMessages(): ChatMessage[] {
    return [...this.chatMessages]
  }

  // Background mode handlers
  private enterBackgroundMode(): void {
    console.log('📱 Entering background mode')

    // Preserve connection data
    this.connectionPreservationData = {
      sessionId: this.sessionId,
      userId: this.userId,
      connectionHealth: this.connectionState.connectionHealth,
      activeTransfers: Array.from(this.activeTransfers.entries()),
      chatMessages: this.chatMessages,
    }

    // Notify service worker
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: 'BACKGROUND_MODE',
        data: { enabled: true }
      })
    }

    // Reduce heartbeat frequency
    this.startHeartbeat()
  }

  private exitBackgroundMode(): void {
    console.log('📱 Exiting background mode')

    // Restore connection data if needed
    if (this.connectionPreservationData) {
      // Restore active transfers
      this.connectionPreservationData.activeTransfers.forEach(([id, transfer]: [string, FileTransferState]) => {
        this.activeTransfers.set(id, transfer)
      })

      this.connectionPreservationData = null
    }

    // Notify service worker
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: 'BACKGROUND_MODE',
        data: { enabled: false }
      })
    }

    // Restore normal heartbeat
    this.startHeartbeat()

    // Check connection health
    if (!this.connectionState.isConnected) {
      this.initiateImmediateReconnection()
    }
  }

  private sendBackgroundKeepAlive(): void {
    if (this.activeSignaling?.readyState === WebSocket.OPEN) {
      this.sendSignalingMessage({
        type: 'background-keepalive',
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now(),
      })
    }
  }

  private handleConnectionRecovery(): void {
    console.log('🔧 Handling connection recovery from service worker')

    if (!this.connectionState.isConnected) {
      this.initiateImmediateReconnection()
    }
  }

  private handleNetworkOnline(): void {
    console.log('📶 Network back online - resuming operations')

    // Resume signaling connections
    this.establishSignalingConnections()

    // Resume P2P connections
    if (!this.connectionState.isConnected) {
      this.initiateImmediateReconnection()
    }

    // Resume file transfers
    this.processFileQueue()
  }

  private handleNetworkOffline(): void {
    console.log('📶 Network offline - pausing operations')

    // Pause file transfers
    Array.from(this.activeTransfers.values()).forEach(transfer => {
      if (transfer.status === 'transferring') {
        transfer.status = 'paused'
      }
    })

    this.updateFileTransfers()
  }

  // Public API methods
  public getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' {
    if (this.connectionState.isConnected) return 'connected'
    if (this.connectionState.primary?.connectionState === 'connecting') return 'connecting'
    return 'disconnected'
  }

  public getConnectionHealth(): number {
    return this.connectionState.connectionHealth
  }

  public getNetworkConditions(): NetworkConditions {
    return { ...this.networkConditions }
  }

  public getPerformanceMetrics() {
    return { ...this.performanceMetrics }
  }

  public getActiveTransfers(): FileTransferState[] {
    return Array.from(this.activeTransfers.values())
  }

  public pauseTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer && transfer.status === 'transferring') {
      transfer.status = 'paused'
      this.updateFileTransfers()
    }
  }

  public resumeTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer && transfer.status === 'paused') {
      transfer.status = 'transferring'
      this.processFileQueue()
      this.updateFileTransfers()
    }
  }

  public cancelTransfer(fileId: string): void {
    const transfer = this.activeTransfers.get(fileId)
    if (transfer) {
      transfer.status = 'error'
      this.handleTransferCompletion(transfer)

      // Send cancellation message
      this.sendDataChannelMessage({
        type: 'file-error',
        fileId,
        error: 'Transfer cancelled by user',
      })
    }
  }

  public async destroy(): Promise<void> {
    console.log('🔥 Destroying Bulletproof P2P Core System')

    this.isDestroyed = true

    // Clear all timers
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    if (this.healthMonitorInterval) clearInterval(this.healthMonitorInterval)
    if (this.performanceInterval) clearInterval(this.performanceInterval)

    // Close all connections
    this.connectionState.primary?.close()
    this.connectionState.backup?.close()
    this.connectionState.tertiary?.close()

    // Close all signaling connections
    this.signalingConnections.forEach(ws => ws.close())

    // Release wake lock
    if (this.wakeLock) {
      this.wakeLock.release()
    }

    // Unregister service worker
    if (this.serviceWorker && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.unregister()
        }
      } catch (error) {
        console.warn('⚠️ Error unregistering service worker:', error)
      }
    }

    // Clear all data
    this.activeTransfers.clear()
    this.fileQueue.length = 0
    this.transferBuffer.clear()
    this.chatMessages.length = 0

    console.log('✅ System destroyed successfully')
  }
}
