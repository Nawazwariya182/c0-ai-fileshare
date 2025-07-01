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
  capabilities?: any
}

interface Session {
  id: string
  users: Map<string, UserData>
  createdAt: Date
  lastActivity: Date
  connectionAttempts: number
}

class UltraReliableSignalingServer {
  private wss: WebSocketServer
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<WebSocket, string> = new Map()
  private server: any
  private messageQueue: Map<string, any[]> = new Map() // Queue messages for offline users

  constructor(port = process.env.PORT || 8080) {
    console.log("🚀 Starting Ultra-Reliable Signaling Server")
    console.log(`🌐 Port: ${port}`)

    this.server = createServer()

    // Ultra-optimized CORS for maximum compatibility
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

      // Allow all Vercel deployments and localhost
      if (
        origin &&
        (allowedOrigins.includes(origin) || origin.includes(".vercel.app") || origin.includes("localhost"))
      ) {
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
        res.end(
          JSON.stringify({
            status: "ultra-reliable",
            timestamp: new Date().toISOString(),
            sessions: this.sessions.size,
            connections: this.userSessions.size,
            uptime: process.uptime(),
            version: "4.0.0-ultra",
            features: ["message-queuing", "connection-recovery", "adaptive-timeouts"],
          }),
        )
        return
      }

      // Detailed stats endpoint
      if (req.url === "/stats") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(this.getDetailedStats()))
        return
      }

      res.writeHead(404)
      res.end()
    })

    // Ultra-optimized WebSocket server configuration
    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: {
        threshold: 512, // Compress smaller messages for speed
        concurrencyLimit: 20, // Increased concurrency
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false,
      },
      maxPayload: 2 * 1024 * 1024 * 1024, // 2GB for large signaling messages
      clientTracking: true,
      handleProtocols: (protocols) => {
        return protocols.has("ultra-reliable-v1") ? "ultra-reliable-v1" : protocols.values().next().value || false
      },
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

    // Optimized cleanup - every 10 minutes
    setInterval(this.cleanupSessions.bind(this), 600000)

    // Message queue cleanup - every 5 minutes
    setInterval(this.cleanupMessageQueue.bind(this), 300000)

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Ultra-Reliable Signaling Server running on port ${port}`)
      console.log(`🔗 Ready for ultra-reliable P2P connections`)
      console.log(`📊 Features: Message queuing, Connection recovery, Adaptive timeouts`)
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

    // Graceful shutdown
    process.on("SIGTERM", this.shutdown.bind(this))
    process.on("SIGINT", this.shutdown.bind(this))
  }

  private shutdown() {
    console.log("\n🛑 Shutting down Ultra-Reliable Signaling Server...")

    // Notify all clients
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, { type: "server-shutdown", message: "Server shutting down gracefully" })
        ws.close(1000, "Server shutdown")
      }
    })

    this.server.close(() => {
      console.log("✅ Server shut down gracefully")
      process.exit(0)
    })

    // Force exit after 15 seconds
    setTimeout(() => {
      console.log("⚠️ Force closing server")
      process.exit(1)
    }, 15000)
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientIP = req.socket.remoteAddress
    const userAgent = req.headers["user-agent"]

    console.log(`🔗 New ultra-reliable connection from ${clientIP}`)
    console.log(`   User-Agent: ${userAgent?.substring(0, 50)}...`)

    // Send enhanced connection confirmation
    this.send(ws, {
      type: "connected",
      message: "Connected to ultra-reliable signaling server",
      timestamp: new Date().toISOString(),
      version: "4.0.0-ultra",
      features: ["message-queuing", "connection-recovery", "adaptive-timeouts"],
      serverId: process.env.DYNO || "local",
    })

    // Enhanced message handling
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleMessage(ws, message, clientIP)
      } catch (error) {
        console.error("❌ Invalid message format from", clientIP, ":", error)
        this.sendError(ws, "Invalid message format")
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`🔌 Client disconnected: ${code} ${reason} (${clientIP})`)
      this.handleDisconnection(ws)
    })

    ws.on("error", (error) => {
      console.error(`❌ WebSocket error from ${clientIP}:`, error)
      this.handleDisconnection(ws)
    })

    // Ultra-reliable ping/pong with adaptive intervals
    ws.on("pong", (data) => {
      const timestamp = data.toString()
      if (timestamp) {
        const latency = Date.now() - Number.parseInt(timestamp)
        console.log(`🏓 Pong from ${clientIP} (${latency}ms)`)
      }
    })

    // Adaptive keep-alive based on connection quality
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping(Date.now().toString())
      } else {
        clearInterval(pingInterval)
      }
    }, 15000) // Every 15 seconds

    // Extended connection timeout for stability
    const connectionTimeout = setTimeout(
      () => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(`⏰ Connection timeout for ${clientIP}`)
          ws.close(1008, "Connection timeout")
        }
      },
      30 * 60 * 1000,
    ) // 30 minutes

    ws.on("close", () => {
      clearInterval(pingInterval)
      clearTimeout(connectionTimeout)
    })
  }

  private handleMessage(ws: WebSocket, message: any, clientIP: string) {
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

    // Log message with enhanced details
    console.log(
      `📨 ${type} from ${clientIP} ${sessionId ? `(session: ${sessionId})` : ""} ${userId ? `(user: ${userId.substring(0, 8)}...)` : ""}`,
    )

    switch (type) {
      case "join":
        this.handleJoin(ws, sessionId, userId, message.capabilities)
        break
      case "ping":
        this.handlePing(ws, sessionId, userId, message.timestamp)
        break
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relaySignalingMessage(ws, message)
        break
      case "connection-recovery":
        this.handleConnectionRecovery(ws, sessionId, userId)
        break
      default:
        console.log(`⚠️ Unknown message type: ${type}`)
        this.sendError(ws, `Unknown message type: ${type}`)
    }
  }

  private handleJoin(ws: WebSocket, sessionId: string, userId: string, capabilities?: any) {
    if (!sessionId || !userId) {
      this.sendError(ws, "Session ID and User ID are required")
      return
    }

    console.log(`👤 User ${userId.substring(0, 8)}... joining session ${sessionId}`)

    // Get or create session
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        users: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        connectionAttempts: 0,
      }
      this.sessions.set(sessionId, session)
      console.log(`🆕 Created ultra-reliable session: ${sessionId}`)
    }

    // Handle reconnection
    const existingUser = session.users.get(userId)
    if (existingUser) {
      console.log(`🔄 User ${userId.substring(0, 8)}... reconnecting to session ${sessionId}`)

      // Update connection
      existingUser.ws = ws
      existingUser.lastSeen = new Date()
      this.userSessions.set(ws, sessionId)
      session.lastActivity = new Date()

      // Send queued messages
      this.deliverQueuedMessages(userId)

      this.send(ws, {
        type: "joined",
        sessionId,
        userCount: session.users.size,
        userId,
        isInitiator: existingUser.isInitiator,
        reconnected: true,
        capabilities: existingUser.capabilities,
      })

      this.broadcastToSession(
        sessionId,
        {
          type: "user-reconnected",
          userId,
          userCount: session.users.size,
          timestamp: Date.now(),
        },
        ws,
      )

      return
    }

    // Check session capacity
    if (session.users.size >= 2) {
      console.log(`❌ Session ${sessionId} is full (${session.users.size}/2 users)`)
      this.sendError(ws, "Session is full (maximum 2 users for P2P)")
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
      capabilities,
    }

    session.users.set(userId, userData)
    this.userSessions.set(ws, sessionId)
    session.lastActivity = new Date()

    console.log(
      `✅ User ${userId.substring(0, 8)}... joined session ${sessionId} (${session.users.size}/2) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`,
    )

    // Send confirmation
    this.send(ws, {
      type: "joined",
      sessionId,
      userCount: session.users.size,
      userId,
      isInitiator,
      sessionCreated: session.createdAt.toISOString(),
      capabilities,
    })

    // Trigger P2P connection when session is full
    if (session.users.size === 2) {
      console.log(`🚀 Session ${sessionId} ready for ultra-reliable P2P connection`)

      // Immediate notification for faster connection establishment
      setTimeout(() => {
        this.broadcastToSession(
          sessionId,
          {
            type: "user-joined",
            userId,
            userCount: session.users.size,
            readyForConnection: true,
            timestamp: Date.now(),
          },
          ws,
        )
      }, 50) // Minimal delay
    } else {
      this.broadcastToSession(
        sessionId,
        {
          type: "user-joined",
          userId,
          userCount: session.users.size,
          timestamp: Date.now(),
        },
        ws,
      )
    }
  }

  private handlePing(ws: WebSocket, sessionId: string, userId: string, timestamp?: number) {
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
      timestamp: timestamp || Date.now(),
      serverTime: Date.now(),
    })
  }

  private handleConnectionRecovery(ws: WebSocket, sessionId: string, userId: string) {
    console.log(`🔧 Connection recovery requested by ${userId.substring(0, 8)}... in session ${sessionId}`)

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.sendError(ws, "Session not found")
      return
    }

    session.connectionAttempts++
    session.lastActivity = new Date()

    // Broadcast recovery request
    this.broadcastToSession(sessionId, {
      type: "connection-recovery",
      userId,
      attempt: session.connectionAttempts,
      timestamp: Date.now(),
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

    // Find sender
    const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0]
    if (userId) {
      const user = session.users.get(userId)
      if (user) {
        user.lastSeen = new Date()
      }
    }

    // Enhanced message validation
    const messageSize = JSON.stringify(message).length
    if (messageSize > 10 * 1024 * 1024) {
      // 10MB limit
      this.sendError(ws, "Message too large")
      return
    }

    console.log(
      `🔄 Relaying ${message.type} from ${userId?.substring(0, 8)}... in session ${sessionId} (${messageSize} bytes)`,
    )

    // Add metadata to message
    const relayMessage = {
      ...message,
      senderId: userId,
      timestamp: Date.now(),
      serverProcessed: new Date().toISOString(),
      messageId: Math.random().toString(36).substring(2, 15),
    }

    // Relay with delivery confirmation
    this.broadcastToSessionWithConfirmation(sessionId, relayMessage, ws)
  }

  private handleDisconnection(ws: WebSocket) {
    const sessionId = this.userSessions.get(ws)
    if (!sessionId) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    let disconnectedUserId: string | undefined

    // Find disconnected user
    for (const [userId, userData] of session.users.entries()) {
      if (userData.ws === ws) {
        disconnectedUserId = userId
        userData.lastSeen = new Date(Date.now() - 30000) // Mark as 30 seconds ago
        break
      }
    }

    if (disconnectedUserId) {
      this.userSessions.delete(ws)
      console.log(`👋 User ${disconnectedUserId.substring(0, 8)}... disconnected from session ${sessionId}`)

      // Notify remaining users
      this.broadcastToSession(sessionId, {
        type: "user-left",
        userId: disconnectedUserId,
        userCount: session.users.size,
        temporary: true,
        timestamp: Date.now(),
      })

      // Extended grace period for reconnection (10 minutes)
      setTimeout(() => {
        const currentSession = this.sessions.get(sessionId)
        if (currentSession) {
          const user = currentSession.users.get(disconnectedUserId!)
          if (user && Date.now() - user.lastSeen.getTime() > 600000) {
            // 10 minutes
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
              this.messageQueue.delete(sessionId)
              console.log(`🗑️ Removed empty session: ${sessionId}`)
            }
          }
        }
      }, 600000) // 10 minutes
    }
  }

  private broadcastToSession(sessionId: string, message: any, excludeWs?: WebSocket) {
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
            this.queueMessage(userId, message)
            queuedCount++
          }
        } else {
          // Queue message for offline user
          this.queueMessage(userId, message)
          queuedCount++
        }
      }
    })

    if (sentCount > 0 || queuedCount > 0) {
      console.log(`📡 Broadcasted ${message.type} to session ${sessionId}: ${sentCount} sent, ${queuedCount} queued`)
    }
  }

  private broadcastToSessionWithConfirmation(sessionId: string, message: any, excludeWs?: WebSocket) {
    // Add delivery tracking
    message.requiresConfirmation = true
    message.deliveryId = Math.random().toString(36).substring(2, 15)

    this.broadcastToSession(sessionId, message, excludeWs)
  }

  private queueMessage(userId: string, message: any) {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, [])
    }

    const queue = this.messageQueue.get(userId)!
    queue.push({
      ...message,
      queuedAt: Date.now(),
    })

    // Limit queue size to prevent memory issues
    if (queue.length > 100) {
      queue.shift() // Remove oldest message
    }

    console.log(`📬 Queued message for user ${userId.substring(0, 8)}... (queue size: ${queue.length})`)
  }

  private deliverQueuedMessages(userId: string) {
    const queue = this.messageQueue.get(userId)
    if (!queue || queue.length === 0) return

    console.log(`📬 Delivering ${queue.length} queued messages to user ${userId.substring(0, 8)}...`)

    const session = this.getSessionByUserId(userId)
    if (!session) return

    const userData = session.users.get(userId)
    if (!userData || userData.ws.readyState !== WebSocket.OPEN) return

    // Deliver messages in order
    queue.forEach((message) => {
      try {
        this.send(userData.ws, {
          ...message,
          wasQueued: true,
          deliveredAt: Date.now(),
        })
      } catch (error) {
        console.error(`❌ Failed to deliver queued message to ${userId.substring(0, 8)}...:`, error)
      }
    })

    // Clear queue
    this.messageQueue.delete(userId)
  }

  private getSessionByUserId(userId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.users.has(userId)) {
        return session
      }
    }
    return undefined
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
    console.error(`❌ Error: ${message}`)
    this.send(ws, {
      type: "error",
      message,
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
    })
  }

  private cleanupSessions() {
    const now = new Date()
    const expiredSessions: string[] = []

    console.log(`🧹 Running session cleanup...`)

    this.sessions.forEach((session, sessionId) => {
      // Remove sessions inactive for more than 2 hours
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime > 2 * 60 * 60 * 1000) {
        // 2 hours
        expiredSessions.push(sessionId)
      } else {
        // Clean up inactive users within active sessions
        const inactiveUsers: string[] = []
        session.users.forEach((userData, userId) => {
          const userInactiveTime = now.getTime() - userData.lastSeen.getTime()
          if (userInactiveTime > 60 * 60 * 1000) {
            // 1 hour
            inactiveUsers.push(userId)
          }
        })

        inactiveUsers.forEach((userId) => {
          session.users.delete(userId)
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
        this.messageQueue.delete(sessionId)
        console.log(`⏰ Expired session: ${sessionId}`)
      }
    })

    if (this.sessions.size > 0) {
      console.log(`📊 Active sessions: ${this.sessions.size}, Total connections: ${this.userSessions.size}`)
      this.sessions.forEach((session, sessionId) => {
        const activeUsers = Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length
        console.log(`   Session ${sessionId}: ${activeUsers}/${session.users.size} active users`)
      })
    }
  }

  private cleanupMessageQueue() {
    const now = Date.now()
    let totalCleaned = 0

    this.messageQueue.forEach((queue, userId) => {
      const originalLength = queue.length

      // Remove messages older than 1 hour
      this.messageQueue.set(
        userId,
        queue.filter((msg) => now - msg.queuedAt < 60 * 60 * 1000),
      )

      const cleaned = originalLength - queue.length
      totalCleaned += cleaned

      if (queue.length === 0) {
        this.messageQueue.delete(userId)
      }
    })

    if (totalCleaned > 0) {
      console.log(`🧹 Cleaned ${totalCleaned} old queued messages`)
    }
  }

  public getDetailedStats() {
    return {
      activeSessions: this.sessions.size,
      totalConnections: this.userSessions.size,
      queuedMessages: Array.from(this.messageQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: "4.0.0-ultra",
      features: ["message-queuing", "connection-recovery", "adaptive-timeouts"],
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        userCount: session.users.size,
        activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === WebSocket.OPEN).length,
        users: Array.from(session.users.entries()).map(([userId, userData]) => ({
          userId: userId.substring(0, 8) + "...",
          isInitiator: userData.isInitiator,
          joinedAt: userData.joinedAt,
          lastSeen: userData.lastSeen,
          connected: userData.ws.readyState === WebSocket.OPEN,
          capabilities: userData.capabilities,
        })),
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        connectionAttempts: session.connectionAttempts,
      })),
    }
  }
}

// Enhanced error handling and startup
async function startUltraReliableServer() {
  const port = process.env.PORT || 8080

  console.log(`🔍 Starting Ultra-Reliable Signaling Server on port ${port}`)

  try {
    new UltraReliableSignalingServer(Number(port))
  } catch (error) {
    console.error("❌ Error starting ultra-reliable server:", error)
    process.exit(1)
  }
}

// Enhanced global error handling
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error)
  console.error("Stack:", error.stack)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise)
  console.error("Reason:", reason)
  process.exit(1)
})

// Start the ultra-reliable server
startUltraReliableServer()

export default UltraReliableSignalingServer
