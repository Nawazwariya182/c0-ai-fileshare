import { WebSocketServer, WebSocket } from "ws"
import { createServer } from "http"

interface UserData {
  ws: WebSocket
  userId: string
  joinedAt: Date
  lastSeen: Date
  isInitiator: boolean
  connectionQuality: "excellent" | "good" | "poor"
  lastPing: number
  missedPings: number
  isMobile: boolean
  browser: string
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts: number
  isStable: boolean
  qualityScore: number
  ultraReliable: boolean
}

class UltraFastSignalingServer {
  private wss: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any
  private connectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    reconnections: 0,
    errors: 0,
    ultraFastConnections: 0,
  }

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Initializing Ultra-Fast P2P Signaling Server v4.0...")
    console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`)
    console.log(`🌐 Port: ${port}`)

    this.server = createServer()

    // Ultra-optimized CORS and request handling
    this.server.on("request", (req, res) => {
      const origin = req.headers.origin
      const allowedOrigins = [
        "https://p2p-file-share-fix.vercel.app",
        "https://c0-ai.live",
        "https://vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
      ]

      if (origin && (allowedOrigins.includes(origin) || origin.includes(".vercel.app"))) {
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

      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            status: "ultra-healthy",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "4.0.0-ultra-fast",
            stats: this.connectionStats,
            performance: {
              memoryUsage: process.memoryUsage(),
              cpuUsage: process.cpuUsage(),
            },
          }),
        )
        return
      }

      if (req.url === "/stats") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(this.getDetailedStats()))
        return
      }

      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not Found" }))
    })

    // Ultra-optimized WebSocket server configuration for maximum speed
    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 1, // Fastest compression
          chunkSize: 1024, // Optimized for speed
        },
        threshold: 128, // Lower threshold for better performance
        concurrencyLimit: 100, // Higher concurrency
        serverMaxWindowBits: 12, // Optimized window size
        clientMaxWindowBits: 12,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false,
      },
      maxPayload: 4 * 1024 * 1024 * 1024, // 4GB for large files
      clientTracking: true,
      backlog: 2000, // Higher backlog for better connection handling
      handleProtocols: (protocols) => {
        console.log("📡 WebSocket protocols:", protocols)
        return protocols[0] || false
      },
      verifyClient: (info) => {
        const origin = info.origin
        console.log(`🔍 Verifying ultra-fast client from origin: ${origin}`)

        if (!origin) return true

        const allowedOrigins = [
          "https://p2p-file-share-fix.vercel.app",
          "https://vercel.app",
          "https://c0-ai.live",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "https://localhost:3000",
        ]

        const isAllowed =
          allowedOrigins.includes(origin) ||
          origin.includes(".vercel.app") ||
          origin.includes("localhost") ||
          origin.includes("127.0.0.1")

        console.log(`${isAllowed ? "✅" : "❌"} Origin ${origin} ${isAllowed ? "allowed" : "blocked"}`)
        return isAllowed
      },
    })

    this.wss.on("connection", this.handleConnection.bind(this))
    this.wss.on("error", (error) => {
      console.error("❌ WebSocket Server error:", error)
      this.connectionStats.errors++
    })

    // Ultra-fast session cleanup and optimization
    setInterval(this.cleanupSessions.bind(this), 15000) // Every 15 seconds
    setInterval(this.optimizeConnections.bind(this), 5000) // Every 5 seconds
    setInterval(this.logStats.bind(this), 30000) // Every 30 seconds

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Ultra-Fast Signaling Server started successfully!`)
      console.log(`📡 HTTP server: http://0.0.0.0:${port}`)
      console.log(`🔗 WebSocket server: ws://0.0.0.0:${port}`)
      console.log(`🌍 Health check: http://0.0.0.0:${port}/health`)
      console.log(`📊 Stats: http://0.0.0.0:${port}/stats`)
      console.log(`🚀 Ready for ultra-fast connections`)
      console.log("=".repeat(60))
    })

    this.server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use!`)
        console.log(`💡 Solutions:`)
        console.log(`   Windows: netstat -ano | findstr :${port}`)
        console.log(`   Mac/Linux: lsof -ti:${port} | xargs kill`)
        console.log(`   Or change PORT environment variable`)
      } else {
        console.error("❌ Server error:", error)
      }
      process.exit(1)
    })

    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))

    console.log(`🔧 Ultra-Optimized Configuration:`)
    console.log(`   - Max Payload: 4GB`)
    console.log(`   - Compression: Ultra-fast`)
    console.log(`   - Backlog: 2000 connections`)
    console.log(`   - Auto-optimization: Real-time`)
    console.log(`   - Connection monitoring: Instant`)
  }

  private shutdown() {
    console.log("\n🛑 Gracefully shutting down ultra-fast server...")

    // Notify all clients with instant reconnection
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, {
          type: "server-shutdown",
          message: "Server maintenance - reconnect in 5 seconds",
          reconnectDelay: 5000,
        })
        ws.close(1000, "Server maintenance")
      }
    })

    this.server.close(() => {
      console.log("✅ Server shut down gracefully")
      process.exit(0)
    })

    setTimeout(() => {
      console.log("⚠️ Force closing server")
      process.exit(1)
    }, 3000)
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    const userAgent = req.headers["user-agent"]
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent || "")

    this.connectionStats.totalConnections++
    this.connectionStats.activeConnections++
    this.connectionStats.ultraFastConnections++

    console.log(`🔗 New ultra-fast ${isMobile ? "mobile" : "desktop"} client: ${clientIP}`)
    console.log(`   User-Agent: ${userAgent}`)

    // Immediate ultra-fast connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Ultra-fast connection established",
      timestamp: new Date().toISOString(),
      serverVersion: "4.0.0-ultra-fast",
      features: ["ultra-fast-transfer", "instant-reconnect", "mobile-optimized", "resumable-transfers"],
      clientType: isMobile ? "mobile" : "desktop",
      optimizations: {
        compression: true,
        instantReconnect: true,
        backgroundMode: isMobile,
        chunkOptimization: true,
        maxSpeed: true,
      },
    })

    // Enhanced message handling with ultra-fast processing
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(`📨 ${message.type} from ${clientIP} ${message.sessionId ? `(${message.sessionId})` : ""}`)
        this.handleMessage(ws, message)
      } catch (error) {
        console.error("❌ Invalid message:", error)
        this.sendError(ws, "Invalid message format")
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Client disconnected: ${code} ${reason} (${clientIP})`)
      this.connectionStats.activeConnections--
      this.handleDisconnection(ws)
    })

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error from ${clientIP}:`, error)
      this.connectionStats.errors++
      this.handleDisconnection(ws)
    })

    // Ultra-fast ping/pong for instant responsiveness
    const pingInterval = isMobile ? 2000 : 1000 // Faster for all clients
    let missedPings = 0
    const maxMissedPings = 2 // Reduced for faster detection

    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping("ultra-fast-ping")
        missedPings++

        if (missedPings > maxMissedPings) {
          console.log(`⚠️ Client ${clientIP} missed ${missedPings} pings - closing`)
          ws.close(1008, "Connection timeout")
          clearInterval(pingTimer)
        }
      } else {
        clearInterval(pingTimer)
      }
    }, pingInterval)

    ws.on("pong", () => {
      missedPings = 0 // Reset on successful pong

      // Update user connection quality
      const sessionId = this.userSessions.get(ws)
      if (sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
          const userData = Array.from(session.users.values()).find((u) => u.ws === ws)
          if (userData) {
            userData.lastPing = Date.now()
            userData.missedPings = 0
            userData.connectionQuality = "excellent"
          }
        }
      }
    })

    // Ultra-fast connection timeout
    const connectionTimeout = setTimeout(
      () => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`⏰ Connection timeout for ${clientIP}`)
          ws.close(1008, "Connection timeout")
        }
      },
      isMobile ? 45 * 60 * 1000 : 30 * 60 * 1000,
    ) // Longer timeout for mobile

    ws.on("close", () => {
      clearInterval(pingTimer)
      clearTimeout(connectionTimeout)
    })
  }

  private handleMessage(ws: WebSocket, message: any) {
    const { type, sessionId, userId } = message

    // Enhanced validation
    if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
      this.sendError(ws, "Invalid session ID format")
      return
    }

    if (userId && (typeof userId !== "string" || userId.length < 1 || userId.length > 100)) {
      this.sendError(ws, "Invalid user ID format")
      return
    }

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId, message.reconnect, message.clientInfo)
        break
      case "ping":
        this.handlePing(ws, sessionId, userId)
        break
      case "heartbeat":
        this.handleHeartbeat(ws, sessionId, userId, message.maintain)
        break
      case "keep-alive":
        this.handleKeepAlive(ws, sessionId, userId)
        break
      case "retry-connection":
        this.handleRetryConnection(ws, sessionId, userId)
        break
      case "connection-quality":
        this.handleConnectionQuality(ws, message)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relaySignalingMessage(ws, message)
        break
      case "chat-message":
        this.relayChatMessage(ws, message)
        break
      case "file-chunk":
        this.relayFileChunk(ws, message)
        break
      default:
        console.log(`⚠️ Unknown message type: ${type}`)
        this.sendError(ws, `Unknown message type: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string, isReconnect = false, clientInfo: any = {}) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID are required")
      return
    }

    console.log(`👤 User ${userId} ${isReconnect ? "reconnecting" : "joining"} session ${sessionId}`)
    console.log(`   Client: ${clientInfo.isMobile ? "Mobile" : "Desktop"}, ${clientInfo.browser || "Unknown"}`)

    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        users: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        connectionAttempts: 0,
        isStable: false,
        qualityScore: 100,
        ultraReliable: true,
      }
      this.sessions.set(sessionId, session)
      console.log(`🆕 Created ultra-fast session: ${sessionId}`)
    }

    // Enhanced reconnection handling with instant recovery
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId} reconnecting - instant state recovery`)
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      existingUser.connectionQuality = "excellent"
      existingUser.missedPings = 0
      this.userSessions.set(ws, sessionId)
      session.lastActivity = new Date()
      this.connectionStats.reconnections++

      this.send(ws, {
        type: "joined",
        sessionId,
        userCount: session.users.size,
        userId,
        isInitiator: existingUser.isInitiator,
        reconnected: true,
        sessionState: "maintained",
        optimizations: this.getClientOptimizations(clientInfo),
        ultraFast: true,
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-reconnected",
          userId,
          userCount: session.users.size,
          connectionQuality: "excellent",
          ultraFast: true,
        },
        ws,
      )

      // Immediate connection stability check
      setTimeout(() => this.checkConnectionStability(sessionId), 500)
      return
    }

    if (session.users.size >= 2) {
      console.log(`❌ Session ${sessionId} is full`)
      this.sendError(ws, "Session is full (maximum 2 users)")
      return
    }

    const isInitiator = session.users.size === 0
    const userData: UserData = {
      ws,
      userId,
      joinedAt: new Date(),
      lastSeen: new Date(),
      isInitiator,
      connectionQuality: "excellent",
      lastPing: Date.now(),
      missedPings: 0,
      isMobile: clientInfo?.isMobile || false,
      browser: clientInfo?.browser || "Unknown",
    }

    session.users.set(userId, userData)
    this.userSessions.set(ws, sessionId)
    session.lastActivity = new Date()

    console.log(
      `✅ User ${userId} joined session ${sessionId} (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`,
    )

    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
      sessionCreated: session.createdAt.toISOString(),
      optimizations: this.getClientOptimizations(clientInfo),
      serverCapabilities: {
        maxFileSize: "4GB",
        chunkSize: "2MB",
        parallelTransfers: 16,
        resumableTransfers: true,
        compressionEnabled: true,
        ultraFast: true,
      },
    })

    if (session.users.size === 2) {
      console.log(`🚀 Session ${sessionId} ready - initiating ultra-fast P2P`)
      session.isStable = true

      // Ultra-fast connection initiation
      setTimeout(() => {
        this.broadcastToSession(
          sessionId,
          {
            type: "user-joined",
            userId,
            userCount: session.users.size,
            readyForConnection: true,
            ultraReliable: true,
            ultraFast: true,
          },
          ws,
        )

        // Immediate P2P initiation
        setTimeout(() => {
          this.broadcastToSession(sessionId, {
            type: "initiate-connection",
            timestamp: Date.now(),
            mode: "ultra-reliable",
            optimizations: {
              fastConnect: true,
              parallelNegotiation: true,
              mobileOptimized: true,
              instantRecovery: true,
            },
          })
        }, 25) // Ultra-fast initiation
      }, 25)
    } else {
      this.broadcastToSession(
        sessionId,
        {
          type: "user-joined",
          userId,
          userCount: session.users.size,
        },
        ws,
      )
    }
  }

  private handlePing(ws: WebSocket, sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.lastPing = Date.now()
        user.missedPings = 0
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "pong",
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      quality: "excellent",
      ultraFast: true,
    })
  }

  private handleHeartbeat(ws: WebSocket, sessionId: string, userId: string, maintain = false) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.connectionQuality = "excellent"
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "heartbeat-ack",
      timestamp: Date.now(),
      status: "ultra-healthy",
      maintain: maintain,
    })
  }

  private handleKeepAlive(ws: WebSocket, sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "keep-alive-ack",
      timestamp: Date.now(),
      status: "maintained",
    })
  }

  private handleConnectionQuality(ws: WebSocket, message: any) {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]
    if (userId) {
      const user = session.users.get(userId)
      if (user) {
        user.connectionQuality = message.quality || "excellent"
        session.qualityScore = Math.min(session.qualityScore, message.score || 100)
      }
    }
  }

  private handleRetryConnection(ws: WebSocket, sessionId: string, userId: string) {
    console.log(`🔄 Ultra-fast retry for ${userId} in session ${sessionId}`)

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.connectionAttempts++
    session.lastActivity = new Date()

    // Enhanced retry with immediate response
    this.broadcastToSession(sessionId, {
      type: "retry-connection",
      userId,
      attempt: session.connectionAttempts,
      timestamp: Date.now(),
      mode: "ultra-fast",
      optimizations: {
        skipNegotiation: session.connectionAttempts > 1,
        forceReconnect: true,
        parallelAttempt: true,
        instantRecovery: true,
      },
    })

    // Auto-stabilize after retry
    setTimeout(() => this.checkConnectionStability(sessionId), 1000)
  }

  private relaySignalingMessage(ws: WebSocket, message: any) {
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
    const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]

    if (userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
      }
    }

    // Enhanced message relay with ultra-fast optimization
    const relayMessage = {
      ...message,
      senderId: userId,
      timestamp: Date.now(),
      serverProcessed: new Date().toISOString(),
      optimized: true,
      priority: message.type === "ice-candidate" ? "ultra-high" : "high",
      ultraFast: true,
    }

    // Size check with higher limit for better performance
    const messageSize = JSON.stringify(relayMessage).length
    if (messageSize > 100 * 1024 * 1024) {
      // 100MB limit
      this.sendError(ws, "Message too large")
      return
    }

    console.log(`🔄 Ultra-fast relay ${message.type} from ${userId} (${messageSize} bytes)`)
    this.broadcastToSession(sessionId, relayMessage, ws)
  }

  private relayFileChunk(ws: WebSocket, message: any) {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    session.lastActivity = new Date()

    // Ultra-fast file chunk relay with minimal processing
    const relayMessage = {
      type: "file-chunk",
      chunkId: message.chunkId,
      fileId: message.fileId,
      data: message.data,
      index: message.index,
      total: message.total,
      timestamp: Date.now(),
      compressed: message.compressed || false,
      ultraFast: true,
    }

    this.broadcastToSession(sessionId, relayMessage, ws)
  }

  private relayChatMessage(ws: WebSocket, message: any) {
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
    console.log(`💬 Chat message in session ${sessionId}`)

    this.broadcastToSession(
      sessionId,
      {
        type: "chat-message",
        content: message.content,
        sender: message.sender,
        messageType: message.messageType || "text",
        timestamp: Date.now(),
        ultraFast: true,
      },
      ws,
    )
  }

  private handleDisconnection(ws: WebSocket) {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    let disconnectedUserId: string | undefined

    for (const [userId, userData] of session.users.entries()) {
      if (userData.ws === ws) {
        disconnectedUserId = userId
        userData.lastSeen = new Date(Date.now() - 5000) // Mark as 5 seconds ago
        break
      }
    }

    if (disconnectedUserId) {
      this.userSessions.delete(ws)
      console.log(`👋 User ${disconnectedUserId} disconnected from session ${sessionId}`)

      this.broadcastToSession(sessionId, {
        type: "user-left",
        userId: disconnectedUserId,
        userCount: session.users.size,
        temporary: true,
        timestamp: Date.now(),
        autoReconnect: true,
        ultraFast: true,
      })

      // Ultra-fast cleanup with shorter grace period
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 30000) {
            // 30 seconds grace period
            currentSession.users.delete(disconnectedUserId!)
            console.log(`🗑️ Removed inactive user ${disconnectedUserId}`)

            this.broadcastToSession(sessionId, {
              type: "user-left",
              userId: disconnectedUserId,
              userCount: currentSession.users.size,
              permanent: true,
              timestamp: Date.now(),
            })

            if (currentSession.users.size === 0) {
              this.sessions.delete(sessionId)
              console.log(`🗑️ Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 30000) // 30 seconds
    }
  }

  private checkConnectionStability(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let stableConnections = 0
    session.users.forEach((userData) => {
      if (userData.ws.readyState === WebSocket.OPEN && userData.connectionQuality === "excellent") {
        stableConnections++
      }
    })

    session.isStable = stableConnections === session.users.size

    if (session.isStable) {
      console.log(`✅ Session ${sessionId} is ultra-stable`)
      this.broadcastToSession(sessionId, {
        type: "connection-stable",
        quality: "ultra-reliable",
        timestamp: Date.now(),
        ultraFast: true,
      })
    }
  }

  private optimizeConnections() {
    this.sessions.forEach((session, sessionId) => {
      session.users.forEach((userData, userId) => {
        if (userData.ws.readyState === WebSocket.OPEN) {
          const timeSinceLastPing = Date.now() - userData.lastPing

          if (timeSinceLastPing > 10000) {
            // 10 seconds
            userData.connectionQuality = "poor"
            userData.missedPings++
          } else if (timeSinceLastPing > 5000) {
            // 5 seconds
            userData.connectionQuality = "good"
          } else {
            userData.connectionQuality = "excellent"
          }

          // Send optimization hints for maximum performance
          if (userData.connectionQuality !== "excellent") {
            this.send(userData.ws, {
              type: "optimize-connection",
              quality: userData.connectionQuality,
              suggestions: this.getOptimizationSuggestions(userData.connectionQuality),
            })
          }
        }
      })
    })
  }

  private getOptimizationSuggestions(quality: string) {
    switch (quality) {
      case "poor":
        return {
          reduceChunkSize: true,
          enableCompression: true,
          increaseTimeout: true,
          fallbackMode: true,
        }
      case "good":
        return {
          maintainChunkSize: true,
          enableCompression: false,
          normalTimeout: true,
        }
      default:
        return {
          maxPerformance: true,
          parallelTransfers: true,
          largeChunks: true,
          ultraFast: true,
        }
    }
  }

  private getClientOptimizations(clientInfo: any) {
    return {
      chunkSize: clientInfo?.isMobile ? 1024 * 1024 : 2 * 1024 * 1024, // 1MB for mobile, 2MB for desktop
      compression: clientInfo?.isMobile ? true : false,
      heartbeatInterval: clientInfo?.isMobile ? 2000 : 1000,
      reconnectDelay: clientInfo?.isMobile ? 200 : 100,
      backgroundMode: clientInfo?.isMobile ? true : false,
      parallelTransfers: clientInfo?.isMobile ? 8 : 16,
      ultraFast: true,
    }
  }

  private broadcastToSession(sessionId: string, message: any, excludeWs?: WebSocket) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let sentCount = 0
    let failedCount = 0

    session.users.forEach((userData) => {
      if (userData.ws !== excludeWs && userData.ws.readyState === WebSocket.OPEN) {
        try {
          this.send(userData.ws, message)
          sentCount++
        } catch (error) {
          console.error(`❌ Failed to send to user:`, error)
          failedCount++
        }
      }
    })

    if (sentCount > 0) {
      console.log(`📡 Ultra-fast broadcast ${message.type} to ${sentCount} users`)
    }
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Send error:", error)
      }
    }
  }

  private sendError(ws: WebSocket, message: string) {
    console.error(`❌ Error: ${message}`)
    this.send(ws, {
      type: "error",
      message,
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      recoverable: true,
      ultraFast: true,
    })
  }

  private cleanupSessions() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()

      // Longer timeout for stable sessions
      const timeoutDuration = session.isStable ? 60 * 60 * 1000 : 30 * 60 * 1000 // 60 or 30 minutes

      if (inactiveTime > timeoutDuration) {
        expiredSessions.push(sessionId)
      } else {
        // Clean up inactive users
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 10 * 60 * 1000) {
            // 10 minutes
            inactiveUsers.push(userId)
          }
        })

        inactiveUsers.forEach((userId) => {
          session.users.delete(userId)
          console.log(`🧹 Cleaned inactive user ${userId}`)
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
          this.send(userData.ws, {
            type: "session-expired",
            message: "Session expired - please reconnect",
            reconnectDelay: 3000,
          })
          userData.ws.close(1000, "Session expired")
        })
        this.sessions.delete(sessionId)
        console.log(`⏰ Expired session: ${sessionId}`)
      }
    })
  }

  private logStats() {
    if (this.sessions.size > 0 || this.connectionStats.activeConnections > 0) {
      console.log(
        `📊 Ultra-Fast Stats: ${this.sessions.size} sessions, ${this.connectionStats.activeConnections} connections`,
      )
      console.log(
        `   Total: ${this.connectionStats.totalConnections}, Reconnects: ${this.connectionStats.reconnections}, Errors: ${this.connectionStats.errors}`,
      )
      console.log(`   Ultra-Fast Connections: ${this.connectionStats.ultraFastConnections}`)
    }
  }

  private getDetailedStats() {
    return {
      activeSessions: this.sessions.size,
      totalConnections: this.userSessions.size,
      stats: this.connectionStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        userCount: session.users.size,
        isStable: session.isStable,
        qualityScore: session.qualityScore,
        ultraReliable: session.ultraReliable,
        activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
        users: Array.from(session.users.entries()).map(([userId, userData]) => ({
          userId,
          isInitiator: userData.isInitiator,
          connectionQuality: userData.connectionQuality,
          joinedAt: userData.joinedAt,
          lastSeen: userData.lastSeen,
          connected: userData.ws.readyState === WebSocket.OPEN,
          missedPings: userData.missedPings,
          isMobile: userData.isMobile,
          browser: userData.browser,
        })),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        connectionAttempts: session.connectionAttempts,
      })),
    }
  }
}

// Enhanced port checking and startup
async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(port, () => {
      server.close(() => resolve(true))
    })
    server.on("error", () => resolve(false))
  })
}

async function startServer() {
  const port = process.env.PORT || 8080
  console.log(`🔍 Checking port ${port} availability...`)

  try {
    const isPortAvailable = await checkPort(Number(port))
    if (!isPortAvailable) {
      console.error(`❌ Port ${port} is already in use!`)
      console.log("💡 Solutions:")
      console.log("   1. Kill existing process:")
      console.log(`      Windows: netstat -ano | findstr :${port}`)
      console.log(`      Mac/Linux: lsof -ti:${port} | xargs kill`)
      console.log("   2. Set different PORT environment variable")
      process.exit(1)
    }

    console.log(`✅ Port ${port} is available`)
    new UltraFastSignalingServer(Number(port))
  } catch (error) {
    console.error("❌ Startup error:", error)
    process.exit(1)
  }
}

// Enhanced error handling
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", promise, "reason:", reason)
  process.exit(1)
})

startServer()

export default UltraFastSignalingServer
