import { WebSocketServer, WebSocket } from "ws"
import { createServer } from "http"

interface UserData {
  ws: WebSocket
  userId: string
  joinedAt: Date
  lastSeen: Date
  isInitiator: boolean
  connectionQuality?: "excellent" | "good" | "poor"
  lastPing?: number
  missedPings?: number
  isMobile?: boolean
  browser?: string
  isStable?: boolean
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts?: number
  isStable?: boolean
  qualityScore?: number
  rockSolid?: boolean
}

class EnhancedBulletproofSignalingServer {
  private wss: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any
  private connectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    reconnections: 0,
    errors: 0,
    p2pConnections: 0,
    stabilityScore: 100,
  }

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Starting Enhanced Bulletproof Signaling Server...")
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

      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")
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
            status: "enhanced-bulletproof",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "2.0.0-enhanced",
            stats: this.connectionStats,
            activeSessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
              id,
              userCount: session.users.size,
              isStable: session.isStable,
              lastActivity: session.lastActivity,
            })),
          }),
        )
        return
      }

      res.writeHead(404)
      res.end("Not Found")
    })

    // Enhanced WebSocket server
    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
      },
      maxPayload: 100 * 1024 * 1024, // 100MB
      clientTracking: true,
      verifyClient: (info) => {
        const origin = info.origin
        console.log(`🔍 Verifying client from: ${origin}`)

        if (!origin) return true

        const allowedOrigins = [
          "https://p2p-file-share-fix.vercel.app",
          "https://c0-ai.live",
          "https://vercel.app",
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

    // Enhanced session management
    setInterval(this.cleanup.bind(this), 2 * 60 * 1000) // Every 2 minutes
    setInterval(this.logStats.bind(this), 30 * 1000) // Every 30 seconds

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Enhanced Bulletproof server running on port ${port}`)
      console.log(`🌍 Health check: http://0.0.0.0:${port}/health`)
      console.log("=".repeat(60))
    })

    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private shutdown() {
    console.log("🛑 Shutting down enhanced server...")
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
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    const userAgent = req.headers["user-agent"]
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent || "")

    this.connectionStats.totalConnections++
    this.connectionStats.activeConnections++

    console.log(`🔗 New ${isMobile ? "mobile" : "desktop"} client: ${clientIP}`)

    // Send immediate connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Enhanced bulletproof connection established",
      timestamp: new Date().toISOString(),
      serverVersion: "2.0.0-enhanced",
      features: ["bulletproof-p2p", "stable-signaling", "enhanced-reliability"],
    })

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(`📨 ${message.type} from ${clientIP} ${message.sessionId ? `(${message.sessionId})` : ""}`)
        this.handleMessage(ws, message)
      } catch (error) {
        console.error("❌ Message parse error:", error)
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

    // Enhanced ping/pong with longer intervals for stability
    let missedPings = 0
    const maxMissedPings = 3

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping("enhanced-ping")
        missedPings++

        if (missedPings > maxMissedPings) {
          console.log(`⚠ Client ${clientIP} missed ${missedPings} pings - closing`)
          ws.close(1008, "Connection timeout")
          clearInterval(pingInterval)
        }
      } else {
        clearInterval(pingInterval)
      }
    }, 30000) // 30 second ping interval

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
            userData.isStable = true
          }
        }
      }
    })

    ws.on("close", () => {
      clearInterval(pingInterval)
    })
  }

  private handleMessage(ws: WebSocket, message: any) {
    const { type, sessionId, userId } = message

    // Enhanced validation
    if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
      this.sendError(ws, "Invalid session ID format")
      return
    }

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId, message.clientInfo)
        break
      case "ping":
        this.handlePing(ws, sessionId, userId)
        break
      case "keep-alive":
        this.handleKeepAlive(ws, sessionId, userId)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relaySignalingMessage(ws, message)
        break
      default:
        console.log(`⚠ Unknown message type: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string, clientInfo: any = {}) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID are required")
      return
    }

    console.log(`👤 User ${userId} joining session ${sessionId}`)
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
      console.log(`🆕 Created enhanced session: ${sessionId}`)
    }

    // Handle reconnection
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId} reconnecting - maintaining state`)
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
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
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-joined",
          userId,
          userCount: session.users.size,
          reconnected: true,
        },
        ws,
      )

      return
    }

    // Check capacity
    if (session.users.size >= 2) {
      console.log(`❌ Session ${sessionId} is full`)
      this.sendError(ws, "Session is full (maximum 2 users)")
      return
    }

    // Add new user
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
      serverCapabilities: {
        maxFileSize: "100MB",
        chunkSize: "64KB",
        resumableTransfers: true,
        enhancedStability: true,
      },
    })

    this.broadcastToSession(
      sessionId,
      {
        type: "user-joined",
        userId,
        userCount: session.users.size,
        readyForP2P: session.users.size === 2,
      },
      ws,
    )

    // Enhanced P2P initiation for 2 users
    if (session.users.size === 2) {
      console.log(`🚀 Session ${sessionId} ready - enhanced P2P initiation`)
      session.isStable = true
      this.connectionStats.p2pConnections++

      // Staggered P2P initiation for better reliability
      setTimeout(() => {
        this.broadcastToSession(sessionId, {
          type: "p2p-ready",
          message: "Both users connected - P2P can be initiated",
          timestamp: Date.now(),
          enhanced: true,
        })
      }, 1000) // 1 second delay for stability
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
      enhanced: true,
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
    })
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
      enhanced: true,
    }

    console.log(`🔄 Enhanced relay ${message.type} from ${userId}`)
    this.broadcastToSession(sessionId, relayMessage, ws)
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
        userData.lastSeen = new Date()
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
      })

      // Enhanced cleanup with longer grace period
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 45000) {
            // 45 seconds grace period
            currentSession.users.delete(disconnectedUserId!)
            console.log(`🗑 Removed inactive user ${disconnectedUserId}`)

            this.broadcastToSession(sessionId, {
              type: "user-left",
              userId: disconnectedUserId,
              userCount: currentSession.users.size,
              permanent: true,
              timestamp: Date.now(),
            })

            if (currentSession.users.size === 0) {
              this.sessions.delete(sessionId)
              console.log(`🗑 Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 45000) // 45 seconds
    }
  }

  private broadcastToSession(sessionId: string, message: any, excludeWs?: WebSocket) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let sentCount = 0
    session.users.forEach((userData) => {
      if (userData.ws !== excludeWs && userData.ws.readyState === WebSocket.OPEN) {
        try {
          this.send(userData.ws, message)
          sentCount++
        } catch (error) {
          console.error("❌ Broadcast error:", error)
        }
      }
    })

    if (sentCount > 0) {
      console.log(`📡 Enhanced broadcast ${message.type} to ${sentCount} users`)
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
      recoverable: true,
      enhanced: true,
    })
  }

  private cleanup() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()

      // Extended timeout for enhanced sessions
      const timeoutDuration = session.isStable ? 3 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000 // 3 or 2 hours

      if (inactiveTime > timeoutDuration) {
        expiredSessions.push(sessionId)
      } else {
        // Clean inactive users
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
        `📊 Enhanced Stats: ${this.sessions.size} sessions, ${this.connectionStats.activeConnections} connections`,
      )
      console.log(
        `   Total: ${this.connectionStats.totalConnections}, P2P: ${this.connectionStats.p2pConnections}, Reconnects: ${this.connectionStats.reconnections}`,
      )
    }
  }
}

// Start enhanced server
const port = process.env.PORT || 8080
new EnhancedBulletproofSignalingServer(Number(port))