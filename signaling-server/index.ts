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

class BulletproofSignalingServer {
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
    console.log("🚀 Starting Bulletproof Signaling Server...")
    console.log(`🌐 Port: ${port}`)

    this.server = createServer()

    // Simple CORS handling
    this.server.on("request", (req, res) => {
      const origin = req.headers.origin

      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin)
      } else {
        res.setHeader("Access-Control-Allow-Origin", "*")
      }

      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")

      if (req.method === "OPTIONS") {
        res.writeHead(200)
        res.end()
        return
      }

      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            status: "bulletproof",
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
          }),
        )
        return
      }

      res.writeHead(404)
      res.end("Not Found")
    })

    // Simple WebSocket server
    this.wss = new WebSocketServer({
      server: this.server,
      maxPayload: 100 * 1024 * 1024, // 100MB
      clientTracking: true,
      verifyClient: (info) => {
        console.log(`🔍 Client connecting from: ${info.origin}`)
        return true // Allow all for simplicity
      },
    })

    this.wss.on("connection", this.handleConnection.bind(this))

    // Simple cleanup every 5 minutes
    setInterval(this.cleanup.bind(this), 5 * 60 * 1000)

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Bulletproof server running on port ${port}`)
    })

    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private shutdown() {
    console.log("🛑 Shutting down server...")
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Server shutdown")
      }
    })
    this.server.close(() => {
      console.log("✅ Server shut down")
      process.exit(0)
    })
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    console.log(`🔗 New client: ${clientIP}`)

    // Send immediate confirmation
    this.send(ws, {
      type: "connected",
      message: "Bulletproof connection established",
    })

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(`📨 ${message.type} from ${clientIP}`)
        this.handleMessage(ws, message)
      } catch (error) {
        console.error("❌ Message error:", error)
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Client disconnected: ${code} ${reason}`)
      this.handleDisconnection(ws)
    })

    ws.on("error", (error) => {
      console.error("❌ WebSocket error:", error)
      this.handleDisconnection(ws)
    })

    // Simple ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      } else {
        clearInterval(pingInterval)
      }
    }, 30000)

    ws.on("close", () => {
      clearInterval(pingInterval)
    })
  }

  private handleMessage(ws: WebSocket, message: any) {
    const { type, sessionId, userId } = message

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId)
        break
      case "ping":
        this.handlePing(ws)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relayMessage(ws, message)
        break
      default:
        console.log(`⚠️ Unknown message: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Missing session ID or user ID")
      return
    }

    console.log(`👤 User ${userId} joining session ${sessionId}`)

    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        users: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
      }
      this.sessions.set(sessionId, session)
      console.log(`🆕 Created session: ${sessionId}`)
    }

    // Check if user already exists (reconnection)
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId} reconnecting`)
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      this.userSessions.set(ws, sessionId)
      session.lastActivity = new Date()

      this.send(ws, {
        type: "joined",
        sessionId,
        userCount: session.users.size,
        userId,
        isInitiator: existingUser.isInitiator,
        reconnected: true,
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-joined",
          userId,
          userCount: session.users.size,
        },
        ws,
      )

      return
    }

    // Check session capacity
    if (session.users.size >= 2) {
      this.sendError(ws, "Session is full")
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
    }

    session.users.set(userId, userData)
    this.userSessions.set(ws, sessionId)
    session.lastActivity = new Date()

    console.log(`✅ User ${userId} joined (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`)

    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
    })

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

  private handlePing(ws: WebSocket) {
    this.send(ws, {
      type: "pong",
      timestamp: Date.now(),
    })
  }

  private relayMessage(ws: WebSocket, message: any) {
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
    console.log(`🔄 Relaying ${message.type}`)

    this.broadcastToSession(sessionId, message, ws)
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
        break
      }
    }

    if (disconnectedUserId) {
      this.userSessions.delete(ws)
      console.log(`👋 User ${disconnectedUserId} disconnected`)

      this.broadcastToSession(sessionId, {
        type: "user-left",
        userId: disconnectedUserId,
        userCount: session.users.size,
        temporary: true,
      })

      // Clean up after 30 seconds
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 25000) {
            currentSession.users.delete(disconnectedUserId!)
            console.log(`🗑️ Removed user ${disconnectedUserId}`)

            if (currentSession.users.size === 0) {
              this.sessions.delete(sessionId)
              console.log(`🗑️ Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 30000)
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
      console.log(`📡 Broadcast ${message.type} to ${sentCount} users`)
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
    })
  }

  private cleanup() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()

      // Remove sessions inactive for 2 hours
      if (inactiveTime > 2 * 60 * 60 * 1000) {
        expiredSessions.push(sessionId)
      }
    })

    expiredSessions.forEach((sessionId) => {
      const session = this.sessions.get(sessionId)
      if (session) {
        session.users.forEach((userData) => {
          userData.ws.close(1000, "Session expired")
        })
        this.sessions.delete(sessionId)
        console.log(`⏰ Expired session: ${sessionId}`)
      }
    })

    if (this.sessions.size > 0) {
      console.log(`📊 Active sessions: ${this.sessions.size}`)
    }
  }
}

// Start server
const port = process.env.PORT || 8080
new BulletproofSignalingServer(Number(port))
