// Enhanced Signaling Server - Optimized for speed, reliability, and mobile support
import { WebSocketServer, WebSocket } from "ws"
import { createServer } from "http"

interface UserData {
  ws: WebSocket
  userId: string
  joinedAt: Date
  lastSeen: Date
  isInitiator: boolean
  capabilities?: any
  connectionHealth: number
  backgroundMode: boolean
  networkType: string
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts: number
  transfersInProgress: number
  messageQueue: Map<string, any[]>
}

interface ServerMetrics {
  totalConnections: number
  activeSessions: number
  messagesProcessed: number
  reconnectionEvents: number
  backgroundConnections: number
  averageLatency: number
}

export class EnhancedSignalingServer {
  private wss!: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any
  private metrics: ServerMetrics = {
    totalConnections: 0,
    activeSessions: 0,
    messagesProcessed: 0,
    reconnectionEvents: 0,
    backgroundConnections: 0,
    averageLatency: 0,
  }

  // Connection health monitoring
  private connectionHealth: Map<WebSocket, number> = new Map()
  private latencyTracking: Map<WebSocket, number[]> = new Map()

  // Message queuing for reliability
  private globalMessageQueue: Map<string, any[]> = new Map()
  private messageRetryQueue: Map<string, { message: any; retries: number; lastAttempt: number }> = new Map()

  // Background connection management
  private backgroundConnections: Set<WebSocket> = new Set()
  private keepAliveIntervals: Map<WebSocket, NodeJS.Timeout> = new Map()

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Starting Enhanced Signaling Server")
    console.log(`🌐 Port: ${port}`)
    console.log(`📊 Features: Background persistence, Message queuing, Health monitoring`)

    this.server = createServer()
    this.setupHttpHandlers()
    this.setupWebSocketServer(Number(port))
    this.startMetricsCollection()
    this.startMaintenanceTasks()

    // Graceful shutdown handling
    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private setupHttpHandlers(): void {
    this.server.on("request", (req: any, res: any) => {
      // Enhanced CORS for maximum compatibility
      const origin = req.headers.origin
      const allowedOrigins = [
        "https://p2p-file-share-fix.vercel.app",
        "https://c0-ai.live",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
      ]

      // Allow all Vercel deployments and localhost
      if (origin && (allowedOrigins.includes(origin) || 
          origin.includes(".vercel.app") || 
          origin.includes("localhost") ||
          origin.includes("127.0.0.1"))) {
        res.setHeader("Access-Control-Allow-Origin", origin)
      } else if (!origin) {
        res.setHeader("Access-Control-Allow-Origin", "*")
      }

      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
      res.setHeader("Access-Control-Allow-Credentials", "true")

      if (req.method === "OPTIONS") {
        res.writeHead(200)
        res.end()
        return
      }

      // Enhanced health check
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          status: "enhanced-bulletproof",
          timestamp: new Date().toISOString(),
          metrics: this.metrics,
          uptime: process.uptime(),
          version: "5.0.0-enhanced",
          features: [
            "background-persistence",
            "message-queuing", 
            "health-monitoring",
            "adaptive-timeouts",
            "connection-redundancy"
          ],
        }))
        return
      }

      // Detailed metrics endpoint
      if (req.url === "/metrics") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(this.getDetailedMetrics()))
        return
      }

      // Session information endpoint
      if (req.url?.startsWith("/session/")) {
        const sessionId = req.url.split("/")[2]
        const session = this.sessions.get(sessionId)
        
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          exists: !!session,
          userCount: session?.users.size || 0,
          active: session ? this.isSessionActive(session) : false,
        }))
        return
      }

      res.writeHead(404)
      res.end()
    })
  }

  private setupWebSocketServer(port: number): void {
    interface WebSocketServerOptions {
      server: any;
      perMessageDeflate: {
        threshold: number;
        concurrencyLimit: number;
        serverMaxWindowBits: number;
        clientMaxWindowBits: number;
        serverNoContextTakeover: boolean;
        clientNoContextTakeover: boolean;
      };
      maxPayload: number;
      clientTracking: boolean;
      handleProtocols: (protocols: Set<string>) => string | false;
      verifyClient: (info: VerifyClientInfo) => boolean;
    }

    interface VerifyClientInfo {
      origin?: string;
      secure: boolean;
      req: any;
    }

        this.wss = new WebSocketServer({
          server: this.server,
          perMessageDeflate: {
            threshold: 256, // Compress smaller messages for mobile
            concurrencyLimit: 30,
            serverMaxWindowBits: 15,
            clientMaxWindowBits: 15,
            serverNoContextTakeover: false,
            clientNoContextTakeover: false,
          },
          maxPayload: 5 * 1024 * 1024 * 1024, // 5GB for large file metadata
          clientTracking: true,
          handleProtocols: (protocols: Set<string>): string | false => {
            const supportedProtocols: string[] = ["bulletproof-v1", "enhanced-v1"]
            return Array.from(protocols).find((p: string) => supportedProtocols.includes(p)) || Array.from(protocols)[0] || false
          },
          verifyClient: (info: VerifyClientInfo): boolean => {
            const origin: string | undefined = info.origin
            if (!origin) return true

            const allowedOrigins: string[] = [
              "https://p2p-file-share-fix.vercel.app",
              "https://vercel.app",
              "https://c0-ai.live",
              "http://localhost:3000",
              "http://127.0.0.1:3000",
              "https://localhost:3000",
            ]

            return allowedOrigins.includes(origin) || 
                   origin.includes(".vercel.app") || 
                   origin.includes("localhost") ||
                   origin.includes("127.0.0.1")
          },
        } as WebSocketServerOptions)

    this.wss.on("connection", this.handleConnection.bind(this))
    this.wss.on("error", (error) => {
      console.error("❌ WebSocket Server error:", error)
    })

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Enhanced Signaling Server running on port ${port}`)
      console.log(`🔗 Ready for bulletproof P2P connections`)
      console.log(`📊 Advanced features enabled`)
    })

    this.server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use!`)
        console.log(`💡 Kill the process using: lsof -ti:${port} | xargs kill`)
      } else {
        console.error("❌ Server error:", error)
      }
      process.exit(1)
    })
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientIP = req.socket.remoteAddress
    const userAgent = req.headers["user-agent"]
    const connectionId = Math.random().toString(36).substring(2, 15)

    console.log(`🔗 Enhanced connection from ${clientIP} (${connectionId})`)
    console.log(`   User-Agent: ${userAgent?.substring(0, 50)}...`)

    this.metrics.totalConnections++
    this.connectionHealth.set(ws, 100)
    this.latencyTracking.set(ws, [])

    // Send enhanced connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Connected to enhanced signaling server",
      timestamp: new Date().toISOString(),
      connectionId,
      version: "5.0.0-enhanced",
      features: [
        "background-persistence",
        "message-queuing",
        "health-monitoring",
        "adaptive-timeouts",
        "connection-redundancy"
      ],
      serverId: process.env.DYNO || "local",
      serverMetrics: {
        activeSessions: this.metrics.activeSessions,
        totalConnections: this.metrics.totalConnections,
      },
    })

    // Enhanced message handling with error recovery
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleMessage(ws, message, clientIP, connectionId)
        this.metrics.messagesProcessed++
        this.updateConnectionHealth(ws, 2)
      } catch (error) {
        console.error(`❌ Invalid message format from ${clientIP}:`, error)
        this.updateConnectionHealth(ws, -5)
        this.sendError(ws, "Invalid message format")
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Enhanced client disconnected: ${code} ${reason} (${clientIP})`)
      this.handleDisconnection(ws, connectionId)
    })

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error from ${clientIP}:`, error)
      this.updateConnectionHealth(ws, -10)
      this.handleDisconnection(ws, connectionId)
    })

    // Enhanced ping/pong with latency tracking
    ws.on("pong", (data) => {
      const timestamp = data.toString()
      if (timestamp) {
        const latency = Date.now() - Number.parseInt(timestamp)
        this.trackLatency(ws, latency)
        this.updateConnectionHealth(ws, 1)
        console.log(`🏓 Pong from ${clientIP} (${latency}ms)`)
      }
    })

    // Adaptive keep-alive based on connection health
    this.startAdaptiveKeepAlive(ws, clientIP)

    // Extended connection timeout with health monitoring
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const health = this.connectionHealth.get(ws) || 0
        if (health < 30) {
          console.log(`⏰ Unhealthy connection timeout for ${clientIP}`)
          ws.close(1008, "Connection unhealthy")
        }
      }
    }, 45 * 60 * 1000) // 45 minutes for enhanced persistence

    ws.on("close", () => {
      clearTimeout(connectionTimeout)
      this.stopKeepAlive(ws)
      this.connectionHealth.delete(ws)
      this.latencyTracking.delete(ws)
    })
  }

  private startAdaptiveKeepAlive(ws: WebSocket, clientIP: string): void {
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const health = this.connectionHealth.get(ws) || 0
        const isBackground = this.backgroundConnections.has(ws)
        
        // Adaptive ping frequency based on health and background status
        const frequency = isBackground ? 5000 : (health > 70 ? 20000 : 10000)
        
        ws.ping(Date.now().toString())
        
        // Adjust next ping based on current conditions
        clearInterval(pingInterval)
        setTimeout(() => this.startAdaptiveKeepAlive(ws, clientIP), frequency)
      } else {
        clearInterval(pingInterval)
      }
    }, 15000) // Initial 15-second interval

    this.keepAliveIntervals.set(ws, pingInterval)
  }

  private stopKeepAlive(ws: WebSocket): void {
    const interval = this.keepAliveIntervals.get(ws)
    if (interval) {
      clearInterval(interval)
      this.keepAliveIntervals.delete(ws)
    }
  }

  private trackLatency(ws: WebSocket, latency: number): void {
    const latencies = this.latencyTracking.get(ws) || []
    latencies.push(latency)
    
    // Keep only last 10 measurements
    if (latencies.length > 10) {
      latencies.shift()
    }
    
    this.latencyTracking.set(ws, latencies)
    
    // Update global average latency
    const allLatencies = Array.from(this.latencyTracking.values()).flat()
    this.metrics.averageLatency = allLatencies.length > 0 ? 
      allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0
  }

  private updateConnectionHealth(ws: WebSocket, delta: number): void {
    const currentHealth = this.connectionHealth.get(ws) || 0
    const newHealth = Math.max(0, Math.min(100, currentHealth + delta))
    this.connectionHealth.set(ws, newHealth)
    
    // Track background connections
    if (newHealth < 50 && !this.backgroundConnections.has(ws)) {
      this.backgroundConnections.add(ws)
      this.metrics.backgroundConnections++
    } else if (newHealth >= 70 && this.backgroundConnections.has(ws)) {
      this.backgroundConnections.delete(ws)
      this.metrics.backgroundConnections = Math.max(0, this.metrics.backgroundConnections - 1)
    }
  }

  private handleMessage(ws: WebSocket, message: any, clientIP: string, connectionId: string): void {
    const { type, sessionId, userId } = message

    // Enhanced validation
    if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
      this.sendError(ws, "Invalid session ID format. Must be 6 alphanumeric characters.")
      return
    }

    if (userId && (typeof userId !== "string" || userId.length < 1 || userId.length > 100)) {
      this.sendError(ws, "Invalid user ID format")
      return
    }

    // Enhanced logging with connection health
    const health = this.connectionHealth.get(ws) || 0
    console.log(
      `📨 ${type} from ${clientIP} (health: ${health}%) ${sessionId ? `(session: ${sessionId})` : ""} ${userId ? `(user: ${userId.substring(0, 8)}...)` : ""}`
    )

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId, message.capabilities, connectionId)
        break
      case "ping":
      case "background-ping":
        this.handlePing(ws, sessionId, userId, message.timestamp, type === "background-ping")
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relaySignalingMessage(ws, message)
        break
      case "connection-recovery":
        this.handleConnectionRecovery(ws, sessionId, userId)
        break
      case "background-mode":
        this.handleBackgroundMode(ws, message.enabled)
        break
      case "transfer-start":
        this.handleTransferStart(ws, sessionId, message.fileCount)
        break
      case "transfer-complete":
        this.handleTransferComplete(ws, sessionId)
        break
      default:
        console.log(`⚠️ Unknown message type: ${type}`)
        this.sendError(ws, `Unknown message type: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string, capabilities?: any, connectionId?: string): void {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID are required")
      return
    }

    console.log(`👤 User ${userId.substring(0, 8)}... joining session ${sessionId} (${connectionId})`)

    // Get or create session with enhanced features
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        users: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        connectionAttempts: 0,
        transfersInProgress: 0,
        messageQueue: new Map(),
      }
      this.sessions.set(sessionId, session)
      this.metrics.activeSessions++
      console.log(`🆕 Created enhanced session: ${sessionId}`)
    }

    // Handle reconnection with state preservation
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId.substring(0, 8)}... reconnecting to session ${sessionId}`)
      this.metrics.reconnectionEvents++

      // Update connection with enhanced data
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      existingUser.connectionHealth = this.connectionHealth.get(ws) || 100
      existingUser.capabilities = { ...existingUser.capabilities, ...capabilities }
      
      this.userSessions.set(ws, sessionId)
      session.lastActivity = new Date()

      // Deliver queued messages
      this.deliverQueuedMessages(session, userId)

      this.send(ws, {
        type: "joined",
        sessionId,
        userCount: session.users.size,
        userId,
        isInitiator: existingUser.isInitiator,
        reconnected: true,
        capabilities: existingUser.capabilities,
        sessionHealth: this.calculateSessionHealth(session),
        transfersInProgress: session.transfersInProgress,
      })

      this.broadcastToSession(sessionId, {
        type: "user-reconnected",
        userId,
        userCount: session.users.size,
        connectionHealth: existingUser.connectionHealth,
        timestamp: Date.now(),
      }, ws)

      return
    }

    // Check session capacity
    if (session.users.size >= 2) {
      console.log(`❌ Session ${sessionId} is full (${session.users.size}/2 users)`)
      this.sendError(ws, "Session is full (maximum 2 users for P2P)")
      return
    }

    // Add new user with enhanced data
    const isInitiator = session.users.size === 0
    const userData: UserData = {
      ws,
      userId,
      joinedAt: new Date(),
      lastSeen: new Date(),
      isInitiator,
      capabilities: capabilities || {},
      connectionHealth: this.connectionHealth.get(ws) || 100,
      backgroundMode: false,
      networkType: capabilities?.networkType || "unknown",
    }

    session.users.set(userId, userData)
    this.userSessions.set(ws, sessionId)
    session.lastActivity = new Date()

    console.log(
      `✅ User ${userId.substring(0, 8)}... joined session ${sessionId} (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"} (health: ${userData.connectionHealth}%)`
    )

    // Send enhanced confirmation
    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
      sessionCreated: session.createdAt.toISOString(),
      capabilities: userData.capabilities,
      sessionHealth: this.calculateSessionHealth(session),
      serverMetrics: {
        activeSessions: this.metrics.activeSessions,
        averageLatency: this.metrics.averageLatency,
      },
    })

    // Enhanced P2P connection trigger
    if (session.users.size === 2) {
      console.log(`🚀 Session ${sessionId} ready for enhanced P2P connection`)

      // Immediate notification with enhanced data
      setTimeout(() => {
        this.broadcastToSession(sessionId, {
          type: "user-joined",
          userId,
          userCount: session.users.size,
          readyForConnection: true,
          sessionHealth: this.calculateSessionHealth(session),
          optimizedForFiles: true,
          timestamp: Date.now(),
        }, ws)
      }, 25) // Ultra-fast 25ms delay
    } else {
      this.broadcastToSession(sessionId, {
        type: "user-joined",
        userId,
        userCount: session.users.size,
        timestamp: Date.now(),
      }, ws)
    }
  }

  private handlePing(ws: WebSocket, sessionId: string, userId: string, timestamp?: number, isBackground: boolean = false): void {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.backgroundMode = isBackground
        session.lastActivity = new Date()
        
        if (isBackground && !this.backgroundConnections.has(ws)) {
          this.backgroundConnections.add(ws)
          this.metrics.backgroundConnections++
        }
      }
    }

    this.send(ws, {
      type: "pong",
      timestamp: timestamp || Date.now(),
      serverTime: Date.now(),
      connectionHealth: this.connectionHealth.get(ws) || 0,
      backgroundMode: isBackground,
    })
  }

  private handleBackgroundMode(ws: WebSocket, enabled: boolean): void {
    console.log(`📱 Background mode ${enabled ? "enabled" : "disabled"} for connection`)
    
    if (enabled) {
      this.backgroundConnections.add(ws)
      this.metrics.backgroundConnections++
    } else {
      this.backgroundConnections.delete(ws)
      this.metrics.backgroundConnections = Math.max(0, this.metrics.backgroundConnections - 1)
    }

    // Update user data if available
    const sessionId = this.userSessions.get(ws)
    if (sessionId) {
      const session = this.sessions.get(sessionId)
      if (session) {
        for (const user of session.users.values()) {
          if (user.ws === ws) {
            user.backgroundMode = enabled
            break
          }
        }
      }
    }
  }

  private handleTransferStart(ws: WebSocket, sessionId: string, fileCount: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.transfersInProgress += fileCount
      console.log(`📤 Transfer started in session ${sessionId}: ${fileCount} files (total: ${session.transfersInProgress})`)
      
      this.broadcastToSession(sessionId, {
        type: "transfer-started",
        fileCount,
        totalTransfers: session.transfersInProgress,
        timestamp: Date.now(),
      })
    }
  }

  private handleTransferComplete(ws: WebSocket, sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.transfersInProgress = Math.max(0, session.transfersInProgress - 1)
      console.log(`✅ Transfer completed in session ${sessionId} (remaining: ${session.transfersInProgress})`)
      
      this.broadcastToSession(sessionId, {
        type: "transfer-completed",
        remainingTransfers: session.transfersInProgress,
        timestamp: Date.now(),
      })
    }
  }

  private handleConnectionRecovery(ws: WebSocket, sessionId: string, userId: string): void {
    console.log(`🔧 Enhanced connection recovery requested by ${userId.substring(0, 8)}... in session ${sessionId}`)

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.connectionAttempts++
    session.lastActivity = new Date()
    this.metrics.reconnectionEvents++

    // Enhanced recovery with health information
    this.broadcastToSession(sessionId, {
      type: "connection-recovery",
      userId,
      attempt: session.connectionAttempts,
      sessionHealth: this.calculateSessionHealth(session),
      serverRecommendation: this.getRecoveryRecommendation(session),
      timestamp: Date.now(),
    })
  }

  private getRecoveryRecommendation(session: Session): string {
    const health = this.calculateSessionHealth(session)
    
    if (health > 80) return "optimal"
    if (health > 60) return "good"
    if (health > 40) return "degraded"
    return "critical"
  }

  private calculateSessionHealth(session: Session): number {
    const users = Array.from(session.users.values())
    if (users.length === 0) return 0

    const healthScores = users.map(user => this.connectionHealth.get(user.ws) || 0)
    const averageHealth = healthScores.reduce((a, b) => a + b, 0) / healthScores.length

    // Factor in session age and activity
    const sessionAge = Date.now() - session.createdAt.getTime()
    const lastActivity = Date.now() - session.lastActivity.getTime()
    
    const agePenalty = Math.min(sessionAge / (60 * 60 * 1000), 0.2) // Max 20% penalty for age
    const activityPenalty = Math.min(lastActivity / (5 * 60 * 1000), 0.3) // Max 30% penalty for inactivity

    return Math.max(0, averageHealth * (1 - agePenalty - activityPenalty))
  }

  private relaySignalingMessage(ws: WebSocket, message: any): void {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) {
      this.sendError(ws, "Not in a session")
      return
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.lastActivity = new Date()

    // Find sender with enhanced data
    const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]
    if (userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        this.updateConnectionHealth(ws, 1)
      }
    }

    // Enhanced message validation
    const messageSize = JSON.stringify(message).length
    if (messageSize > 50 * 1024 * 1024) { // 50MB limit for large file metadata
      this.sendError(ws, "Message too large")
      return
    }

    console.log(
      `🔄 Relaying ${message.type} from ${userId?.substring(0, 8)}... in session ${sessionId} (${messageSize} bytes, health: ${this.connectionHealth.get(ws) || 0}%)`
    )

    // Add enhanced metadata to message
    const relayMessage = {
      ...message,
      senderId: userId,
      timestamp: Date.now(),
      serverProcessed: new Date().toISOString(),
      messageId: Math.random().toString(36).substring(2, 15),
      sessionHealth: this.calculateSessionHealth(session),
      senderHealth: this.connectionHealth.get(ws) || 0,
    }

    // Enhanced relay with delivery confirmation and queuing
    this.broadcastToSessionWithReliability(sessionId, relayMessage, ws)
  }

  private broadcastToSessionWithReliability(sessionId: string, message: any, excludeWs?: WebSocket): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let sentCount = 0
    let queuedCount = 0
    let failedCount = 0

    session.users.forEach((userData, userId) => {
      if (userData.ws !== excludeWs) {
        if (userData.ws.readyState === WebSocket.OPEN) {
          try {
            this.send(userData.ws, message)
            sentCount++
            this.updateConnectionHealth(userData.ws, 1)
          } catch (error) {
            console.error(`❌ Failed to send message to user ${userId.substring(0, 8)}...:`, error)
            this.queueMessage(session, userId, message)
            this.updateConnectionHealth(userData.ws, -5)
            queuedCount++
          }
        } else {
          // Queue message for offline user
          this.queueMessage(session, userId, message)
          queuedCount++
        }
      }
    })

    if (sentCount > 0 || queuedCount > 0) {
      console.log(`📡 Enhanced broadcast ${message.type} to session ${sessionId}: ${sentCount} sent, ${queuedCount} queued, ${failedCount} failed`)
    }

    // Add to retry queue if delivery failed
    if (queuedCount > 0 || failedCount > 0) {
      this.messageRetryQueue.set(message.messageId, {
        message,
        retries: 0,
        lastAttempt: Date.now(),
      })
    }
  }

  private queueMessage(session: Session, userId: string, message: any): void {
    if (!session.messageQueue.has(userId)) {
      session.messageQueue.set(userId, [])
    }

    const queue = session.messageQueue.get(userId)!
    queue.push({
      ...message,
      queuedAt: Date.now(),
      priority: this.getMessagePriority(message.type),
    })

    // Sort by priority and limit queue size
    queue.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    if (queue.length > 200) { // Increased queue size for file transfers
      queue.splice(100) // Keep only highest priority messages
    }

    console.log(`📬 Enhanced queued message for user ${userId.substring(0, 8)}... (queue size: ${queue.length}, priority: ${message.priority || 0})`)
  }

  private getMessagePriority(messageType: string): number {
    const priorities: { [key: string]: number } = {
      "connection-recovery": 100,
      "user-joined": 90,
      "user-left": 90,
      "offer": 80,
      "answer": 80,
      "ice-candidate": 70,
      "file-start": 60,
      "file-end": 60,
      "file-chunk": 50,
      "chat-message": 30,
      "ping": 10,
    }

    return priorities[messageType] || 20
  }

  private deliverQueuedMessages(session: Session, userId: string): void {
    const queue = session.messageQueue.get(userId)
    if (!queue || queue.length === 0) return

    console.log(`📬 Delivering ${queue.length} queued messages to user ${userId.substring(0, 8)}...`)

    const userData = session.users.get(userId)
    if (!userData || userData.ws.readyState !== WebSocket.OPEN) return

    // Deliver messages in priority order
    let deliveredCount = 0
    let failedCount = 0

    queue.forEach((message) => {
      try {
        this.send(userData.ws, {
          ...message,
          wasQueued: true,
          deliveredAt: Date.now(),
          queueTime: Date.now() - message.queuedAt,
        })
        deliveredCount++
      } catch (error) {
        console.error(`❌ Failed to deliver queued message to ${userId.substring(0, 8)}...:`, error)
        failedCount++
      }
    })

    console.log(`📬 Delivered ${deliveredCount} messages, ${failedCount} failed for user ${userId.substring(0, 8)}...`)

    // Clear delivered messages
    session.messageQueue.delete(userId)
  }

  private handleDisconnection(ws: WebSocket, connectionId: string): void {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    let disconnectedUserId: string | undefined

    // Find disconnected user
    for (const [userId, userData] of session.users.entries()) {
      if (userData.ws === ws) {
        disconnectedUserId = userId
        userData.lastSeen = new Date(Date.now() - 60000) // Mark as 1 minute ago
        break
      }
    }

    if (disconnectedUserId) {
      this.userSessions.delete(ws)
      console.log(`👋 User ${disconnectedUserId.substring(0, 8)}... disconnected from session ${sessionId} (${connectionId})`)

      // Enhanced disconnection notification
      this.broadcastToSession(sessionId, {
        type: "user-left",
        userId: disconnectedUserId,
        userCount: session.users.size,
        temporary: true,
        sessionHealth: this.calculateSessionHealth(session),
        timestamp: Date.now(),
      })

      // Extended grace period for reconnection (15 minutes for file transfers)
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 900000) { // 15 minutes
            currentSession.users.delete(disconnectedUserId!)
            console.log(`🗑️ Removed inactive user ${disconnectedUserId!.substring(0, 8)}... from session ${sessionId}`)

            this.broadcastToSession(sessionId, {
              type: "user-left",
              userId: disconnectedUserId,
              userCount: currentSession.users.size,
              permanent: true,
              timestamp: Date.now(),
            })

            // Clean up empty sessions
            if (currentSession.users.size === 0) {
              this.sessions.delete(sessionId)
              this.metrics.activeSessions = Math.max(0, this.metrics.activeSessions - 1)
              console.log(`🗑️ Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 900000) // 15 minutes
    }

    // Clean up connection tracking
    this.backgroundConnections.delete(ws)
    this.stopKeepAlive(ws)
  }

  private broadcastToSession(sessionId: string, message: any, excludeWs?: WebSocket): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let sentCount = 0
    let queuedCount = 0

    session.users.forEach((userData, userId) => {
      if (userData.ws !== excludeWs) {
        if (userData.ws.readyState === WebSocket.OPEN) {
          try {
            this.send(userData.ws, message)
            sentCount++
          } catch (error) {
            console.error(`❌ Failed to send message to user ${userId.substring(0, 8)}...:`, error)
            this.queueMessage(session, userId, message)
            queuedCount++
          }
        } else {
          this.queueMessage(session, userId, message)
          queuedCount++
        }
      }
    })

    if (sentCount > 0 || queuedCount > 0) {
      console.log(`📡 Broadcasted ${message.type} to session ${sessionId}: ${sentCount} sent, ${queuedCount} queued`)
    }
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending message:", error)
        throw error
      }
    } else {
      throw new Error("WebSocket not open")
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    console.error(`❌ Error: ${message}`)
    try {
      this.send(ws, {
        type: "error",
        message,
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
        connectionHealth: this.connectionHealth.get(ws) || 0,
      })
    } catch (error) {
      console.error("❌ Failed to send error message:", error)
    }
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.metrics.activeSessions = this.sessions.size
      
      // Update background connections count
      this.metrics.backgroundConnections = this.backgroundConnections.size
      
      console.log(`📊 Server metrics: ${this.metrics.activeSessions} sessions, ${this.metrics.totalConnections} total connections, ${this.metrics.backgroundConnections} background, avg latency: ${this.metrics.averageLatency.toFixed(1)}ms`)
    }, 30000) // Every 30 seconds
  }

  private startMaintenanceTasks(): void {
    // Enhanced session cleanup every 5 minutes
    setInterval(() => {
      this.cleanupSessions()
      this.processRetryQueue()
      this.cleanupMessageQueues()
    }, 300000)

    // Connection health monitoring every minute
    setInterval(() => {
      this.monitorConnectionHealth()
    }, 60000)
  }

  private cleanupSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []

    console.log(`🧹 Running enhanced session cleanup...`)

    this.sessions.forEach((session, sessionId) => {
      // Remove sessions inactive for more than 4 hours (extended for file transfers)
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime > 4 * 60 * 60 * 1000) { // 4 hours
        expiredSessions.push(sessionId)
      } else {
        // Clean up inactive users within active sessions
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 2 * 60 * 60 * 1000) { // 2 hours
            inactiveUsers.push(userId)
          }
        })

        inactiveUsers.forEach((userId) => {
          session.users.delete(userId)
          session.messageQueue.delete(userId)
          console.log(`🧹 Removed inactive user ${userId.substring(0, 8)}... from session ${sessionId}`)
        })

        if (session.users.size === 0) {
          expiredSessions.push(sessionId)
        }
      }
    })

    expiredSessions.forEach((sessionId) => {
      const session = this.sessions.get(sessionId)
      if (session) {
        session.users.forEach((userData) => {
          this.sendError(userData.ws, "Session expired due to inactivity")
          userData.ws.close(1000, "Session expired")
        })

        this.sessions.delete(sessionId)
        this.metrics.activeSessions = Math.max(0, this.metrics.activeSessions - 1)
        console.log(`⏰ Expired session: ${sessionId}`)
      }
    })

    if (this.sessions.size > 0) {
      console.log(`📊 Active sessions: ${this.sessions.size}, Total connections: ${this.userSessions.size}`)
      this.sessions.forEach((session, sessionId) => {
        const activeUsers = Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length
        const health = this.calculateSessionHealth(session)
        console.log(`   Session ${sessionId}: ${activeUsers}/${session.users.size} active users, health: ${health.toFixed(1)}%, transfers: ${session.transfersInProgress}`)
      })
    }
  }

  private processRetryQueue(): void {
    const now = Date.now()
    const retryDelay = 30000 // 30 seconds
    const maxRetries = 5

    for (const [messageId, retryData] of this.messageRetryQueue.entries()) {
      if (now - retryData.lastAttempt > retryDelay && retryData.retries < maxRetries) {
        console.log(`🔄 Retrying message delivery: ${messageId} (attempt ${retryData.retries + 1})`)
        
        // Find the session and retry delivery
        const sessionId = retryData.message.sessionId
        if (sessionId) {
          this.broadcastToSessionWithReliability(sessionId, retryData.message)
          retryData.retries++
          retryData.lastAttempt = now
        }
      } else if (retryData.retries >= maxRetries) {
        console.log(`❌ Message delivery failed after ${maxRetries} attempts: ${messageId}`)
        this.messageRetryQueue.delete(messageId)
      }
    }
  }

  private cleanupMessageQueues(): void {
    const now = Date.now()
    let totalCleaned = 0

    this.sessions.forEach((session) => {
      session.messageQueue.forEach((queue, userId) => {
        const originalLength = queue.length

        // Remove messages older than 2 hours
        session.messageQueue.set(
          userId,
          queue.filter((msg) => now - msg.queuedAt < 2 * 60 * 60 * 1000)
        )

        const cleaned = originalLength - queue.length
        totalCleaned += cleaned

        if (queue.length === 0) {
          session.messageQueue.delete(userId)
        }
      })
    })

    if (totalCleaned > 0) {
      console.log(`🧹 Cleaned ${totalCleaned} old queued messages`)
    }
  }

  private monitorConnectionHealth(): void {
    console.log(`🏥 Monitoring connection health for ${this.connectionHealth.size} connections`)

    let healthyConnections = 0
    let degradedConnections = 0
    let unhealthyConnections = 0

    this.connectionHealth.forEach((health, ws) => {
      if (health > 70) {
        healthyConnections++
      } else if (health > 30) {
        degradedConnections++
      } else {
        unhealthyConnections++
        console.log(`⚠️ Unhealthy connection detected (health: ${health}%)`)
      }
    })

    console.log(`🏥 Connection health summary: ${healthyConnections} healthy, ${degradedConnections} degraded, ${unhealthyConnections} unhealthy`)
  }

  private isSessionActive(session: Session): boolean {
    const now = Date.now()
    const lastActivity = now - session.lastActivity.getTime()
    const activeUsers = Array.from(session.users.values()).filter(u => u.ws.readyState === WebSocket.OPEN).length
    
    return lastActivity < 300000 && activeUsers > 0 // Active within 5 minutes and has connected users
  }

  private getDetailedMetrics(): any {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: "5.0.0-enhanced",
      features: [
        "background-persistence",
        "message-queuing",
        "health-monitoring", 
        "adaptive-timeouts",
        "connection-redundancy"
      ],
      connectionHealth: {
        healthy: Array.from(this.connectionHealth.values()).filter(h => h > 70).length,
        degraded: Array.from(this.connectionHealth.values()).filter(h => h > 30 && h <= 70).length,
        unhealthy: Array.from(this.connectionHealth.values()).filter(h => h <= 30).length,
      },
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        userCount: session.users.size,
        activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
        health: this.calculateSessionHealth(session),
        transfersInProgress: session.transfersInProgress,
        messageQueueSize: Array.from(session.messageQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
        users: Array.from(session.users.entries()).map(([userId, userData]) => ({
          userId: userId.substring(0, 8) + "...",
          isInitiator: userData.isInitiator,
          joinedAt: userData.joinedAt,
          lastSeen: userData.lastSeen,
          connected: userData.ws.readyState === WebSocket.OPEN,
          health: this.connectionHealth.get(userData.ws) || 0,
          backgroundMode: userData.backgroundMode,
          networkType: userData.networkType,
          capabilities: userData.capabilities,
        })),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        connectionAttempts: session.connectionAttempts,
      })),
    }
  }

  private shutdown(): void {
    console.log("\n🛑 Shutting down Enhanced Signaling Server...")

    // Notify all clients with enhanced shutdown message
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, { 
          type: "server-shutdown", 
          message: "Enhanced server shutting down gracefully",
          reconnectDelay: 5000,
          alternativeServers: [
            "wss://signaling-server-1ckx.onrender.com",
            "wss://p2p-signaling.herokuapp.com",
          ],
        })
        ws.close(1000, "Server shutdown")
      }
    })

    // Clear all intervals
    this.keepAliveIntervals.forEach(interval => clearInterval(interval))

    this.server.close(() => {
      console.log("✅ Enhanced server shut down gracefully")
      process.exit(0)
    })

    // Force exit after 20 seconds
    setTimeout(() => {
      console.log("⚠️ Force closing enhanced server")
      process.exit(1)
    }, 20000)
  }
}

// Start the enhanced server
const server = new EnhancedSignalingServer()
export default server
