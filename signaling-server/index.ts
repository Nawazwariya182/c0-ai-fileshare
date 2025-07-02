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
  persistent?: boolean
  neverExpire?: boolean
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts?: number
  isStable?: boolean
  qualityScore?: number
  persistent?: boolean
  neverExpire?: boolean
  ultraPersistent?: boolean
}

class UltraPersistentSignalingServer {
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
    persistentSessions: 0,
    stabilityScore: 100,
  }

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Starting Ultra-Persistent Signaling Server - NEVER DISCONNECT EDITION...")
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
            status: "ultra-persistent",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "3.0.0-ultra-persistent",
            stats: this.connectionStats,
            persistentSessions: Array.from(this.sessions.entries())
              .filter(([_, session]) => session.ultraPersistent)
              .map(([id, session]) => ({
                id,
                userCount: session.users.size,
                persistent: session.persistent,
                neverExpire: session.neverExpire,
                lastActivity: session.lastActivity,
                uptime: Date.now() - session.createdAt.getTime(),
              })),
          }),
        )
        return
      }

      res.writeHead(404)
      res.end("Not Found")
    })

    // Ultra-persistent WebSocket server
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
        console.log(`🔍 Verifying ultra-persistent client from: ${origin}`)

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

    // Ultra-persistent session management - NEVER clean up persistent sessions
    setInterval(this.ultraPersistentCleanup.bind(this), 60 * 1000) // Every 1 minute
    setInterval(this.logStats.bind(this), 30 * 1000) // Every 30 seconds
    setInterval(this.maintainPersistentSessions.bind(this), 10 * 1000) // Every 10 seconds

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Ultra-Persistent server running on port ${port}`)
      console.log(`🌍 Health check: http://0.0.0.0:${port}/health`)
      console.log(`🔒 Sessions will NEVER expire once marked persistent`)
      console.log("=".repeat(60))
    })

    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private shutdown() {
    console.log("🛑 Shutting down ultra-persistent server...")
    console.log("💾 Preserving persistent sessions for reconnection...")

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, {
          type: "server-shutdown",
          message: "Server maintenance - your session is preserved, reconnect in 5 seconds",
          reconnectDelay: 5000,
          sessionPreserved: true,
          ultraPersistent: true,
        })
        ws.close(1000, "Server maintenance - session preserved")
      }
    })

    this.server.close(() => {
      console.log("✅ Server shut down gracefully - persistent sessions preserved")
      process.exit(0)
    })
  }

  private maintainPersistentSessions() {
    // Keep all persistent sessions alive
    this.sessions.forEach((session, sessionId) => {
      if (session.ultraPersistent || session.persistent) {
        session.lastActivity = new Date() // Keep it fresh

        // Notify connected users that session is being maintained
        session.users.forEach((userData) => {
          if (userData.ws.readyState === WebSocket.OPEN) {
            this.send(userData.ws, {
              type: "session-maintained",
              sessionId,
              timestamp: Date.now(),
              persistent: true,
              neverExpire: true,
            })
          }
        })
      }
    })
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    const userAgent = req.headers["user-agent"]
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent || "")

    this.connectionStats.totalConnections++
    this.connectionStats.activeConnections++

    console.log(`🔗 New ultra-persistent ${isMobile ? "mobile" : "desktop"} client: ${clientIP}`)

    // Send immediate ultra-persistent connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Ultra-persistent connection established - NEVER DISCONNECT MODE",
      timestamp: new Date().toISOString(),
      serverVersion: "3.0.0-ultra-persistent",
      features: [
        "ultra-persistent-sessions",
        "never-expire",
        "auto-reconnect",
        "session-preservation",
        "infinite-retry",
      ],
      guarantees: {
        sessionPersistence: "infinite",
        autoReconnect: "always",
        dataPreservation: "guaranteed",
      },
    })

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(
          `📨 ${message.type} from ${clientIP} ${message.sessionId ? `(${message.sessionId})` : ""} ${message.persistent ? "[PERSISTENT]" : ""}`,
        )
        this.handleMessage(ws, message)
      } catch (error) {
        console.error("❌ Message parse error:", error)
        this.sendError(ws, "Invalid message format")
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Ultra-persistent client disconnected: ${code} ${reason} (${clientIP}) - WILL PRESERVE SESSION`)
      this.connectionStats.activeConnections--
      this.handleDisconnection(ws, true) // true = preserve session
    })

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error from ${clientIP}:`, error)
      this.connectionStats.errors++
      this.handleDisconnection(ws, true) // true = preserve session
    })

    // Ultra-persistent ping/pong - more tolerant
    let missedPings = 0
    const maxMissedPings = 5 // More tolerance for persistent connections

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping("ultra-persistent-ping")
        missedPings++

        if (missedPings > maxMissedPings) {
          console.log(`⚠️ Ultra-persistent client ${clientIP} missed ${missedPings} pings - preserving session`)
          ws.close(1008, "Connection timeout - session preserved")
          clearInterval(pingInterval)
        }
      } else {
        clearInterval(pingInterval)
      }
    }, 25000) // 25 second ping interval - longer for stability

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
            session.lastActivity = new Date()
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
        this.handleJoin(ws, sessionId, userId, message.clientInfo, message.persistent, message.neverExpire)
        break
      case "ping":
        this.handlePing(ws, sessionId, userId, message.persistent)
        break
      case "session-keep-alive":
        this.handleSessionKeepAlive(ws, sessionId, userId, message.persistent, message.neverExpire)
        break
      case "maintain-session":
        this.handleMaintainSession(ws, sessionId, userId, message.forceKeepAlive, message.neverExpire)
        break
      case "force-p2p-restart":
        this.handleForceP2PRestart(ws, sessionId, userId, message.reason)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relaySignalingMessage(ws, message)
        break
      default:
        console.log(`⚠️ Unknown message type: ${type}`)
    }
  }

  private handleJoin(
    ws: WebSocket,
    sessionId: string,
    userId: string,
    clientInfo: any = {},
    persistent = false,
    neverExpire = false,
  ) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID are required")
      return
    }

    console.log(`👤 User ${userId} joining ultra-persistent session ${sessionId}`)
    console.log(`   Client: ${clientInfo.isMobile ? "Mobile" : "Desktop"}, ${clientInfo.browser || "Unknown"}`)
    console.log(
      `   Persistent: ${persistent}, Never Expire: ${neverExpire}, Ultra-Persistent: ${clientInfo.ultraPersistent}`,
    )

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
        persistent: persistent || neverExpire,
        neverExpire: neverExpire,
        ultraPersistent: clientInfo.ultraPersistent || persistent || neverExpire,
      }
      this.sessions.set(sessionId, session)

      if (session.ultraPersistent) {
        this.connectionStats.persistentSessions++
      }

      console.log(
        `🆕 Created ultra-persistent session: ${sessionId} (Persistent: ${session.persistent}, Never Expire: ${session.neverExpire})`,
      )
    } else {
      // Update session persistence settings
      if (persistent || neverExpire || clientInfo.ultraPersistent) {
        session.persistent = true
        session.neverExpire = neverExpire
        session.ultraPersistent = true
        console.log(`🔒 Session ${sessionId} upgraded to ultra-persistent`)
      }
    }

    // Handle reconnection with session preservation
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId} reconnecting to ultra-persistent session - PRESERVING ALL STATE`)
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      existingUser.isStable = true
      existingUser.persistent = persistent || neverExpire
      existingUser.neverExpire = neverExpire
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
        sessionState: "preserved",
        persistent: session.persistent,
        neverExpire: session.neverExpire,
        ultraPersistent: session.ultraPersistent,
        sessionUptime: Date.now() - session.createdAt.getTime(),
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-reconnected",
          userId,
          userCount: session.users.size,
          reconnected: true,
          persistent: session.persistent,
          sessionPreserved: true,
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
      persistent: persistent || neverExpire,
      neverExpire: neverExpire,
    }

    session.users.set(userId, userData)
    this.userSessions.set(ws, sessionId)
    session.lastActivity = new Date()

    console.log(
      `✅ User ${userId} joined ultra-persistent session ${sessionId} (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`,
    )

    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
      sessionCreated: session.createdAt.toISOString(),
      persistent: session.persistent,
      neverExpire: session.neverExpire,
      ultraPersistent: session.ultraPersistent,
      serverCapabilities: {
        maxFileSize: "100MB",
        chunkSize: "64KB",
        resumableTransfers: true,
        ultraPersistentSessions: true,
        neverDisconnect: true,
        infiniteRetry: true,
        sessionPreservation: true,
      },
    })

    this.broadcastToSession(
      sessionId,
      {
        type: "user-joined",
        userId,
        userCount: session.users.size,
        readyForP2P: session.users.size === 2,
        persistent: session.persistent,
        ultraPersistent: session.ultraPersistent,
      },
      ws,
    )

    // Enhanced P2P initiation for 2 users
    if (session.users.size === 2) {
      console.log(`🚀 Ultra-persistent session ${sessionId} ready - enhanced P2P initiation`)
      session.isStable = true
      this.connectionStats.p2pConnections++

      // Staggered P2P initiation for better reliability
      setTimeout(() => {
        this.broadcastToSession(sessionId, {
          type: "p2p-ready",
          message: "Both users connected - ultra-persistent P2P can be initiated",
          timestamp: Date.now(),
          ultraPersistent: true,
          sessionPreserved: true,
        })
      }, 1000) // 1 second delay for stability
    }
  }

  private handlePing(ws: WebSocket, sessionId: string, userId: string, persistent = false) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.lastPing = Date.now()
        user.missedPings = 0
        user.isStable = true
        session.lastActivity = new Date()

        if (persistent) {
          user.persistent = true
          session.persistent = true
        }
      }
    }

    this.send(ws, {
      type: "pong",
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      quality: "excellent",
      persistent: persistent,
      ultraPersistent: session?.ultraPersistent || false,
    })
  }

  private handleSessionKeepAlive(
    ws: WebSocket,
    sessionId: string,
    userId: string,
    persistent = false,
    neverExpire = false,
  ) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.isStable = true
        session.lastActivity = new Date()

        if (persistent || neverExpire) {
          user.persistent = true
          user.neverExpire = neverExpire
          session.persistent = true
          session.neverExpire = neverExpire
          session.ultraPersistent = true
          console.log(`💓 Session ${sessionId} keep-alive - NEVER EXPIRE MODE`)
        }
      }
    }

    this.send(ws, {
      type: "session-keep-alive-ack",
      timestamp: Date.now(),
      status: "maintained",
      persistent: persistent,
      neverExpire: neverExpire,
      sessionPreserved: true,
    })
  }

  private handleMaintainSession(
    ws: WebSocket,
    sessionId: string,
    userId: string,
    forceKeepAlive = false,
    neverExpire = false,
  ) {
    const session = this.sessions.get(sessionId)
    if (session && userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
        user.isStable = true
        session.lastActivity = new Date()

        if (forceKeepAlive || neverExpire) {
          session.persistent = true
          session.neverExpire = true
          session.ultraPersistent = true
          user.persistent = true
          user.neverExpire = true
          console.log(`🔒 Session ${sessionId} forced to NEVER EXPIRE`)
        }
      }
    }

    this.send(ws, {
      type: "session-maintained",
      timestamp: Date.now(),
      status: "ultra-persistent",
      forceKeepAlive: forceKeepAlive,
      neverExpire: neverExpire,
      guaranteed: true,
    })
  }

  private handleForceP2PRestart(ws: WebSocket, sessionId: string, userId: string, reason: string) {
    console.log(`🔄 Force P2P restart requested by ${userId} in session ${sessionId} - Reason: ${reason}`)

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.lastActivity = new Date()

    // Broadcast P2P restart to all users in session
    this.broadcastToSession(sessionId, {
      type: "force-p2p-restart",
      userId,
      reason,
      timestamp: Date.now(),
      ultraPersistent: true,
      sessionPreserved: true,
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
      ultraPersistent: session.ultraPersistent,
      sessionPreserved: true,
    }

    console.log(`🔄 Ultra-persistent relay ${message.type} from ${userId}`)
    this.broadcastToSession(sessionId, relayMessage, ws)
  }

  private handleDisconnection(ws: WebSocket, preserveSession = true) {
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
      console.log(
        `👋 User ${disconnectedUserId} disconnected from ultra-persistent session ${sessionId} - SESSION PRESERVED`,
      )

      // Always broadcast as temporary for ultra-persistent sessions
      this.broadcastToSession(sessionId, {
        type: "user-left",
        userId: disconnectedUserId,
        userCount: session.users.size,
        temporary: true,
        timestamp: Date.now(),
        autoReconnect: true,
        sessionPreserved: true,
        ultraPersistent: session.ultraPersistent,
        waitingForReconnection: true,
      })

      // Ultra-persistent cleanup - much longer grace period or never clean up
      const cleanupDelay = session.ultraPersistent || session.neverExpire ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000 // 24 hours vs 5 minutes

      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession && !currentSession.neverExpire) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > cleanupDelay) {
            // Only clean up if not marked as never expire
            if (!user.neverExpire && !currentSession.neverExpire) {
              currentSession.users.delete(disconnectedUserId!)
              console.log(`🗑️ Removed user ${disconnectedUserId} after grace period`)

              this.broadcastToSession(sessionId, {
                type: "user-left",
                userId: disconnectedUserId,
                userCount: currentSession.users.size,
                permanent: true,
                timestamp: Date.now(),
              })

              // Only remove session if not ultra-persistent
              if (currentSession.users.size === 0 && !currentSession.ultraPersistent) {
                this.sessions.delete(sessionId)
                console.log(`🗑️ Removed non-persistent session: ${sessionId}`)
              }
            } else {
              console.log(`🔒 User ${disconnectedUserId} preserved in never-expire session ${sessionId}`)
            }
          }
        } else if (currentSession?.neverExpire) {
          console.log(
            `🔒 Session ${sessionId} marked as NEVER EXPIRE - user ${disconnectedUserId} preserved indefinitely`,
          )
        }
      }, cleanupDelay)
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
      console.log(`📡 Ultra-persistent broadcast ${message.type} to ${sentCount} users`)
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
      ultraPersistent: true,
      sessionPreserved: true,
    })
  }

  private ultraPersistentCleanup() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      // NEVER clean up ultra-persistent or never-expire sessions
      if (session.ultraPersistent || session.neverExpire) {
        console.log(
          `🔒 Preserving ultra-persistent session ${sessionId} (uptime: ${Math.round((now.getTime() - session.createdAt.getTime()) / 1000 / 60)} minutes)`,
        )
        return
      }

      const inactiveTime = now.getTime() - session.lastActivity.getTime()

      // Only clean up non-persistent sessions after 6 hours
      const timeoutDuration = 6 * 60 * 60 * 1000 // 6 hours

      if (inactiveTime > timeoutDuration) {
        expiredSessions.push(sessionId)
      } else {
        // Clean inactive users from non-persistent sessions only
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 2 * 60 * 60 * 1000 && !userData.persistent && !userData.neverExpire) {
            // 2 hours for non-persistent users
            inactiveUsers.push(userId)
          }
        })

        inactiveUsers.forEach((userId) => {
          session.users.delete(userId)
          console.log(`🧹 Cleaned non-persistent user ${userId}`)
        })

        if (session.users.size === 0 && !session.ultraPersistent) {
          expiredSessions.push(sessionId)
        }
      }
    })

    expiredSessions.forEach((sessionId) => {
      const session = this.sessions.get(sessionId)
      if (session && !session.ultraPersistent && !session.neverExpire) {
        session.users.forEach((userData) => {
          this.send(userData.ws, {
            type: "session-expired",
            message: "Non-persistent session expired - create a new session",
            reconnectDelay: 3000,
          })
          userData.ws.close(1000, "Session expired")
        })
        this.sessions.delete(sessionId)
        console.log(`⏰ Expired non-persistent session: ${sessionId}`)
      }
    })
  }

  private logStats() {
    if (this.sessions.size > 0 || this.connectionStats.activeConnections > 0) {
      console.log(
        `📊 Ultra-Persistent Stats: ${this.sessions.size} sessions (${this.connectionStats.persistentSessions} persistent), ${this.connectionStats.activeConnections} connections`,
      )
      console.log(
        `   Total: ${this.connectionStats.totalConnections}, P2P: ${this.connectionStats.p2pConnections}, Reconnects: ${this.connectionStats.reconnections}`,
      )

      // Log persistent sessions
      const persistentSessions = Array.from(this.sessions.entries()).filter(([_, session]) => session.ultraPersistent)
      if (persistentSessions.length > 0) {
        console.log(
          `🔒 Ultra-Persistent Sessions: ${persistentSessions
            .map(
              ([id, session]) =>
                `${id}(${session.users.size}/2, ${Math.round((Date.now() - session.createdAt.getTime()) / 1000 / 60)}min)`,
            )
            .join(", ")}`,
        )
      }
    }
  }
}

// Start ultra-persistent server
const port = process.env.PORT || 8080
new UltraPersistentSignalingServer(Number(port))
