"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const http_1 = require("http");
class SignalingServer {
    constructor(port = process.env.PORT || 8080) {
        this.sessions = new Map();
        this.userSessions = new Map();
        console.log("🚀 Initializing P2P Signaling Server...");
        this.server = (0, http_1.createServer)();
        this.server.on('request', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        });
        // Create WebSocket server
        this.wss = new ws_1.WebSocketServer({
            server: this.server,
            perMessageDeflate: false,
            maxPayload: 1024 * 1024 * 1024, // 1GB
            // Add production settings
            clientTracking: true,
            handleProtocols: (protocols) => protocols.values().next().value || false,
        });
        this.wss.on("connection", this.handleConnection.bind(this));
        // Clean up expired sessions every minute
        setInterval(this.cleanupSessions.bind(this), 60000);
        if (process.env.NODE_ENV === 'production') {
            // For production with SSL
            const https = require('https');
            const fs = require('fs');
            if (process.env.SSL_CERT && process.env.SSL_KEY) {
                const server = https.createServer({
                    cert: fs.readFileSync(process.env.SSL_CERT),
                    key: fs.readFileSync(process.env.SSL_KEY)
                });
                this.wss = new ws_1.WebSocketServer({ server });
                server.listen(port, '0.0.0.0', () => {
                    console.log(`✅ Secure WebSocket server running on wss://yourdomain.com:${port}`);
                });
            }
        }
        else {
            // Development server (existing code)
            this.server.listen(port, () => {
                console.log(`✅ Signaling server successfully started!`);
                console.log(`📡 WebSocket server running on ws://localhost:${port}`);
                console.log(`🔗 Ready to accept connections`);
                console.log("=".repeat(50));
            });
        }
        // Handle server errors
        this.server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(`❌ Port ${port} is already in use!`);
                console.log(`💡 Try killing the process using port ${port}:`);
                console.log(`   Windows: netstat -ano | findstr :${port}`);
                console.log(`   Mac/Linux: lsof -ti:${port} | xargs kill`);
                console.log(`   Or change the port in signaling-server/index.ts`);
            }
            else {
                console.error("❌ Server error:", error);
            }
            process.exit(1);
        });
        // Graceful shutdown
        process.on("SIGTERM", this.shutdown.bind(this));
        process.on("SIGINT", this.shutdown.bind(this));
    }
    shutdown() {
        console.log("\n🛑 Shutting down signaling server...");
        // Close all WebSocket connections
        this.wss.clients.forEach((ws) => {
            ws.close(10240, "Server shutting down");
        });
        // Close the server
        this.server.close(() => {
            console.log("✅ Server shut down gracefully");
            process.exit(0);
        });
    }
    handleConnection(ws) {
        console.log("🔗 New client connected");
        // Send immediate confirmation
        this.send(ws, {
            type: "connected",
            message: "Connected to signaling server",
            timestamp: new Date().toISOString(),
        });
        ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`📨 Received: ${message.type} ${message.sessionId ? `(session: ${message.sessionId})` : ""}`);
                this.handleMessage(ws, message);
            }
            catch (error) {
                console.error("❌ Invalid message format:", error);
                this.sendError(ws, "Invalid message format");
            }
        });
        ws.on("close", (code, reason) => {
            console.log(`🔌 Client disconnected: ${code} ${reason}`);
            this.handleDisconnection(ws);
        });
        ws.on("error", (error) => {
            console.error("❌ WebSocket error:", error);
            this.handleDisconnection(ws);
        });
        // Send ping every 30 seconds to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.ping();
            }
            else {
                clearInterval(pingInterval);
            }
        }, 30000);
        ws.on("pong", () => {
            // Connection is alive
        });
    }
    handleMessage(ws, message) {
        const { type, sessionId, userId } = message;
        // Validate session ID format (6 alphanumeric characters)
        if (sessionId && !/^[A-Z0-9]{6}$/.test(sessionId)) {
            this.sendError(ws, "Invalid session ID format");
            return;
        }
        switch (type) {
            case "join":
                this.handleJoin(ws, sessionId, userId, message.reconnect);
                break;
            case "ping":
                this.handlePing(ws, sessionId, userId);
                break;
            case "retry-connection":
                this.handleRetryConnection(ws, sessionId, userId);
                break;
            case "offer":
            case "answer":
            case "ice-candidate":
                this.relaySignalingMessage(ws, message);
                break;
            default:
                console.log(`⚠️ Unknown message type: ${type}`);
                this.sendError(ws, "Unknown message type");
        }
    }
    handleJoin(ws, sessionId, userId, isReconnect = false) {
        if (!sessionId || !userId) {
            this.sendError(ws, "Session ID and User ID are required");
            return;
        }
        console.log(`👤 User ${userId} ${isReconnect ? "reconnecting to" : "joining"} session ${sessionId}`);
        // Get or create session
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = {
                id: sessionId,
                users: new Map(),
                createdAt: new Date(),
                lastActivity: new Date(),
                connectionAttempts: 0,
            };
            this.sessions.set(sessionId, session);
            console.log(`🆕 Created session: ${sessionId}`);
        }
        // Check if user is already in session (reconnection)
        const existingUser = session.users.get(userId);
        if (existingUser) {
            console.log(`🔄 User ${userId} reconnecting to session ${sessionId}`);
            // Update the WebSocket connection
            existingUser.ws = ws;
            existingUser.lastSeen = new Date();
            this.userSessions.set(ws, sessionId);
            session.lastActivity = new Date();
            // Send confirmation
            this.send(ws, {
                type: "joined",
                sessionId,
                userCount: session.users.size,
                userId,
                isInitiator: existingUser.isInitiator,
            });
            // Notify other users about reconnection
            this.broadcastToSession(sessionId, {
                type: "user-reconnected",
                userId,
                userCount: session.users.size,
            }, ws);
            return;
        }
        // Check if session is full (max 2 users for P2P)
        if (session.users.size >= 2) {
            console.log(`❌ Session ${sessionId} is full (${session.users.size}/2 users)`);
            this.sendError(ws, "Session is full (maximum 2 users)");
            return;
        }
        // Determine if this user should be the initiator
        // First user to join becomes the initiator
        const isInitiator = session.users.size === 0;
        // Add user to session
        const userData = {
            ws,
            userId,
            joinedAt: new Date(),
            lastSeen: new Date(),
            isInitiator,
        };
        session.users.set(userId, userData);
        this.userSessions.set(ws, sessionId);
        session.lastActivity = new Date();
        console.log(`✅ User ${userId} joined session ${sessionId} (${session.users.size}/2 users) ${isInitiator ? "[INITIATOR]" : "[RECEIVER]"}`);
        // Send confirmation to the joining user
        this.send(ws, {
            type: "joined",
            sessionId,
            userCount: session.users.size,
            userId,
            isInitiator,
        });
        // If this is the second user, notify the first user to start connection
        if (session.users.size === 2) {
            console.log(`🚀 Session ${sessionId} is full, initiating P2P connection`);
            // Small delay to ensure both clients are ready
            setTimeout(() => {
                this.broadcastToSession(sessionId, {
                    type: "user-joined",
                    userId,
                    userCount: session.users.size,
                    readyForConnection: true,
                }, ws);
            }, 10240);
        }
        else {
            // Just notify about the join
            this.broadcastToSession(sessionId, {
                type: "user-joined",
                userId,
                userCount: session.users.size,
            }, ws);
        }
        // Log session state
        console.log(`📊 Session ${sessionId} users:`, Array.from(session.users.keys()));
    }
    handlePing(ws, sessionId, userId) {
        const session = this.sessions.get(sessionId);
        if (session && userId) {
            const user = session.users.get(userId);
            if (user) {
                user.lastSeen = new Date();
                session.lastActivity = new Date();
            }
        }
        this.send(ws, { type: "pong", timestamp: Date.now() });
    }
    handleRetryConnection(ws, sessionId, userId) {
        console.log(`🔄 Retry connection requested by ${userId} in session ${sessionId}`);
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.sendError(ws, "Session not found");
            return;
        }
        session.connectionAttempts++;
        session.lastActivity = new Date();
        // Broadcast retry request to all users in session
        this.broadcastToSession(sessionId, {
            type: "retry-connection",
            userId,
            attempt: session.connectionAttempts,
        });
    }
    relaySignalingMessage(ws, message) {
        const sessionId = this.userSessions.get(ws);
        if (!sessionId) {
            this.sendError(ws, "Not in a session");
            return;
        }
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.sendError(ws, "Session not found");
            return;
        }
        // Update last activity
        session.lastActivity = new Date();
        // Update user's last seen
        const userId = Array.from(session.users.entries()).find(([_, userData]) => userData.ws === ws)?.[0];
        if (userId) {
            const user = session.users.get(userId);
            if (user) {
                user.lastSeen = new Date();
            }
        }
        console.log(`🔄 Relaying ${message.type} from ${userId} in session ${sessionId} to ${session.users.size - 1} other users`);
        // Add sender info to message
        const relayMessage = {
            ...message,
            senderId: userId,
            timestamp: Date.now(),
        };
        // Relay message to other users in the session
        this.broadcastToSession(sessionId, relayMessage, ws);
    }
    handleDisconnection(ws) {
        const sessionId = this.userSessions.get(ws);
        if (!sessionId)
            return;
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        // Find and remove user from session
        let disconnectedUserId;
        for (const [userId, userData] of session.users.entries()) {
            if (userData.ws === ws) {
                disconnectedUserId = userId;
                // Don't immediately remove - mark as disconnected for potential reconnection
                userData.lastSeen = new Date(Date.now() - 60000); // Mark as 1 minute ago
                break;
            }
        }
        if (disconnectedUserId) {
            this.userSessions.delete(ws);
            console.log(`👋 User ${disconnectedUserId} disconnected from session ${sessionId}`);
            // Notify remaining users
            this.broadcastToSession(sessionId, {
                type: "user-left",
                userId: disconnectedUserId,
                userCount: session.users.size,
                temporary: true, // Indicate this might be temporary
            });
            // Schedule cleanup of disconnected user after 2 minutes
            setTimeout(() => {
                const currentSession = this.sessions.get(sessionId);
                if (currentSession) {
                    const user = currentSession.users.get(disconnectedUserId);
                    if (user && Date.now() - user.lastSeen.getTime() > 120000) {
                        // 2 minutes
                        currentSession.users.delete(disconnectedUserId);
                        console.log(`🗑️ Removed inactive user ${disconnectedUserId} from session ${sessionId}`);
                        // Notify remaining users
                        this.broadcastToSession(sessionId, {
                            type: "user-left",
                            userId: disconnectedUserId,
                            userCount: currentSession.users.size,
                            permanent: true,
                        });
                        // Remove empty sessions
                        if (currentSession.users.size === 0) {
                            this.sessions.delete(sessionId);
                            console.log(`🗑️ Removed empty session: ${sessionId}`);
                        }
                    }
                }
            }, 120000); // 2 minutes
        }
    }
    broadcastToSession(sessionId, message, excludeWs) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        let sentCount = 0;
        session.users.forEach((userData) => {
            if (userData.ws !== excludeWs && userData.ws.readyState === ws_1.WebSocket.OPEN) {
                this.send(userData.ws, message);
                sentCount++;
            }
        });
        if (sentCount > 0) {
            console.log(`📡 Broadcasted ${message.type} to ${sentCount} users in session ${sessionId}`);
        }
        else if (session.users.size > 1) {
            console.log(`⚠️ No active users to broadcast ${message.type} to in session ${sessionId}`);
        }
    }
    send(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    sendError(ws, message) {
        console.error(`❌ Error: ${message}`);
        this.send(ws, { type: "error", message });
    }
    cleanupSessions() {
        const now = new Date();
        const expiredSessions = [];
        this.sessions.forEach((session, sessionId) => {
            // Remove sessions inactive for more than 10 minutes
            const inactiveTime = now.getTime() - session.lastActivity.getTime();
            if (inactiveTime > 10 * 60 * 10240) {
                expiredSessions.push(sessionId);
            }
            else {
                // Clean up inactive users within active sessions
                const inactiveUsers = [];
                session.users.forEach((userData, userId) => {
                    const userInactiveTime = now.getTime() - userData.lastSeen.getTime();
                    if (userInactiveTime > 5 * 60 * 10240) {
                        // 5 minutes
                        inactiveUsers.push(userId);
                    }
                });
                inactiveUsers.forEach((userId) => {
                    session.users.delete(userId);
                    console.log(`🧹 Removed inactive user ${userId} from session ${sessionId}`);
                });
                // Remove session if no users left
                if (session.users.size === 0) {
                    expiredSessions.push(sessionId);
                }
            }
        });
        expiredSessions.forEach((sessionId) => {
            const session = this.sessions.get(sessionId);
            if (session) {
                // Close all connections in expired session
                session.users.forEach((userData) => {
                    this.sendError(userData.ws, "Session expired due to inactivity");
                    userData.ws.close();
                });
                this.sessions.delete(sessionId);
                console.log(`⏰ Expired session: ${sessionId}`);
            }
        });
        if (this.sessions.size > 0) {
            console.log(`📊 Active sessions: ${this.sessions.size}, Total connections: ${this.userSessions.size}`);
            this.sessions.forEach((session, sessionId) => {
                const activeUsers = Array.from(session.users.values()).filter((u) => u.ws.readyState === ws_1.WebSocket.OPEN).length;
                console.log(`   Session ${sessionId}: ${activeUsers}/${session.users.size} active users`);
            });
        }
    }
    getStats() {
        return {
            activeSessions: this.sessions.size,
            totalConnections: this.userSessions.size,
            sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
                id,
                userCount: session.users.size,
                activeUsers: Array.from(session.users.values()).filter((u) => u.ws.readyState === ws_1.WebSocket.OPEN).length,
                users: Array.from(session.users.entries()).map(([userId, userData]) => ({
                    userId,
                    isInitiator: userData.isInitiator,
                    joinedAt: userData.joinedAt,
                    lastSeen: userData.lastSeen,
                    connected: userData.ws.readyState === ws_1.WebSocket.OPEN,
                })),
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                connectionAttempts: session.connectionAttempts,
            })),
        };
    }
}
// Check if port is available
function checkPort(port) {
    return new Promise((resolve) => {
        const server = (0, http_1.createServer)();
        server.listen(port, () => {
            server.close(() => resolve(true));
        });
        server.on("error", () => resolve(false));
    });
}
// Start the server
async function startServer() {
    console.log("🔍 Checking if port 8080 is available...");
    const isPortAvailable = await checkPort(8080);
    if (!isPortAvailable) {
        console.error("❌ Port 8080 is already in use!");
        console.log("💡 Solutions:");
        console.log("   1. Kill the process using port 8080:");
        console.log("      Windows: netstat -ano | findstr :8080");
        console.log("      Mac/Linux: lsof -ti:8080 | xargs kill");
        console.log("   2. Or use a different port by editing this file");
        process.exit(1);
    }
    console.log("✅ Port 8080 is available");
    new SignalingServer(8080);
}
// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("💥 Uncaught Exception:", error);
    process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
// Start the server
startServer();
exports.default = SignalingServer;
