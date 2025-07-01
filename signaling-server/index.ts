// import { IncomingMessage, ServerResponse } from 'http'
// import { WebSocketServer, WebSocket } from "ws"
// import { createServer } from "http"

// interface UserData {
//   ws: WebSocket
//   userId: string
//   joinedAt: Date
//   lastSeen: Date
//   isInitiator: boolean
// }

// interface Session {
//   id: string
//   users: Map<string, UserData>
//   createdAt: Date
//   lastActivity: Date
//   connectionAttempts: number
// }

// class SignalingServer {
//   private wss: WebSocketServer
//   private sessions: Map<string, Session> = new Map()
//   private userSessions: Map<WebSocket, string> = new Map()
//   private server: any

//   constructor(port = process.env.PORT) {
//     console.log("🚀 Initializing P2P Signaling Server...")

//     this.server = createServer()

//     // Add CORS headers for production
//     interface CorsHeaders {
//       'Access-Control-Allow-Origin': string
//       'Access-Control-Allow-Methods': string
//       'Access-Control-Allow-Headers': string
//     }

//         this.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
//           res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*')
//           res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
//           res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
//         })

//     // Create WebSocket server
//     this.wss = new WebSocketServer({
//       server: this.server,
//       perMessageDeflate: false,
//       maxPayload: 200 * 1024 * 1024, // 200MB
//       // Add production settings
//       clientTracking: true,
//       handleProtocols: (protocols) => protocols.values().next().value || false,
//     })

//     this.wss.on("connection", this.handleConnection.bind(this))

//     // Clean up expired sessions every minute
//     setInterval(this.cleanupSessions.bind(this), 60000)

//     if (process.env.NODE_ENV === 'production') {
//       // For production with SSL
//       const https = require('https')
//       const fs = require('fs')

//       if (process.env.SSL_CERT && process.env.SSL_KEY) {
//         const server = https.createServer({
//           cert: fs.readFileSync(process.env.SSL_CERT),
//           key: fs.readFileSync(process.env.SSL_KEY)
//         })

//         this.wss = new WebSocketServer({ server })
//         server.listen(port, '0.0.0.0', () => {
//           console.log(`✅ Secure WebSocket server running on wss://yourdomain.com:${port}`)
//         })
//       }
//     } else {
//       // Development server (existing code)
//       this.server.listen(port, () => {
//         console.log(`✅ Signaling server successfully started!`)
//         console.log(`📡 WebSocket server running on ws://localhost:${port}`)
//         console.log(`🔗 Ready to accept connections`)
//         console.log("=".repeat(50))
//       })
//     }

//     // Handle server errors
//     this.server.on("error", (error: any) => {
//       if (error.code === "EADDRINUSE") {
//         console.error(`❌ Port ${port} is already in use!`)
//         console.log(`💡 Try killing the process using port ${port}:`)
//         console.log(`   Windows: netstat -ano | findstr :${port}`)
//         console.log(`   Mac/Linux: lsof -ti:${port} | xargs kill`)
//         console.log(`   Or change the port in signaling-server/index.ts`)
//       } else {
//         console.error("❌ Server error:", error)
//       }
//       process.exit(1)
//     })

//     // Graceful shutdown
//     process.on("SIGTERM", this.shutdown.bind(this))
//     process.on("SIGINT", this.shutdown.bind(this))
//   }

//   private shutdown() {
//     console.log("\n🛑 Shutting down signaling server...")

//     // Close all WebSocket connections
//     this.wss.clients.forEach((ws) => {
//       ws.close(1000, "Server shutting down")
//     })

//     // Close the server
//     this.server.close(() => {
//       console.log("✅ Server shut down gracefully")
//       process.exit(0)
//     })
//   }

//   private handleConnection(ws: WebSocket) {
//     console.log("🔗 New client connected")

//     // Send immediate confirmation
//     this.send(ws, {
//       type: "connected",
//       message: "Connected to signaling server",
//       timestamp: new Date().toISOString(),
//     })

//     ws.on("message", (data) => {
//       try {
//         const message = JSON.parse(data.toString())
//         console.log(`📨 Received: ${message.type} ${message.sessionId ? `(session: ${message.sessionId})` : ""}`)
//         this.handleMessage(ws, message)
//       } catch (error) {
//         console.error("❌ Invalid message format:", error)
//         this.sendError(ws, "Invalid message format")
//       }
//     })

//     ws.on("close", (code, reason) => {
//       console.log(`🔌 Client disconnected: ${code} ${reason}`)
//       this.handleDisconnection(ws)
//     })

//     ws.on("error", (error) => {
//       console.error("❌ WebSocket error:", error)
//       this.handleDisconnection(ws)
//     })

//     // Send ping every 30 seconds to keep connection alive
//     const pingInterval = setInterval(() => {
//       if (ws.readyState === WebSocket.OPEN) {
//         ws.ping()
//       } else {
//         clearInterval(pingInterval)
//       }
//     }, 30000)

//     ws.on("pong", () => {
//       // Connection is alive
//     })
//   }

//   private handleMessage(ws: WebSocket, message: any) {
//     const { type, sessionId, userId } = message

//     // Validate session ID format (6 alphanumeric characters)
//     if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
//       this.sendError(ws, "Invalid session ID format")
//       return
//     }

//     switch (type) {
//       case "join":
//         this.handleJoin(ws, sessionId, userId, message.reconnect)
//         break
//       case "ping":
//         this.handlePing(ws, sessionId, userId)
//         break
//       case "retry-connection":
//         this.handleRetryConnection(ws, sessionId, userId)
//         break
//       case "offer":
//       case "answer":
//       case "ice-candidate":
//         this.relaySignalingMessage(ws, message)
//         break
//       default:
//         console.log(`⚠️ Unknown message type: ${type}`)
//         this.sendError(ws, "Unknown message type")
//     }
//   }

//   private handleJoin(ws: WebSocket, sessionId: string, userId: string, isReconnect = false) {
//     if (!sessionId || !userId) {
//       this.sendError(ws, "Session ID and User ID are required")
//       return
//     }

//     console.log(`👤 User ${userId} ${isReconnect ? "reconnecting to" : "joining"} session ${sessionId}`)

//     // Get or create session
//     let session = this.sessions.get(sessionId)
//     if (!session) {
//       session = {
//         id: sessionId,
//         users: new Map(),
//         createdAt: new Date(),
//         lastActivity: new Date(),
//         connectionAttempts: 0,
//       }
//       this.sessions.set(sessionId, session)
//       console.log(`🆕 Created session: ${sessionId}`)
//     }

//     // Check if user is already in session (reconnection)
//     const existingUser = session.users.get(userId)
//     if (existingUser) {
//       console.log(`🔄 User ${userId} reconnecting to session ${sessionId}`)

//       // Update the WebSocket connection
//       existingUser.ws = ws
//       existingUser.lastSeen = new Date()
//       this.userSessions.set(ws, sessionId)
//       session.lastActivity = new Date()

//       // Send confirmation
//       this.send(ws, {
//         type: "joined",
//         sessionId,
//         userCount: session.users.size,
//         userId,
//         isInitiator: existingUser.isInitiator,
//       })

//       // Notify other users about reconnection
//       this.broadcastToSession(
//         sessionId,
//         {
//           type: "user-reconnected",
//           userId,
//           userCount: session.users.size,
//         },
//         ws,
//       )

//       return
//     }

//     // Check if session is full (max 2 users for P2P)
//     if (session.users.size >= 2) {
//       console.log(`❌ Session ${sessionId} is full (${session.users.size}/2 users)`)
//       this.sendError(ws, "Session is full (maximum 2 users)")
//       return
//     }

//     // Determine if this user should be the initiator
//     // First user to join becomes the initiator
//     const isInitiator = session.users.size === 0

//     // Add user to session
//     const userData: UserData = {
//       ws,
//       userId,
//       joinedAt: new Date(),
//       lastSeen: new Date(),
//       isInitiator,
//     }

//     session.users.set(userId, userData)
//     this.userSessions.set(ws, sessionId)
//     session.lastActivity = new Date()

//     console.log(
//       `✅ User ${userId} joined session ${sessionId} (${session.users.size}/2 users) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`,
//     )

//     // Send confirmation to the joining user
//     this.send(ws, {
//       type: "joined",
//       sessionId,
//       userCount: session.users.size,
//       userId,
//       isInitiator,
//     })

//     // If this is the second user, notify the first user to start connection
//     if (session.users.size === 2) {
//       console.log(`🚀 Session ${sessionId} is full, initiating P2P connection`)

//       // Small delay to ensure both clients are ready
//       setTimeout(() => {
//         this.broadcastToSession(
//           sessionId,
//           {
//             type: "user-joined",
//             userId,
//             userCount: session.users.size,
//             readyForConnection: true,
//           },
//           ws,
//         )
//       }, 1000)
//     } else {
//       // Just notify about the join
//       this.broadcastToSession(
//         sessionId,
//         {
//           type: "user-joined",
//           userId,
//           userCount: session.users.size,
//         },
//         ws,
//       )
//     }

//     // Log session state
//     console.log(`📊 Session ${sessionId} users:`, Array.from(session.users.keys()))
//   }

//   private handlePing(ws: WebSocket, sessionId: string, userId: string) {
//     const session = this.sessions.get(sessionId)
//     if (session && userId) {
//       const user = session.users.get(userId)
//       if (user) {
//         user.lastSeen = new Date()
//         session.lastActivity = new Date()
//       }
//     }

//     this.send(ws, { type: "pong", timestamp: Date.now() })
//   }

//   private handleRetryConnection(ws: WebSocket, sessionId: string, userId: string) {
//     console.log(`🔄 Retry connection requested by ${userId} in session ${sessionId}`)

//     const session = this.sessions.get(sessionId)
//     if (!session) {
//       this.sendError(ws, "Session not found")
//       return
//     }

//     session.connectionAttempts++
//     session.lastActivity = new Date()

//     // Broadcast retry request to all users in session
//     this.broadcastToSession(sessionId, {
//       type: "retry-connection",
//       userId,
//       attempt: session.connectionAttempts,
//     })
//   }

//   private relaySignalingMessage(ws: WebSocket, message: any) {
//     const sessionId = this.userSessions.get(ws)
//     if (!sessionId) {
//       this.sendError(ws, "Not in a session")
//       return
//     }

//     const session = this.sessions.get(sessionId)
//     if (!session) {
//       this.sendError(ws, "Session not found")
//       return
//     }

//     // Update last activity
//     session.lastActivity = new Date()

//     // Update user's last seen
//     const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]
//     if (userId) {
//       const user = session.users.get(userId)
//       if (user) {
//         user.lastSeen = new Date()
//       }
//     }

//     console.log(
//       `🔄 Relaying ${message.type} from ${userId} in session ${sessionId} to ${session.users.size - 1} other users`,
//     )

//     // Add sender info to message
//     const relayMessage = {
//       ...message,
//       senderId: userId,
//       timestamp: Date.now(),
//     }

//     // Relay message to other users in the session
//     this.broadcastToSession(sessionId, relayMessage, ws)
//   }

//   private handleDisconnection(ws: WebSocket) {
//     const sessionId = this.userSessions.get(ws)
//     if (!sessionId) return

//     const session = this.sessions.get(sessionId)
//     if (!session) return

//     // Find and remove user from session
//     let disconnectedUserId: string | undefined
//     for (const [userId, userData] of session.users.entries()) {
//       if (userData.ws === ws) {
//         disconnectedUserId = userId
//         // Don't immediately remove - mark as disconnected for potential reconnection
//         userData.lastSeen = new Date(Date.now() - 60000) // Mark as 1 minute ago
//         break
//       }
//     }

//     if (disconnectedUserId) {
//       this.userSessions.delete(ws)
//       console.log(`👋 User ${disconnectedUserId} disconnected from session ${sessionId}`)

//       // Notify remaining users
//       this.broadcastToSession(sessionId, {
//         type: "user-left",
//         userId: disconnectedUserId,
//         userCount: session.users.size,
//         temporary: true, // Indicate this might be temporary
//       })

//       // Schedule cleanup of disconnected user after 2 minutes
//       setTimeout(() => {
//         const currentSession = this.sessions.get(sessionId)
//         if (currentSession) {
//           const user = currentSession.users.get(disconnectedUserId!)
//           if (user && Date.now() - user.lastSeen.getTime() > 120000) {
//             // 2 minutes
//             currentSession.users.delete(disconnectedUserId!)
//             console.log(`🗑️ Removed inactive user ${disconnectedUserId} from session ${sessionId}`)

//             // Notify remaining users
//             this.broadcastToSession(sessionId, {
//               type: "user-left",
//               userId: disconnectedUserId,
//               userCount: currentSession.users.size,
//               permanent: true,
//             })

//             // Remove empty sessions
//             if (currentSession.users.size === 0) {
//               this.sessions.delete(sessionId)
//               console.log(`🗑️ Removed empty session: ${sessionId}`)
//             }
//           }
//         }
//       }, 120000) // 2 minutes
//     }
//   }

//   private broadcastToSession(sessionId: string, message: any, excludeWs?: WebSocket) {
//     const session = this.sessions.get(sessionId)
//     if (!session) return

//     let sentCount = 0
//     session.users.forEach((userData) => {
//       if (userData.ws !== excludeWs && userData.ws.readyState === WebSocket.OPEN) {
//         this.send(userData.ws, message)
//         sentCount++
//       }
//     })

//     if (sentCount > 0) {
//       console.log(`📡 Broadcasted ${message.type} to ${sentCount} users in session ${sessionId}`)
//     } else if (session.users.size > 1) {
//       console.log(`⚠️ No active users to broadcast ${message.type} to in session ${sessionId}`)
//     }
//   }

//   private send(ws: WebSocket, message: any) {
//     if (ws.readyState === WebSocket.OPEN) {
//       ws.send(JSON.stringify(message))
//     }
//   }

//   private sendError(ws: WebSocket, message: string) {
//     console.error(`❌ Error: ${message}`)
//     this.send(ws, { type: "error", message })
//   }

//   private cleanupSessions() {
//     const now = new Date()
//     const expiredSessions: string[] = []

//     this.sessions.forEach((session, sessionId) => {
//       // Remove sessions inactive for more than 10 minutes
//       const inactiveTime = now.getTime() - session.lastActivity.getTime()
//       if (inactiveTime > 10 * 60 * 1000) {
//         expiredSessions.push(sessionId)
//       } else {
//         // Clean up inactive users within active sessions
//         const inactiveUsers: string[] = []
//         session.users.forEach((userData, userId) => {
//           const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
//           if (userInactiveTime > 5 * 60 * 1000) {
//             // 5 minutes
//             inactiveUsers.push(userId)
//           }
//         })

//         inactiveUsers.forEach((userId) => {
//           session.users.delete(userId)
//           console.log(`🧹 Removed inactive user ${userId} from session ${sessionId}`)
//         })

//         // Remove session if no users left
//         if (session.users.size === 0) {
//           expiredSessions.push(sessionId)
//         }
//       }
//     })

//     expiredSessions.forEach((sessionId) => {
//       const session = this.sessions.get(sessionId)
//       if (session) {
//         // Close all connections in expired session
//         session.users.forEach((userData) => {
//           this.sendError(userData.ws, "Session expired due to inactivity")
//           userData.ws.close()
//         })
//         this.sessions.delete(sessionId)
//         console.log(`⏰ Expired session: ${sessionId}`)
//       }
//     })

//     if (this.sessions.size > 0) {
//       console.log(`📊 Active sessions: ${this.sessions.size}, Total connections: ${this.userSessions.size}`)
//       this.sessions.forEach((session, sessionId) => {
//         const activeUsers = Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length
//         console.log(`   Session ${sessionId}: ${activeUsers}/${session.users.size} active users`)
//       })
//     }
//   }

//   public getStats() {
//     return {
//       activeSessions: this.sessions.size,
//       totalConnections: this.userSessions.size,
//       sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
//         id,
//         userCount: session.users.size,
//         activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
//         users: Array.from(session.users.entries()).map(([userId, userData]) => ({
//           userId,
//           isInitiator: userData.isInitiator,
//           joinedAt: userData.joinedAt,
//           lastSeen: userData.lastSeen,
//           connected: userData.ws.readyState === WebSocket.OPEN,
//         })),
//         createdAt: session.createdAt,
//         lastActivity: session.lastActivity,
//         connectionAttempts: session.connectionAttempts,
//       })),
//     }
//   }
// }

// // Check if port is available
// function checkPort(port: number): Promise<boolean> {
//   return new Promise((resolve) => {
//     const server = createServer()
//     server.listen(port, () => {
//       server.close(() => resolve(true))
//     })
//     server.on("error", () => resolve(false))
//   })
// }

// // Start the server
// async function startServer() {
//   const port = process.env.PORT
//   console.log("🔍 Checking if port 8080 is available...")

//   // const isPortAvailable = await checkPort(8080)

//   // if (!isPortAvailable) {
//   //   console.error("❌ Port 8080 is already in use!")
//   //   console.log("💡 Solutions:")
//   //   console.log("   1. Kill the process using port 8080:")
//   //   console.log("      Windows: netstat -ano | findstr :8080")
//   //   console.log("      Mac/Linux: lsof -ti:8080 | xargs kill")
//   //   console.log("   2. Or use a different port by editing this file")
//   //   process.exit(1)
//   // }

//   console.log("✅ Port 8080 is available")
//   new SignalingServer(port)
// }

// // Handle uncaught exceptions
// process.on("uncaughtException", (error) => {
//   console.error("💥 Uncaught Exception:", error)
//   process.exit(1)
// })

// process.on("unhandledRejection", (reason, promise) => {
//   console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
//   process.exit(1)
// })

// // Start the server
// startServer()

// export default SignalingServer
import { WebSocketServer, WebSocket } from "ws"
import { createServer } from "http"

interface UserData {
  ws: WebSocket
  userId: string
  joinedAt: Date
  lastSeen: Date
  isInitiator: boolean
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
}

class PerfectSignalingServer {
  private wss: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Starting Perfect Signaling Server")
    console.log(`🌐 Port: ${port}`)

    this.server = createServer()

    // Enhanced CORS for maximum compatibility
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
            status: "perfect",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "3.0.0",
          }),
        )
        return
      }

      if (req.url === "/stats") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(this.getStats()))
        return
      }

      res.writeHead(404)
      res.end()
    })

    // Optimized WebSocket server
    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
      },
      maxPayload: 1024 * 1024 * 1024, // 1GB
      clientTracking: true,
      verifyClient: (info) => {
        const origin = info.origin
        if (!origin) return true

        const allowedOrigins = [
          "https://p2p-file-share-fix.vercel.app",
          "https://vercel.app",
          "https://c0-ai.live",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "https://localhost:3000",
        ]

        return allowedOrigins.includes(origin) || origin.includes(".vercel.app") || origin.includes("localhost")
      },
    })

    this.wss.on("connection", this.handleConnection.bind(this))
    this.wss.on("error", (error) => console.error("❌ WebSocket Server error:", error))

    // Less aggressive cleanup - every 5 minutes
    setInterval(this.cleanupSessions.bind(this), 300000)

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Perfect Signaling Server running on port ${port}`)
      console.log(`🔗 Ready for zero-loss connections`)
    })

    this.server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use!`)
      } else {
        console.error("❌ Server error:", error)
      }
      process.exit(1)
    })

    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private shutdown() {
    console.log("\n🛑 Shutting down server...")
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "server-shutdown" }))
        ws.close(1000, "Server shutting down")
      }
    })

    this.server.close(() => {
      console.log("✅ Server shut down gracefully")
      process.exit(0)
    })

    setTimeout(() => {
      console.log("⚠️ Force closing server")
      process.exit(1)
    }, 10000)
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    console.log(`🔗 New connection from ${clientIP}`)

    this.send(ws, {
      type: "connected",
      message: "Connected to perfect signaling server",
      timestamp: new Date().toISOString(),
      version: "3.0.0",
    })

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleMessage(ws, message)
      } catch (error) {
        console.error("❌ Invalid message:", error)
        this.sendError(ws, "Invalid message format")
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Client disconnected: ${code} (${clientIP})`)
      this.handleDisconnection(ws)
    })

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error from ${clientIP}:`, error)
      this.handleDisconnection(ws)
    })

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      } else {
        clearInterval(pingInterval)
      }
    }, 30000)

    ws.on("close", () => clearInterval(pingInterval))
  }

  private handleMessage(ws: WebSocket, message: any) {
    const { type, sessionId, userId } = message

    if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
      this.sendError(ws, "Invalid session ID format")
      return
    }

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId)
        break
      case "ping":
        this.handlePing(ws, sessionId, userId)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relayMessage(ws, message)
        break
      default:
        this.sendError(ws, `Unknown message type: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID required")
      return
    }

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

    // Check for reconnection
    const existingUser = session.users.get(userId)
    if (existingUser) {
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
          type: "user-reconnected",
          userId,
          userCount: session.users.size,
        },
        ws,
      )

      return
    }

    if (session.users.size >= 2) {
      this.sendError(ws, "Session is full")
      return
    }

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

    console.log(
      `✅ User ${userId} joined session ${sessionId} (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`,
    )

    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
    })

    if (session.users.size === 2) {
      setTimeout(() => {
        this.broadcastToSession(
          sessionId,
          {
            type: "user-joined",
            userId,
            userCount: session.users.size,
            readyForConnection: true,
          },
          ws,
        )
      }, 200) // Minimal delay for immediate connection
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
        session.lastActivity = new Date()
      }
    }

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

    const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]
    if (userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
      }
    }

    const relayMessage = {
      ...message,
      senderId: userId,
      timestamp: Date.now(),
    }

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
        userData.lastSeen = new Date(Date.now() - 60000) // Mark as disconnected
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
      })

      // Give user 5 minutes to reconnect
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 300000) {
            // 5 minutes
            currentSession.users.delete(disconnectedUserId!)
            console.log(`🗑️ Removed inactive user ${disconnectedUserId} from session ${sessionId}`)

            this.broadcastToSession(sessionId, {
              type: "user-left",
              userId: disconnectedUserId,
              userCount: currentSession.users.size,
              permanent: true,
            })

            if (currentSession.users.size === 0) {
              this.sessions.delete(sessionId)
              console.log(`🗑️ Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 300000) // 5 minutes
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
          console.error(`❌ Failed to send message:`, error)
        }
      }
    })

    if (sentCount > 0) {
      console.log(`📡 Broadcasted ${message.type} to ${sentCount} users in session ${sessionId}`)
    }
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
      } catch (error) {
        console.error("❌ Error sending message:", error)
      }
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.send(ws, {
      type: "error",
      message,
      timestamp: Date.now(),
    })
  }

  private cleanupSessions() {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      // Remove sessions inactive for more than 1 hour
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime > 60 * 60 * 1000) {
        // 1 hour
        expiredSessions.push(sessionId)
      } else {
        // Clean up inactive users
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 30 * 60 * 1000) {
            // 30 minutes
            inactiveUsers.push(userId)
          }
        })

        inactiveUsers.forEach((userId) => {
          session.users.delete(userId)
          console.log(`🧹 Removed inactive user ${userId} from session ${sessionId}`)
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
          this.sendError(userData.ws, "Session expired")
          userData.ws.close(1000, "Session expired")
        })

        this.sessions.delete(sessionId)
        console.log(`⏰ Expired session: ${sessionId}`)
      }
    })

    if (this.sessions.size > 0) {
      console.log(`📊 Active sessions: ${this.sessions.size}, Total connections: ${this.userSessions.size}`)
    }
  }

  public getStats() {
    return {
      activeSessions: this.sessions.size,
      totalConnections: this.userSessions.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        userCount: session.users.size,
        activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      })),
    }
  }
}

// Start the perfect signaling server
async function startPerfectServer() {
  const port = process.env.PORT || 8080
  console.log(`🔍 Starting Perfect Signaling Server on port ${port}`)

  try {
    new PerfectSignalingServer(Number(port))
  } catch (error) {
    console.error("❌ Error starting server:", error)
    process.exit(1)
  }
}

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", reason)
  process.exit(1)
})

startPerfectServer()

export default PerfectSignalingServer
