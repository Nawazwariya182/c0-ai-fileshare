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
  isStable: boolean
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts: number
  isStable: boolean
  qualityScore: number
  rockSolid: boolean
}

class RockSolidSignalingServer {
  private wss: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any
  private connectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    reconnections: 0,
    errors: 0,
    rockSolidConnections: 0,
    stabilityScore: 100,
  }

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Initializing Rock-Solid P2P Signaling Server v6.0...")
    console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`)
    console.log(`🌐 Port: ${port}`)

    this.server = createServer()

    // Enhanced CORS handling
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
            status: "rock-solid",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "6.0.0-rock-solid",
            stats: this.connectionStats,
            performance: {
              memoryUsage: process.memoryUsage(),
              cpuUsage: process.cpuUsage(),
            },
            stability: {
              score: this.connectionStats.stabilityScore,
              rockSolidConnections: this.connectionStats.rockSolidConnections,
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

    // Rock-solid WebSocket server configuration
    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 1,
          chunkSize: 1024,
        },
        threshold: 128,
        concurrencyLimit: 100,
        serverMaxWindowBits: 12,
        clientMaxWindowBits: 12,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false,
      },
      maxPayload: 4 * 1024 * 1024 * 1024, // 4GB
      clientTracking: true,
      backlog: 2000,
      handleProtocols: (protocols) => {
        console.log("📡 WebSocket protocols:", protocols)
        return protocols[0] || false
      },
      verifyClient: (info) => {
        const origin = info.origin
        console.log(`🔍 Verifying rock-solid client from origin: ${origin}`)

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
      this.connectionStats.stabilityScore = Math.max(0, this.connectionStats.stabilityScore - 3)
    })

    // Rock-solid session management with longer intervals for stability
    setInterval(this.cleanupSessions.bind(this), 30000) // Every 30 seconds
    setInterval(this.optimizeConnections.bind(this), 10000) // Every 10 seconds
    setInterval(this.monitorStability.bind(this), 5000) // Every 5 seconds
    setInterval(this.logStats.bind(this), 60000) // Every 60 seconds

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Rock-Solid Signaling Server started successfully!`)
      console.log(`📡 HTTP server: http://0.0.0.0:${port}`)
      console.log(`🔗 WebSocket server: ws://0.0.0.0:${port}`)
      console.log(`🌍 Health check: http://0.0.0.0:${port}/health`)
      console.log(`📊 Stats: http://0.0.0.0:${port}/stats`)
      console.log(`🚀 Ready for rock-solid connections`)
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

    console.log(`🔧 Rock-Solid Configuration:`)
    console.log(`   - Max Payload: 4GB`)
    console.log(`   - Compression: Optimized`)
    console.log(`   - Backlog: 2000 connections`)
    console.log(`   - Auto-optimization: Stable intervals`)
    console.log(`   - Stability monitoring: Enhanced`)
    console.log(`   - Connection persistence: Maximum`)
  }

  private shutdown() {
    console.log("\n🛑 Gracefully shutting down rock-solid server...")

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, {
          type: "server-shutdown",
          message: "Server maintenance - reconnect in 5 seconds",
          reconnectDelay: 5000,
          rockSolid: true,
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
    this.connectionStats.rockSolidConnections++

    console.log(`🔗 New rock-solid ${isMobile ? "mobile" : "desktop"} client: ${clientIP}`)
    console.log(`   User-Agent: ${userAgent}`)

    // Immediate rock-solid connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Rock-solid connection established",
      timestamp: new Date().toISOString(),
      serverVersion: "6.0.0-rock-solid",
      features: [
        "rock-solid-transfer",
        "stable-reconnect",
        "mobile-optimized",
        "resumable-transfers",
        "persistent-connection",
      ],
      clientType: isMobile ? "mobile" : "desktop",
      optimizations: {
        compression: true,
        stableReconnect: true,
        backgroundMode: isMobile,
        chunkOptimization: true,
        maxStability: true,
        rockSolid: true,
      },
    })

    // Enhanced message handling with rock-solid processing
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
      this.connectionStats.stabilityScore = Math.max(0, this.connectionStats.stabilityScore - 1)
      this.handleDisconnection(ws)
    })

    // Rock-solid ping/pong with stable intervals
    const pingInterval = isMobile ? 10000 : 5000 // Longer intervals for stability
    let missedPings = 0
    const maxMissedPings = 3 // More tolerance

    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping("rock-solid-ping")
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
      missedPings = 0

      const sessionId = this.userSessions.get(ws)
      if (sessionId) {
        const session = this.sessions.get(sessionId)
        if (session) {
          const userData = Array.from(session.users.values()).find((u) => u.ws === ws)
          if (userData) {
            userData.lastPing = Date.now()
            userData.missedPings = 0
            userData.connectionQuality = "excellent"
            userData.isStable = true
          }
        }
      }
    })

    // Rock-solid connection timeout with longer duration
    const connectionTimeout = setTimeout(
      () => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`⏰ Connection timeout for ${clientIP}`)
          ws.close(1008, "Connection timeout")
        }
      },
      isMobile ? 120 * 60 * 1000 : 90 * 60 * 1000,
    ) // 2 hours for mobile, 1.5 hours for desktop

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
        rockSolid: true,
      }
      this.sessions.set(sessionId, session)
      console.log(`🆕 Created rock-solid session: ${sessionId}`)
    }

    // Enhanced reconnection handling
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId} reconnecting - maintaining state`)
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      existingUser.connectionQuality = "excellent"
      existingUser.missedPings = 0
      existingUser.isStable = true
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
        rockSolid: true,
        stabilityScore: session.qualityScore,
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-reconnected",
          userId,
          userCount: session.users.size,
          connectionQuality: "excellent",
          rockSolid: true,
          stabilityScore: session.qualityScore,
        },
        ws,
      )

      // Stability check after reconnection
      setTimeout(() => this.checkConnectionStability(sessionId), 2000)
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
      isStable: true,
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
        rockSolid: true,
        persistentConnection: true,
      },
      stabilityScore: session.qualityScore,
    })

    if (session.users.size === 2) {
      console.log(`🚀 Session ${sessionId} ready - initiating rock-solid P2P`)
      session.isStable = true

      // Rock-solid connection initiation with stable timing
      setTimeout(() => {
        this.broadcastToSession(
          sessionId,
          {
            type: "user-joined",
            userId,
            userCount: session.users.size,
            readyForConnection: true,
            rockSolid: true,
            stabilityScore: session.qualityScore,
          },
          ws,
        )

        // P2P initiation with stable delay
        setTimeout(() => {
          this.broadcastToSession(sessionId, {
            type: "initiate-connection",
            timestamp: Date.now(),
            mode: "ultra-stable",
            optimizations: {
              stableConnect: true,
              parallelNegotiation: true,
              mobileOptimized: true,
              persistentRecovery: true,
              rockSolid: true,
            },
          })
        }, 1000) // 1 second stable initiation
      }, 500) // 500ms stable delay
    } else {
      this.broadcastToSession(
        sessionId,
        {
          type: "user-joined",
          userId,
          userCount: session.users.size,
          rockSolid: true,
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
        user.isStable = true
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "pong",
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      quality: "excellent",
      rockSolid: true,
      stabilityScore: this.connectionStats.stabilityScore,
    })
  }

  private handleHeartbeat(ws: WebSocket, sessionId: string, userId: string, maintain = false) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.connectionQuality = "excellent"
        user.isStable = true
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "heartbeat-ack",
      timestamp: Date.now(),
      status: "rock-solid",
      maintain: maintain,
      stabilityScore: this.connectionStats.stabilityScore,
    })
  }

  private handleKeepAlive(ws: WebSocket, sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.isStable = true
        session.lastActivity = new Date()
      }
    }

    this.send(ws, {
      type: "keep-alive-ack",
      timestamp: Date.now(),
      status: "maintained",
      rockSolid: true,
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
        user.isStable = message.quality === "excellent"
        session.qualityScore = Math.min(session.qualityScore, message.score || 100)
      }
    }
  }

  private handleRetryConnection(ws: WebSocket, sessionId: string, userId: string) {
    console.log(`🔄 Rock-solid retry for ${userId} in session ${sessionId}`)

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.connectionAttempts++
    session.lastActivity = new Date()

    this.broadcastToSession(sessionId, {
      type: "retry-connection",
      userId,
      attempt: session.connectionAttempts,
      timestamp: Date.now(),
      mode: "rock-solid",
      optimizations: {
        skipNegotiation: session.connectionAttempts > 1,
        stableReconnect: true,
        parallelAttempt: true,
        persistentRecovery: true,
        rockSolid: true,
      },
    })

    setTimeout(() => this.checkConnectionStability(sessionId), 3000)
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
        user.isStable = true
      }
    }

    const relayMessage = {
      ...message,
      senderId: userId,
      timestamp: Date.now(),
      serverProcessed: new Date().toISOString(),
      optimized: true,
      priority: message.type === "ice-candidate" ? "high" : "normal",
      rockSolid: true,
      stabilityScore: session.qualityScore,
    }

    const messageSize = JSON.stringify(relayMessage).length
    if (messageSize > 50 * 1024 * 1024) {
      // 50MB limit
      this.sendError(ws, "Message too large")
      return
    }

    console.log(`🔄 Rock-solid relay ${message.type} from ${userId} (${messageSize} bytes)`)
    this.broadcastToSession(sessionId, relayMessage, ws)
  }

  private relayFileChunk(ws: WebSocket, message: any) {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    session.lastActivity = new Date()

    const relayMessage = {
      type: "file-chunk",
      chunkId: message.chunkId,
      fileId: message.fileId,
      data: message.data,
      index: message.index,
      total: message.total,
      timestamp: Date.now(),
      compressed: message.compressed || false,
      rockSolid: true,
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
        rockSolid: true,
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
        userData.isStable = false
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
        rockSolid: true,
      })

      // Rock-solid cleanup with extended grace period
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 60000) {
            // 60 seconds grace period
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
      }, 60000) // 60 seconds
    }
  }

  private checkConnectionStability(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let stableConnections = 0
    session.users.forEach((userData) => {
      if (
        userData.ws.readyState === WebSocket.OPEN &&
        userData.isStable &&
        userData.connectionQuality === "excellent"
      ) {
        stableConnections++
      }
    })

    session.isStable = stableConnections === session.users.size

    if (session.isStable) {
      console.log(`✅ Session ${sessionId} is rock-solid`)
      this.broadcastToSession(sessionId, {
        type: "connection-stable",
        quality: "rock-solid",
        timestamp: Date.now(),
        stabilityScore: session.qualityScore,
        rockSolid: true,
      })
    }
  }

  private monitorStability() {
    let totalStability = 0
    let stableSessions = 0

    this.sessions.forEach((session, sessionId) => {
      let sessionStability = 0
      let activeUsers = 0

      session.users.forEach((userData, userId) => {
        if (userData.ws.readyState === WebSocket.OPEN) {
          activeUsers++
          const timeSinceLastPing = Date.now() - userData.lastPing

          if (timeSinceLastPing < 15000 && userData.isStable) {
            // < 15 seconds
            userData.connectionQuality = "excellent"
            sessionStability += 100
          } else if (timeSinceLastPing < 30000) {
            // < 30 seconds
            userData.connectionQuality = "good"
            sessionStability += 70
          } else {
            userData.connectionQuality = "poor"
            userData.isStable = false
            sessionStability += 30
          }
        }
      })

      if (activeUsers > 0) {
        const avgStability = sessionStability / activeUsers
        session.qualityScore = avgStability
        totalStability += avgStability
        stableSessions++

        if (avgStability < 70) {
          this.broadcastToSession(sessionId, {
            type: "optimize-connection",
            quality: avgStability > 50 ? "good" : "poor",
            suggestions: this.getOptimizationSuggestions(avgStability > 50 ? "good" : "poor"),
            stabilityScore: avgStability,
          })
        }
      }
    })

    if (stableSessions > 0) {
      this.connectionStats.stabilityScore = Math.round(totalStability / stableSessions)
    }
  }

  private optimizeConnections() {
    this.sessions.forEach((session, sessionId) => {
      session.users.forEach((userData, userId) => {
        if (userData.ws.readyState === WebSocket.OPEN) {
          const timeSinceLastPing = Date.now() - userData.lastPing

          if (timeSinceLastPing > 30000) {
            // 30 seconds
            userData.connectionQuality = "poor"
            userData.isStable = false
            userData.missedPings++
          } else if (timeSinceLastPing > 15000) {
            // 15 seconds
            userData.connectionQuality = "good"
            userData.isStable = true
          } else {
            userData.connectionQuality = "excellent"
            userData.isStable = true
          }

          if (!userData.isStable) {
            this.send(userData.ws, {
              type: "optimize-connection",
              quality: userData.connectionQuality,
              suggestions: this.getOptimizationSuggestions(userData.connectionQuality),
              stabilityScore: session.qualityScore,
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
          stableMode: true,
          rockSolid: true,
        }
      case "good":
        return {
          maintainChunkSize: true,
          enableCompression: false,
          normalTimeout: true,
          stableMode: false,
        }
      default:
        return {
          maxPerformance: true,
          parallelTransfers: true,
          largeChunks: true,
          rockSolid: true,
          persistentConnection: true,
        }
    }
  }

  private getClientOptimizations(clientInfo: any) {
    return {
      chunkSize: clientInfo?.isMobile ? 1024 * 1024 : 2 * 1024 * 1024,
      compression: clientInfo?.isMobile ? true : false,
      heartbeatInterval: clientInfo?.isMobile ? 10000 : 5000,
      reconnectDelay: clientInfo?.isMobile ? 2000 : 1000,
      backgroundMode: clientInfo?.isMobile ? true : false,
      parallelTransfers: clientInfo?.isMobile ? 8 : 16,
      rockSolid: true,
      persistentConnection: true,
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
      console.log(`📡 Rock-solid broadcast ${message.type} to ${sentCount} users`)
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
      rockSolid: true,
    })
  }

  private cleanupSessions() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()

      // Extended timeout for rock-solid sessions
      const timeoutDuration = session.isStable ? 180 * 60 * 1000 : 120 * 60 * 1000 // 3 or 2 hours

      if (inactiveTime > timeoutDuration) {
        expiredSessions.push(sessionId)
      } else {
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 60 * 60 * 1000) {
            // 60 minutes
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
            reconnectDelay: 5000,
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
        `📊 Rock-Solid Stats: ${this.sessions.size} sessions, ${this.connectionStats.activeConnections} connections`,
      )
      console.log(
        `   Total: ${this.connectionStats.totalConnections}, Reconnects: ${this.connectionStats.reconnections}, Errors: ${this.connectionStats.errors}`,
      )
      console.log(
        `   Rock-Solid Connections: ${this.connectionStats.rockSolidConnections}, Stability Score: ${this.connectionStats.stabilityScore}%`,
      )
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
        rockSolid: session.rockSolid,
        activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
        users: Array.from(session.users.entries()).map(([userId, userData]) => ({
          userId,
          isInitiator: userData.isInitiator,
          connectionQuality: userData.connectionQuality,
          isStable: userData.isStable,
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

// Enhanced startup
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
    new RockSolidSignalingServer(Number(port))
  } catch (error) {
    console.error("❌ Startup error:", error)
    process.exit(1)
  }
}

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", promise, "reason:", reason)
  process.exit(1)
})

startServer()

export default RockSolidSignalingServer
