// "use client"

// import type React from "react"

// import { useState, useEffect, useRef, useCallback } from "react"
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { useUser } from "@clerk/nextjs"
// import { useParams, useRouter } from "next/navigation"
// import {
//   Upload,
//   Download,
//   Users,
//   Wifi,
//   WifiOff,
//   FileText,
//   AlertTriangle,
//   CheckCircle,
//   X,
//   RefreshCw,
//   Shield,
//   Smartphone,
//   Monitor,
//   Clock,
//   Scan,
//   Files,
// } from "lucide-react"

// // Import new components and utilities
// import { FilePreviewModal } from "@/components/file-preview-modal"
// import { ChatPanel } from "@/components/chat-panel"
// import { SpeedControl } from "@/components/speed-control"
// import { getAIScanner, type ScanResult } from "@/lib/ai-scanner"
// import { SessionManager } from "@/lib/session-manager"
// import { SpeedThrottle, type SpeedLimit } from "@/lib/speed-throttle"
// import { NotificationManager } from "@/lib/notifications"

// interface FileTransfer {
//   id: string
//   name: string
//   size: number
//   type: string
//   progress: number
//   status: "pending" | "scanning" | "transferring" | "completed" | "error" | "blocked"
//   direction: "sending" | "receiving"
//   checksum?: string
//   scanResult?: ScanResult
// }

// interface ChatMessage {
//   id: string
//   content: string
//   sender: string
//   timestamp: Date
//   type: "text" | "clipboard"
// }

// interface PeerConnection {
//   pc: RTCPeerConnection
//   dataChannel?: RTCDataChannel
//   connected: boolean
// }

// export default function SessionPage() {
//   const { user } = useUser()
//   const params = useParams()
//   const router = useRouter()
//   const sessionId = params.id as string

//   const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
//   const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
//   const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null)
//   const [fileTransfers, setFileTransfers] = useState<FileTransfer[]>([])
//   const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
//   const [dragOver, setDragOver] = useState(false)
//   const [error, setError] = useState("")
//   const [reconnectAttempts, setReconnectAttempts] = useState(0)
//   const [isInitiator, setIsInitiator] = useState(false)
//   const [userCount, setUserCount] = useState(0)
//   const [connectionAttempts, setConnectionAttempts] = useState(0)
//   const [lastHeartbeat, setLastHeartbeat] = useState<Date>(new Date())
//   const [isMobile, setIsMobile] = useState(false)

//   // New state for enhanced features
//   const [previewFiles, setPreviewFiles] = useState<File[]>([])
//   const [showPreview, setShowPreview] = useState(false)
//   const [speedLimit, setSpeedLimit] = useState<SpeedLimit>("unlimited")
//   const [currentSpeed, setCurrentSpeed] = useState(0)
//   const [sessionTimeLeft, setSessionTimeLeft] = useState(0)
//   const [showExpiryWarning, setShowExpiryWarning] = useState(false)

//   const wsRef = useRef<WebSocket | null>(null)
//   const fileInputRef = useRef<HTMLInputElement>(null)
//   const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
//   const peerConnectionRef = useRef<PeerConnection | null>(null)
//   const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
//   const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
//   const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([])
//   const speedThrottleRef = useRef<SpeedThrottle>(new SpeedThrottle())
//   const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
//   const receivedChunksRef = useRef<
//     Map<string, { chunks: ArrayBuffer[]; totalSize: number; fileName: string; fileType: string; checksum?: string }>
//   >(new Map())

//   // Initialize session management and notifications
//   useEffect(() => {
//     // Request notification permission
//     NotificationManager.requestPermission()

//     // Create session
//     SessionManager.createSession(sessionId)

//     // Start session timer
//     startSessionTimer()

//     return () => {
//       if (sessionTimerRef.current) {
//         clearInterval(sessionTimerRef.current)
//       }
//     }
//   }, [sessionId])

//   // Session timer
//   const startSessionTimer = () => {
//     sessionTimerRef.current = setInterval(() => {
//       const timeLeft = SessionManager.getTimeUntilExpiry(sessionId)
//       setSessionTimeLeft(timeLeft)

//       const shouldWarn = SessionManager.shouldShowWarning(sessionId)
//       if (shouldWarn && !showExpiryWarning) {
//         setShowExpiryWarning(true)
//         NotificationManager.showWarningNotification(
//           "Session Expiring Soon",
//           "Your session will expire in 2 minutes. Save any important data.",
//         )
//       }

//       if (timeLeft <= 0) {
//         handleSessionExpiry()
//       }
//     }, 1000)
//   }

//   const handleSessionExpiry = () => {
//     SessionManager.expireSession(sessionId)
//     setError("Session has expired due to inactivity")
//     cleanup()
//     setTimeout(() => {
//       router.push("/")
//     }, 3000)
//   }

//   // Detect mobile device
//   useEffect(() => {
//     const checkMobile = () => {
//       setIsMobile(
//         window.innerWidth < 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
//       )
//     }

//     checkMobile()
//     window.addEventListener("resize", checkMobile)
//     return () => window.removeEventListener("resize", checkMobile)
//   }, [])

//   // Update speed throttle when limit changes
//   useEffect(() => {
//     speedThrottleRef.current.setLimit(speedLimit)
//   }, [speedLimit])

//   // Cleanup function
//   const cleanup = useCallback(() => {
//     console.log("🧹 Cleaning up connections...")

//     if (connectionTimeoutRef.current) {
//       clearTimeout(connectionTimeoutRef.current)
//     }
//     if (heartbeatIntervalRef.current) {
//       clearInterval(heartbeatIntervalRef.current)
//     }
//     if (reconnectTimeoutRef.current) {
//       clearTimeout(reconnectTimeoutRef.current)
//     }
//     if (sessionTimerRef.current) {
//       clearInterval(sessionTimerRef.current)
//     }
//     if (peerConnectionRef.current?.pc) {
//       peerConnectionRef.current.pc.close()
//       peerConnectionRef.current = null
//     }
//     if (wsRef.current) {
//       wsRef.current.close(1000, "Component cleanup")
//       wsRef.current = null
//     }
//     iceCandidatesQueue.current = []
//     setChatMessages([]) // Clear chat on cleanup
//   }, [])

//   // WebSocket connection with retry logic
//   const connectWebSocket = useCallback(() => {
//     if (!user || !sessionId) return

//     // Validate session before connecting
//     if (!SessionManager.validateSession(sessionId)) {
//       setError("Session has expired or is invalid")
//       router.push("/")
//       return
//     }

//     console.log(`🔌 Attempting WebSocket connection (attempt ${reconnectAttempts + 1})`)
//     setWsStatus("connecting")
//     setError("")

//     // Try multiple WebSocket URLs
//     const wsUrls = [
//       process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080",
//       // Fallback URLs for production
//       ...(process.env.NODE_ENV === "production"
//         ? [`wss://${window.location.hostname}:8080`, `ws://${window.location.hostname}:8080`]
//         : ["ws://127.0.0.1:8080"]),
//     ]


//     let currentUrlIndex = 0

//     const tryConnection = () => {
//       if (currentUrlIndex >= wsUrls.length) {
//         setWsStatus("error")
//         setError("Failed to connect to signaling server. Please ensure the server is running.")
//         return
//       }

//       const wsUrl = wsUrls[currentUrlIndex]
//       console.log(`🔗 Trying WebSocket URL: ${wsUrl}`)

//       const ws = new WebSocket(wsUrl)
//       wsRef.current = ws

//       const connectionTimeout = setTimeout(() => {
//         if (ws.readyState === WebSocket.CONNECTING) {
//           console.log(`⏰ Connection timeout for ${wsUrl}`)
//           ws.close()
//           currentUrlIndex++
//           tryConnection()
//         }
//       }, 5000)

//       ws.onopen = () => {
//         clearTimeout(connectionTimeout)
//         console.log(`✅ WebSocket connected to ${wsUrl}`)
//         setWsStatus("connected")
//         setReconnectAttempts(0)

//         // Join session immediately
//         ws.send(
//           JSON.stringify({
//             type: "join",
//             sessionId,
//             userId: user.id,
//             reconnect: connectionAttempts > 0,
//             timestamp: Date.now(),
//           }),
//         )

//         // Start heartbeat
//         startHeartbeat()
//       }

//       ws.onmessage = async (event) => {
//         try {
//           const message = JSON.parse(event.data)
//           console.log("📨 Received message:", message.type, message)
//           setLastHeartbeat(new Date())
//           await handleSignalingMessage(message)
//         } catch (error) {
//           console.error("❌ Error parsing message:", error)
//         }
//       }

//       ws.onclose = (event) => {
//         clearTimeout(connectionTimeout)
//         console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
//         setWsStatus("disconnected")
//         stopHeartbeat()

//         if (event.code !== 1000) {
//           scheduleReconnect()
//         }
//       }

//       ws.onerror = (error) => {
//         clearTimeout(connectionTimeout)
//         console.error(`❌ WebSocket error on ${wsUrl}:`, error)
//         currentUrlIndex++
//         tryConnection()
//       }
//     }

//     tryConnection()
//   }, [user, sessionId, reconnectAttempts, connectionAttempts])

//   const startHeartbeat = () => {
//     stopHeartbeat()
//     heartbeatIntervalRef.current = setInterval(() => {
//       if (wsRef.current?.readyState === WebSocket.OPEN) {
//         wsRef.current.send(JSON.stringify({ type: "ping", sessionId, userId: user?.id }))
//         // Extend session on activity
//         SessionManager.extendSession(sessionId)
//       }
//     }, 30000)
//   }

//   const stopHeartbeat = () => {
//     if (heartbeatIntervalRef.current) {
//       clearInterval(heartbeatIntervalRef.current)
//       heartbeatIntervalRef.current = null
//     }
//   }

//   const scheduleReconnect = useCallback(() => {
//     if (reconnectAttempts >= 5) {
//       setWsStatus("error")
//       setError("Maximum reconnection attempts reached. Please refresh the page.")
//       return
//     }

//     const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
//     console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`)

//     reconnectTimeoutRef.current = setTimeout(() => {
//       setReconnectAttempts((prev) => prev + 1)
//       connectWebSocket()
//     }, delay)
//   }, [reconnectAttempts, connectWebSocket])

//   // Initial connection
//   useEffect(() => {
//     connectWebSocket()
//     return cleanup
//   }, [connectWebSocket, cleanup])

//   // Manual reconnect
//   const handleReconnect = () => {
//     setReconnectAttempts(0)
//     setConnectionAttempts((prev) => prev + 1)
//     cleanup()
//     setTimeout(connectWebSocket, 1000)
//   }

//   // Reset P2P connection
//   const resetPeerConnection = useCallback(() => {
//     console.log("🔄 Resetting peer connection...")

//     if (peerConnectionRef.current?.pc) {
//       peerConnectionRef.current.pc.close()
//     }

//     setPeerConnection(null)
//     peerConnectionRef.current = null
//     setConnectionStatus("connecting")
//     iceCandidatesQueue.current = []

//     if (connectionTimeoutRef.current) {
//       clearTimeout(connectionTimeoutRef.current)
//     }
//   }, [])

//   // WebRTC setup with proper configuration
//   const createPeerConnection = useCallback(() => {
//     console.log("🔗 Creating peer connection")

//     const pc = new RTCPeerConnection({
//       iceServers: [
//         { urls: "stun:stun.l.google.com:19302" },
//         { urls: "stun:stun1.l.google.com:19302" },
//         { urls: "stun:stun2.l.google.com:19302" },
//         { urls: "stun:stun.cloudflare.com:3478" },
//       ],
//       iceCandidatePoolSize: 10,
//     })

//     let connectionEstablished = false

//     pc.onicecandidate = (event) => {
//       if (event.candidate) {
//         console.log("🧊 Sending ICE candidate:", event.candidate.type)
//         if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//           wsRef.current.send(
//             JSON.stringify({
//               type: "ice-candidate",
//               sessionId,
//               candidate: event.candidate,
//             }),
//           )
//         }
//       } else {
//         console.log("🧊 ICE gathering complete")
//       }
//     }

//     pc.onconnectionstatechange = () => {
//       console.log("🔄 Peer connection state:", pc.connectionState)

//       switch (pc.connectionState) {
//         case "connected":
//           if (!connectionEstablished) {
//             console.log("✅ P2P connection established!")
//             connectionEstablished = true
//             setConnectionStatus("connected")
//             NotificationManager.showConnectionNotification(true, "peer")
//             if (connectionTimeoutRef.current) {
//               clearTimeout(connectionTimeoutRef.current)
//             }
//           }
//           break
//         case "connecting":
//           setConnectionStatus("connecting")
//           break
//         case "disconnected":
//           console.log("⚠️ P2P connection disconnected")
//           if (connectionEstablished) {
//             setConnectionStatus("connecting")
//             NotificationManager.showConnectionNotification(false)
//             setTimeout(() => {
//               if (pc.connectionState === "disconnected") {
//                 console.log("🔄 Attempting to restart ICE...")
//                 pc.restartIce()
//               }
//             }, 2000)
//           }
//           break
//         case "failed":
//           console.log("❌ P2P connection failed")
//           setConnectionStatus("disconnected")
//           connectionEstablished = false
//           NotificationManager.showConnectionNotification(false)
//           break
//         case "closed":
//           console.log("🔌 P2P connection closed")
//           setConnectionStatus("disconnected")
//           connectionEstablished = false
//           NotificationManager.showConnectionNotification(false)
//           break
//       }
//     }

//     pc.oniceconnectionstatechange = () => {
//       console.log("🧊 ICE connection state:", pc.iceConnectionState)

//       switch (pc.iceConnectionState) {
//         case "connected":
//         case "completed":
//           if (!connectionEstablished) {
//             console.log("✅ ICE connection successful")
//           }
//           break
//         case "disconnected":
//           console.log("⚠️ ICE disconnected, will attempt to reconnect...")
//           break
//         case "failed":
//           console.log("❌ ICE connection failed, restarting...")
//           setTimeout(() => {
//             if (pc.iceConnectionState === "failed") {
//               pc.restartIce()
//             }
//           }, 1000)
//           break
//       }
//     }

//     pc.ondatachannel = (event) => {
//       console.log("📡 Data channel received:", event.channel.label)
//       const channel = event.channel
//       setupDataChannel(channel)
//     }

//     // Set connection timeout
//     connectionTimeoutRef.current = setTimeout(() => {
//       if (!connectionEstablished) {
//         console.log("⏰ P2P connection timeout")
//         setError("Connection timeout. Click retry to attempt again.")
//       }
//     }, 30000) // 30 second timeout

//     return pc
//   }, [sessionId])

//   const setupDataChannel = (channel: RTCDataChannel) => {
//     console.log("📡 Setting up data channel:", channel.label, "State:", channel.readyState)

//     channel.binaryType = "arraybuffer"

//     channel.onmessage = (event) => {
//       handleDataChannelMessage(event.data)
//     }

//     channel.onopen = () => {
//       console.log("📡 Data channel opened - ready for file transfer!")
//       setConnectionStatus("connected")

//       if (connectionTimeoutRef.current) {
//         clearTimeout(connectionTimeoutRef.current)
//       }

//       // Send a test message to verify bidirectional communication
//       try {
//         channel.send(
//           JSON.stringify({
//             type: "connection-test",
//             message: "Data channel ready",
//             timestamp: Date.now(),
//           }),
//         )
//         console.log("📤 Sent connection test message")
//       } catch (error) {
//         console.error("❌ Failed to send test message:", error)
//       }
//     }

//     channel.onclose = () => {
//       console.log("📡 Data channel closed")
//       setConnectionStatus("disconnected")
//     }

//     channel.onerror = (error) => {
//       console.error("❌ Data channel error:", error)
//       setConnectionStatus("disconnected")
//     }

//     // Store reference to data channel
//     if (peerConnectionRef.current) {
//       peerConnectionRef.current.dataChannel = channel
//     }
//   }

//   const handleSignalingMessage = async (message: any) => {
//     switch (message.type) {
//       case "connected":
//         console.log("✅ Signaling server connection confirmed")
//         break

//       case "pong":
//         setLastHeartbeat(new Date())
//         break

//       case "joined":
//         console.log(`👤 Joined session ${message.sessionId} (${message.userCount}/2 users)`)
//         setUserCount(message.userCount)

//         if (message.userCount === 1 || message.isInitiator) {
//           setIsInitiator(true)
//           console.log("👑 This user will initiate the connection")
//         } else {
//           setIsInitiator(false)
//           console.log("👤 This user will wait for connection")
//         }
//         break

//       case "user-joined":
//         console.log(`👤 Another user joined! User count: ${message.userCount}`)
//         setUserCount(message.userCount)

//         if (isInitiator && message.userCount === 2) {
//           console.log("🚀 Initiating WebRTC connection as initiator")
//           setTimeout(() => initiateConnection(), 1500)
//         }
//         break

//       case "user-reconnected":
//         console.log(`🔄 User reconnected to session`)
//         setUserCount(message.userCount)

//         if (message.userCount === 2) {
//           resetPeerConnection()
//           setTimeout(() => {
//             if (isInitiator) {
//               initiateConnection()
//             }
//           }, 2000)
//         }
//         break

//       case "retry-connection":
//         console.log("🔄 Retry connection requested")
//         resetPeerConnection()
//         setTimeout(() => {
//           if (isInitiator) {
//             initiateConnection()
//           }
//         }, 1000)
//         break

//       case "offer":
//         console.log("📨 Received offer, creating answer")
//         await handleOffer(message.offer)
//         break

//       case "answer":
//         console.log("📨 Received answer")
//         await handleAnswer(message.answer)
//         break

//       case "ice-candidate":
//         console.log("🧊 Received ICE candidate")
//         await handleIceCandidate(message.candidate)
//         break

//       case "user-left":
//         console.log("👋 User left session")
//         setConnectionStatus("disconnected")
//         setUserCount(message.userCount)
//         resetPeerConnection()
//         break

//       case "error":
//         console.error("❌ Signaling error:", message.message)
//         setError(message.message)
//         break
//     }
//   }

//   const initiateConnection = async () => {
//     try {
//       console.log("🔗 Initiating connection as initiator")

//       if (peerConnectionRef.current?.pc) {
//         peerConnectionRef.current.pc.close()
//       }

//       const pc = createPeerConnection()

//       // Create data channel with FIXED configuration (only maxRetransmits, no maxPacketLifeTime)
//       const dataChannel = pc.createDataChannel("fileTransfer", {
//         ordered: true,
//         maxRetransmits: 3, // Only use maxRetransmits, not maxPacketLifeTime
//       })

//       console.log("📡 Created data channel:", dataChannel.label)
//       setupDataChannel(dataChannel)

//       const connection = { pc, dataChannel, connected: false }
//       setPeerConnection(connection)
//       peerConnectionRef.current = connection

//       console.log("📤 Creating offer...")
//       const offer = await pc.createOffer()

//       console.log("📤 Setting local description...")
//       await pc.setLocalDescription(offer)

//       console.log("📤 Sending offer to peer...")
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             type: "offer",
//             sessionId,
//             offer: pc.localDescription,
//             timestamp: Date.now(),
//           }),
//         )
//       } else {
//         throw new Error("WebSocket not connected")
//       }
//     } catch (error) {
//       console.error("❌ Error initiating connection:", error)
//       setError("Failed to initiate connection: " + (error as Error).message)
//       resetPeerConnection()
//     }
//   }

//   const handleOffer = async (offer: RTCSessionDescriptionInit) => {
//     try {
//       console.log("📥 Handling received offer")

//       if (peerConnectionRef.current?.pc) {
//         peerConnectionRef.current.pc.close()
//       }

//       const pc = createPeerConnection()

//       const connection = { pc, connected: false }
//       setPeerConnection(connection)
//       peerConnectionRef.current = connection

//       console.log("📥 Setting remote description...")
//       await pc.setRemoteDescription(offer)

//       // Process any queued ICE candidates
//       while (iceCandidatesQueue.current.length > 0) {
//         const candidate = iceCandidatesQueue.current.shift()
//         if (candidate) {
//           try {
//             await pc.addIceCandidate(candidate)
//             console.log("✅ Added queued ICE candidate")
//           } catch (error) {
//             console.error("❌ Error adding queued ICE candidate:", error)
//           }
//         }
//       }

//       console.log("📤 Creating answer...")
//       const answer = await pc.createAnswer()

//       console.log("📤 Setting local description...")
//       await pc.setLocalDescription(answer)

//       console.log("📤 Sending answer to peer...")
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(
//           JSON.stringify({
//             type: "answer",
//             sessionId,
//             answer: pc.localDescription,
//             timestamp: Date.now(),
//           }),
//         )
//       } else {
//         throw new Error("WebSocket not connected")
//       }
//     } catch (error) {
//       console.error("❌ Error handling offer:", error)
//       setError("Failed to handle connection offer: " + (error as Error).message)
//       resetPeerConnection()
//     }
//   }

// const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
//   try {
//     console.log("📥 Handling received answer")
//     if (peerConnectionRef.current?.pc) {
//       // Check the current signaling state before setting remote description
//       console.log("Current signaling state:", peerConnectionRef.current.pc.signalingState)
      
//       // Only set remote description if we're in the correct state
//       if (peerConnectionRef.current.pc.signalingState === "have-local-offer") {
//         await peerConnectionRef.current.pc.setRemoteDescription(answer)
//         console.log("✅ Answer processed successfully")

//         // Process any queued ICE candidates
//         while (iceCandidatesQueue.current.length > 0) {
//           const candidate = iceCandidatesQueue.current.shift()
//           if (candidate) {
//             try {
//               await peerConnectionRef.current.pc.addIceCandidate(candidate)
//               console.log("✅ Added queued ICE candidate")
//             } catch (error) {
//               console.error("❌ Error adding queued ICE candidate:", error)
//             }
//           }
//         }
//       } else {
//         console.warn("⚠️ Cannot set remote description - wrong signaling state:", peerConnectionRef.current.pc.signalingState)
//         // If we're in wrong state, reset the connection
//         resetPeerConnection()
//         setTimeout(() => {
//           if (!isInitiator) {
//             console.log("🔄 Non-initiator waiting for new offer...")
//           }
//         }, 1000)
//       }
//     }
//   } catch (error) {
//     console.error("❌ Error handling answer:", error)
//     setError("Failed to handle connection answer: " + (error as Error).message)
//     resetPeerConnection()
//   }
// }
//   const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
//     try {
//       console.log("🧊 Adding ICE candidate")
//       if (peerConnectionRef.current?.pc && peerConnectionRef.current.pc.remoteDescription) {
//         await peerConnectionRef.current.pc.addIceCandidate(candidate)
//         console.log("✅ ICE candidate added successfully")
//       } else {
//         console.log("⚠️ Queuing ICE candidate (no remote description yet)")
//         iceCandidatesQueue.current.push(candidate)
//       }
//     } catch (error) {
//       console.error("❌ Error adding ICE candidate:", error)
//     }
//   }

//   // File checksum calculation for security
//   const calculateChecksum = async (file: File): Promise<string> => {
//     const arrayBuffer = await file.arrayBuffer()
//     const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
//     const hashArray = Array.from(new Uint8Array(hashBuffer))
//     return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
//   }

//   // Enhanced data channel message handler with chat support
//   const handleDataChannelMessage = (data: ArrayBuffer | string) => {
//     if (typeof data === "string") {
//       const message = JSON.parse(data)

//       if (message.type === "connection-test") {
//         console.log("📨 Received connection test:", message.message)
//         if (peerConnectionRef.current?.dataChannel?.readyState === "open") {
//           peerConnectionRef.current.dataChannel.send(
//             JSON.stringify({
//               type: "connection-ack",
//               message: "Connection confirmed",
//               timestamp: Date.now(),
//             }),
//           )
//         }
//         return
//       }

//       if (message.type === "connection-ack") {
//         console.log("✅ Connection acknowledged by peer")
//         return
//       }

//       // Handle chat messages
//       if (message.type === "chat-message") {
//         const chatMessage: ChatMessage = {
//           id: message.id,
//           content: message.content,
//           sender: message.sender,
//           timestamp: new Date(message.timestamp),
//           type: message.messageType || "text",
//         }
//         setChatMessages((prev) => [...prev, chatMessage])
//         return
//       }

//       if (message.type === "file-start") {
//         console.log("📥 Starting file reception:", message.fileName)
//         const transfer: FileTransfer = {
//           id: message.fileId,
//           name: message.fileName,
//           size: message.fileSize,
//           type: message.fileType,
//           progress: 0,
//           status: "transferring",
//           direction: "receiving",
//           checksum: message.checksum,
//         }

//         setFileTransfers((prev) => [...prev, transfer])
//         receivedChunksRef.current.set(message.fileId, {
//           chunks: [],
//           totalSize: message.fileSize,
//           fileName: message.fileName,
//           fileType: message.fileType,
//           checksum: message.checksum,
//         })
//       } else if (message.type === "file-end") {
//         console.log("📥 File reception complete:", message.fileId)
//         const fileData = receivedChunksRef.current.get(message.fileId)
//         if (fileData) {
//           const blob = new Blob(fileData.chunks, { type: fileData.fileType })

//           if (fileData.checksum) {
//             verifyAndDownloadFile(blob, fileData.fileName, fileData.checksum, message.fileId)
//           } else {
//             downloadFile(blob, fileData.fileName)
//             setFileTransfers((prev) =>
//               prev.map((t) => (t.id === message.fileId ? { ...t, status: "completed", progress: 100 } : t)),
//             )
//           }

//           receivedChunksRef.current.delete(message.fileId)
//         }
//       }
//     } else {
//       // Binary data (file chunk)
//       const view = new DataView(data)
//       const fileIdLength = view.getUint32(0)
//       const fileId = new TextDecoder().decode(data.slice(4, 4 + fileIdLength))
//       const chunkData = data.slice(4 + fileIdLength)

//       const fileData = receivedChunksRef.current.get(fileId)
//       if (fileData) {
//         fileData.chunks.push(chunkData)
//         const receivedSize = fileData.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
//         const progress = Math.round((receivedSize / fileData.totalSize) * 100)

//         setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, progress } : t)))

//         // Update current speed
//         setCurrentSpeed(speedThrottleRef.current.getCurrentSpeed())
//       }
//     }
//   }

//   const verifyAndDownloadFile = async (blob: Blob, fileName: string, expectedChecksum: string, fileId: string) => {
//     try {
//       const arrayBuffer = await blob.arrayBuffer()
//       const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
//       const hashArray = Array.from(new Uint8Array(hashBuffer))
//       const actualChecksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

//       if (actualChecksum === expectedChecksum) {
//         console.log("✅ File checksum verified")
//         downloadFile(blob, fileName)
//         setFileTransfers((prev) =>
//           prev.map((t) => (t.id === fileId ? { ...t, status: "completed", progress: 100 } : t)),
//         )
//         NotificationManager.showFileNotification(fileName, true)
//       } else {
//         console.error("❌ File checksum mismatch")
//         setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error", progress: 0 } : t)))
//         setError("File integrity check failed")
//         NotificationManager.showFileNotification(fileName, false, "Checksum verification failed")
//       }
//     } catch (error) {
//       console.error("❌ Error verifying file:", error)
//       setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error", progress: 0 } : t)))
//       NotificationManager.showFileNotification(fileName, false, "Verification error")
//     }
//   }

//   const downloadFile = (blob: Blob, fileName: string) => {
//     const url = URL.createObjectURL(blob)
//     const a = document.createElement("a")
//     a.href = url
//     a.download = fileName
//     document.body.appendChild(a)
//     a.click()
//     document.body.removeChild(a)
//     URL.revokeObjectURL(url)
//   }

//   const validateFile = (file: File): string | null => {
//     if (file.size > 100 * 1024 * 1024) {
//       return "File size must be less than 100MB"
//     }

//     const blockedExtensions = [
//       ".exe",
//       ".bat",
//       ".sh",
//       ".cmd",
//       ".scr",
//       ".pif",
//       ".com",
//       ".msi",
//       ".app",
//       ".deb",
//       ".rpm",
//       ".dmg",
//       ".pkg",
//       ".run",
//       ".bin",
//       ".jar",
//       ".vbs",
//       ".ps1",
//     ]
//     const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()

//     if (blockedExtensions.includes(fileExtension)) {
//       return "This file type is not allowed for security reasons"
//     }

//     const suspiciousPatterns = [
//       /^\./,
//       /\.(exe|bat|cmd|scr|pif|com|msi|app|deb|rpm|dmg|pkg|run|bin|jar|vbs|ps1)$/i,
//       /[<>:"|?*]/,
//     ]

//     if (suspiciousPatterns.some((pattern) => pattern.test(file.name))) {
//       return "File name contains invalid or suspicious characters"
//     }

//     return null
//   }

//   // Enhanced file sending with AI scanning and preview - now supports multiple files
//   const sendFiles = async (files: File[]) => {
//     if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
//       setError("Data channel not ready for file transfer")
//       return
//     }

//     console.log(`📤 Starting batch file transfer: ${files.length} files`)

//     // Process each file sequentially to avoid overwhelming the connection
//     for (const file of files) {
//       await sendSingleFile(file)
//       // Small delay between files
//       await new Promise((resolve) => setTimeout(resolve, 100))
//     }
//   }

//   const sendSingleFile = async (file: File) => {
//     const validationError = validateFile(file)
//     if (validationError) {
//       setError(validationError)
//       return
//     }

//     try {
//       const fileId = Math.random().toString(36).substring(2, 15)

//       // Create transfer record with scanning status
//       const transfer: FileTransfer = {
//         id: fileId,
//         name: file.name,
//         size: file.size,
//         type: file.type,
//         progress: 0,
//         status: "scanning",
//         direction: "sending",
//       }

//       setFileTransfers((prev) => [...prev, transfer])

//       // AI scan the file
//       const scanner = getAIScanner()
//       if (scanner) {
//         console.log("🔍 Scanning file with AI:", file.name)
//         const scanResult = await scanner.scanFile(file)

//         setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, scanResult } : t)))

//         if (scanResult.isRisky) {
//           console.log("🚫 File blocked by AI scan:", scanResult.reason)
//           setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "blocked" } : t)))
//           setError(`File blocked: ${scanResult.reason}`)
//           return
//         }
//       }

//       // Calculate checksum
//       const checksum = await calculateChecksum(file)

//       // Update transfer with checksum
//       setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, checksum, status: "transferring" } : t)))

//       console.log("📤 Starting file transfer:", file.name, "Size:", file.size, "ID:", fileId)

//       // Send file metadata
//       if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
//         setError("Data channel not ready for file transfer")
//         setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
//         return
//       }

//       peerConnection.dataChannel.send(
//         JSON.stringify({
//           type: "file-start",
//           fileId,
//           fileName: file.name,
//           fileSize: file.size,
//           fileType: file.type,
//           checksum,
//         }),
//       )

//       // Send file in chunks with speed throttling
//       const chunkSize = 16384 // 16KB chunks
//       const reader = new FileReader()
//       let offset = 0
//       let isTransferring = true

//       const sendChunk = async () => {
//         if (!isTransferring || !peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
//           console.log("❌ Transfer stopped - data channel not ready")
//           setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
//           return
//         }

//         const slice = file.slice(offset, offset + chunkSize)
//         reader.readAsArrayBuffer(slice)
//       }

//       reader.onload = async (e) => {
//         if (!isTransferring || !e.target?.result) return

//         const chunk = e.target.result as ArrayBuffer

//         // Apply speed throttling
//         await speedThrottleRef.current.throttle(chunk.byteLength)

//         const fileIdBytes = new TextEncoder().encode(fileId)
//         const message = new ArrayBuffer(4 + fileIdBytes.length + chunk.byteLength)
//         const view = new DataView(message)

//         view.setUint32(0, fileIdBytes.length)
//         new Uint8Array(message, 4, fileIdBytes.length).set(fileIdBytes)
//         new Uint8Array(message, 4 + fileIdBytes.length).set(new Uint8Array(chunk))

//         try {
//           if (peerConnection?.dataChannel?.readyState === "open") {
//             peerConnection.dataChannel.send(message)

//             offset += chunkSize
//             const progress = Math.min(Math.round((offset / file.size) * 100), 100)

//             setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, progress } : t)))
//             setCurrentSpeed(speedThrottleRef.current.getCurrentSpeed())

//             if (offset < file.size) {
//               setTimeout(sendChunk, 10) // Small delay to prevent overwhelming
//             } else {
//               console.log("📤 File transfer complete:", file.name)
//               peerConnection.dataChannel.send(
//                 JSON.stringify({
//                   type: "file-end",
//                   fileId,
//                 }),
//               )

//               setFileTransfers((prev) =>
//                 prev.map((t) => (t.id === fileId ? { ...t, status: "completed", progress: 100 } : t)),
//               )
//               NotificationManager.showFileNotification(file.name, true)
//               isTransferring = false
//             }
//           } else {
//             throw new Error("Data channel not open")
//           }
//         } catch (error) {
//           console.error("❌ Error sending chunk:", error)
//           setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
//           setError("File transfer failed: " + (error as Error).message)
//           NotificationManager.showFileNotification(file.name, false, (error as Error).message)
//           isTransferring = false
//         }
//       }

//       reader.onerror = () => {
//         console.error("❌ Error reading file")
//         setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
//         setError("Failed to read file")
//         NotificationManager.showFileNotification(file.name, false, "Failed to read file")
//         isTransferring = false
//       }

//       sendChunk()
//     } catch (error) {
//       console.error("❌ Error preparing file:", error)
//       setError("Failed to prepare file for transfer: " + (error as Error).message)
//     }
//   }

//   // Enhanced file selection with multi-file support
//   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const files = Array.from(e.target.files || [])
//     if (files.length > 0) {
//       // Show preview for all selected files
//       setPreviewFiles(files)
//       setShowPreview(true)
//     }
//     e.target.value = ""
//   }

//   // Handle adding more files to existing preview
//   const handleAddMoreFiles = () => {
//     fileInputRef.current?.click()
//   }

//   // Handle preview modal actions
//   const handlePreviewSend = (files: File[]) => {
//     sendFiles(files)
//     setPreviewFiles([])
//   }

//   const handlePreviewCancel = () => () => {
//     setPreviewFiles([])
//   }

//   // Handle chat message sending
//   const handleSendChatMessage = (content: string, type: "text" | "clipboard") => {
//     if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
//       setError("Cannot send message - not connected")
//       return
//     }

//     const message: ChatMessage = {
//       id: Math.random().toString(36).substring(2, 15),
//       content,
//       sender: user?.firstName || "You",
//       timestamp: new Date(),
//       type,
//     }

//     // Add to local messages
//     setChatMessages((prev) => [...prev, message])

//     // Send to peer
//     peerConnection.dataChannel.send(
//       JSON.stringify({
//         type: "chat-message",
//         id: message.id,
//         content: message.content,
//         sender: message.sender,
//         timestamp: message.timestamp.getTime(),
//         messageType: type,
//       }),
//     )

//     // Extend session on activity
//     SessionManager.extendSession(sessionId)
//   }

//   const handleDrop = (e: React.DragEvent) => {
//     e.preventDefault()
//     setDragOver(false)

//     const files = Array.from(e.dataTransfer.files)
//     if (files.length > 0) {
//       // Show preview for all dropped files
//       setPreviewFiles(files)
//       setShowPreview(true)
//     }
//   }

//   // Mobile-specific touch handlers
//   const handleTouchStart = (e: React.TouchEvent) => {
//     e.preventDefault()
//     setDragOver(true)
//   }

//   const handleTouchEnd = (e: React.TouchEvent) => {
//     e.preventDefault()
//     setDragOver(false)
//   }

//   // Format time remaining
//   const formatTimeRemaining = (ms: number): string => {
//     const minutes = Math.floor(ms / 60000)
//     const seconds = Math.floor((ms % 60000) / 1000)
//     return `${minutes}:${seconds.toString().padStart(2, "0")}`
//   }

//   if (!user) {
//     router.push("/")
//     return null
//   }

//   return (
//     <div className="min-h-screen bg-purple-300 p-2 md:p-4">
//       <div className="max-w-7xl mx-auto">
//         <header className="text-center mb-4 md:mb-6">
//           <h1 className="text-2xl md:text-4xl font-black text-black mb-2">SESSION: {sessionId}</h1>
//           <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap">
//             <div
//               className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${wsStatus === "connected" ? "bg-green-400" : wsStatus === "connecting" ? "bg-yellow-400" : "bg-red-400"
//                 }`}
//             >
//               {wsStatus === "connected" ? (
//                 <Wifi className="w-3 md:w-5 h-3 md:h-5" />
//               ) : (
//                 <WifiOff className="w-3 md:w-5 h-3 md:h-5" />
//               )}
//               <span className="hidden md:inline">SIGNALING:</span>
//               <span className="md:hidden">SIG:</span>
//               {wsStatus.toUpperCase()}
//             </div>
//             <div
//               className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${connectionStatus === "connected"
//                   ? "bg-green-400"
//                   : connectionStatus === "connecting"
//                     ? "bg-yellow-400"
//                     : "bg-red-400"
//                 }`}
//             >
//               {connectionStatus === "connected" ? (
//                 <Users className="w-3 md:w-5 h-3 md:h-5" />
//               ) : (
//                 <WifiOff className="w-3 md:w-5 h-3 md:h-5" />
//               )}
//               P2P: {connectionStatus.toUpperCase()}
//             </div>
//             <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-blue-400 text-xs md:text-sm">
//               <Users className="w-3 md:w-5 h-3 md:h-5" />
//               {userCount}/2
//             </div>
//             <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-purple-400 text-xs md:text-sm">
//               <Shield className="w-3 md:w-5 h-3 md:h-5" />
//               {isMobile ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
//             </div>
//             {/* {sessionTimeLeft > 0 && (
//               <div
//                 className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${showExpiryWarning ? "bg-red-400" : "bg-gray-400"
//                   }`}
//               >
//                 <Clock className="w-3 md:w-5 h-3 md:h-5" />
//                 {formatTimeRemaining(sessionTimeLeft)}
//               </div>
//             // )} */}
//            </div>
//         </header>

//         {error && (
//           <Card className="neubrutalism-card bg-red-300 mb-4 md:mb-6">
//             <CardContent className="p-3 md:p-4 flex items-center gap-2">
//               <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0" />
//               <span className="font-bold flex-1 text-sm md:text-base">{error}</span>
//               {wsStatus === "error" && (
//                 <Button
//                   onClick={handleReconnect}
//                   size="sm"
//                   className="neubrutalism-button bg-blue-500 text-white text-xs md:text-sm"
//                 >
//                   <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
//                   RECONNECT
//                 </Button>
//               )}
//               <Button onClick={() => setError("")} variant="ghost" size="sm" className="touch-target">
//                 <X className="w-4 h-4" />
//               </Button>
//             </CardContent>
//           </Card>
//         )}

//         {/* {showExpiryWarning && (
//           <Card className="neubrutalism-card bg-orange-300 mb-4 md:mb-6">
//             <CardContent className="p-3 md:p-4 flex items-center gap-2">
//               <Clock className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0" />
//               <span className="font-bold flex-1 text-sm md:text-base">
//                 Session expires in {formatTimeRemaining(sessionTimeLeft)}. Save any important data!
//               </span>
//               <Button onClick={() => setShowExpiryWarning(false)} variant="ghost" size="sm" className="touch-target">
//                 <X className="w-4 h-4" />
//               </Button>
//             </CardContent>
//           </Card>
//         )} */}

//         <div className="space-y-4 md:space-y-6">
//           {/* Row 1: File Drop Zone - Full Width */}
//           <div className="w-full">
//             <Card className="neubrutalism-card bg-yellow-300">
//               <CardHeader className="pb-3 md:pb-6">
//                 <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
//                   <Upload className="w-5 md:w-6 h-5 md:h-6" />
//                   SEND FILES
//                   {getAIScanner() && <Scan className="w-4 h-4 text-green-600" {...{ title: "AI Scanning Enabled" }} />}
//                   <Files className="w-4 h-4 text-blue-600"/>
//                 </CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div
//                   className={`border-4 border-dashed border-black p-4 md:p-8 text-center transition-colors file-drop-mobile ${dragOver ? "bg-green-200" : "bg-white"
//                     } ${connectionStatus !== "connected" ? "opacity-50" : ""} drag-zone`}
//                   onDrop={handleDrop}
//                   onDragOver={(e) => {
//                     e.preventDefault()
//                     setDragOver(true)
//                   }}
//                   onDragLeave={() => setDragOver(false)}
//                   onTouchStart={handleTouchStart}
//                   onTouchEnd={handleTouchEnd}
//                 >
//                   <Upload className="w-12 md:w-16 h-12 md:h-16 mx-auto mb-4" />
//                   <p className="text-lg md:text-xl font-black mb-2">
//                     {connectionStatus === "connected"
//                       ? isMobile
//                         ? "TAP TO SELECT FILES"
//                         : "DROP FILES HERE"
//                       : "WAITING FOR CONNECTION..."}
//                   </p>
//                   {!isMobile && <p className="font-bold mb-4">or</p>}
//                   <Button
//                     onClick={() => fileInputRef.current?.click()}
//                     disabled={connectionStatus !== "connected"}
//                     className="neubrutalism-button bg-blue-500 text-white hover:bg-white hover:text-blue-500 touch-target"
//                   >
//                     CHOOSE FILES
//                   </Button>
//                   <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
//                   <p className="text-xs md:text-sm font-bold mt-4 text-gray-600">
//                     Max 100MB per file • Multi-file support • AI Scanned • SHA-256 verified
//                   </p>
//                 </div>
//               </CardContent>
//             </Card>
//           </div>

//           {/* Row 2: Chat (2/3) + Connection Status (1/3) */}
//           <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
//             {/* Chat Panel - 2 blocks */}
//             <div className="lg:col-span-2">
//               <Card className="neubrutalism-card bg-indigo-300 h-full">
//                 <ChatPanel
//                   isConnected={connectionStatus === "connected"}
//                   currentUser={user?.firstName || "You"}
//                   onSendMessage={handleSendChatMessage}
//                   messages={chatMessages}
//                 />
//               </Card>
//             </div>

//             {/* Connection Status - 1 block */}
//             <div className="lg:col-span-1">
//               <Card className="neubrutalism-card bg-blue-300 h-full">
//                 <CardHeader className="pb-3 md:pb-6">
//                   <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
//                     <Users className="w-5 md:w-6 h-5 md:h-6" />
//                     CONNECTION STATUS
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="text-center space-y-4">
//                     {wsStatus === "connecting" && (
//                       <div className="bg-yellow-200 p-4 md:p-6 border-4 border-black">
//                         <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4 mobile-spinner"></div>
//                         <p className="font-black text-base md:text-lg">CONNECTING TO SERVER...</p>
//                         <p className="font-bold text-sm md:text-base">Establishing signaling connection</p>
//                       </div>
//                     )}

//                     {wsStatus === "connected" && userCount < 2 && (
//                       <div className="bg-yellow-200 p-4 md:p-6 border-4 border-black">
//                         <div className="animate-pulse w-6 md:w-8 h-6 md:h-8 bg-yellow-600 rounded-full mx-auto mb-4"></div>
//                         <p className="font-black text-base md:text-lg">WAITING FOR PEER...</p>
//                         <p className="font-bold text-sm md:text-base">Share the session code with your friend!</p>
//                         <p className="text-xs md:text-sm mt-2">Users in session: {userCount}/2</p>
//                       </div>
//                     )}

//                     {wsStatus === "connected" && userCount === 2 && connectionStatus === "connecting" && (
//                       <div className="bg-orange-200 p-4 md:p-6 border-4 border-black">
//                         <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4 mobile-spinner"></div>
//                         <p className="font-black text-base md:text-lg">ESTABLISHING P2P...</p>
//                         <p className="font-bold text-sm md:text-base">Setting up direct connection</p>
//                         <p className="text-xs md:text-sm mt-2">
//                           {isInitiator ? "Initiating connection..." : "Waiting for connection..."}
//                         </p>
//                         <Button
//                           onClick={() => {
//                             resetPeerConnection()
//                             setTimeout(() => {
//                               if (isInitiator) {
//                                 initiateConnection()
//                               }
//                             }, 1000)
//                           }}
//                           className="neubrutalism-button bg-orange-500 text-white mt-4 touch-target"
//                           size="sm"
//                         >
//                           <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
//                           RETRY
//                         </Button>
//                       </div>
//                     )}

//                     {connectionStatus === "connected" && (
//                       <div className="bg-green-200 p-4 md:p-6 border-4 border-black">
//                         <CheckCircle className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-green-600" />
//                         <p className="font-black text-base md:text-lg text-green-800">CONNECTED!</p>
//                         <p className="font-bold text-sm md:text-base">Ready to share files & chat</p>
//                         <p className="text-xs md:text-sm mt-2">P2P connection established • End-to-end encrypted</p>
//                       </div>
//                     )}

//                     {(wsStatus === "disconnected" || wsStatus === "error") && (
//                       <div className="bg-red-200 p-4 md:p-6 border-4 border-black">
//                         <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-red-600" />
//                         <p className="font-black text-base md:text-lg text-red-800">CONNECTION FAILED</p>
//                         <p className="font-bold mb-4 text-sm md:text-base">
//                           {wsStatus === "error" ? "Cannot connect to signaling server" : "Connection lost"}
//                         </p>
//                         <Button
//                           onClick={handleReconnect}
//                           className="neubrutalism-button bg-red-500 text-white touch-target"
//                         >
//                           <RefreshCw className="w-4 h-4 mr-2" />
//                           RECONNECT
//                         </Button>
//                       </div>
//                     )}

//                     {connectionStatus === "disconnected" && wsStatus === "connected" && (
//                       <div className="bg-orange-200 p-4 md:p-6 border-4 border-black">
//                         <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-orange-600" />
//                         <p className="font-black text-base md:text-lg text-orange-800">PEER DISCONNECTED</p>
//                         <p className="font-bold mb-4 text-sm md:text-base">Waiting for peer to reconnect...</p>
//                         <Button
//                           onClick={() => {
//                             resetPeerConnection()
//                             setTimeout(() => {
//                               if (wsRef.current?.readyState === WebSocket.OPEN) {
//                                 wsRef.current.send(
//                                   JSON.stringify({
//                                     type: "retry-connection",
//                                     sessionId,
//                                     userId: user?.id,
//                                   }),
//                                 )
//                               }
//                             }, 1000)
//                           }}
//                           className="neubrutalism-button bg-orange-500 text-white touch-target"
//                           size="sm"
//                         >
//                           <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
//                           RETRY P2P
//                         </Button>
//                       </div>
//                     )}
//                   </div>
//                 </CardContent>
//               </Card>
//             </div>
//           </div>

//           {/* Row 3: File Transfers - Full Width */}
//           {fileTransfers.length > 0 && (
//             <div className="w-full">
//               <Card className="neubrutalism-card bg-green-200">
//                 <CardHeader className="pb-3 md:pb-6">
//                   <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
//                   <FileText className="w-5 md:w-6 h-5 md:h-6" />
//                   FILE TRANSFERS
//                 </CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="space-y-3 md:space-y-4">
//                   {fileTransfers.map((transfer) => (
//                     <div key={transfer.id} className="bg-white p-3 md:p-4 border-2 border-black">
//                       <div className="flex items-center justify-between mb-2">
//                         <div className="flex items-center gap-2 min-w-0 flex-1">
//                           {transfer.direction === "sending" ? (
//                             <Upload className="w-3 md:w-4 h-3 md:h-4 flex-shrink-0" />
//                           ) : (
//                             <Download className="w-3 md:w-4 h-3 md:h-4 flex-shrink-0" />
//                           )}
//                           <span className="font-bold text-sm md:text-base truncate">{transfer.name}</span>
//                           <span className="text-xs md:text-sm text-gray-600 flex-shrink-0">
//                             ({(transfer.size / 1024 / 1024).toFixed(1)}MB)
//                           </span>
//                           {transfer.checksum && (
//                             <span title="Checksum verified">
//                               <Shield className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
//                             </span>
//                           )}
//                           {transfer.scanResult && !transfer.scanResult.isRisky && (
//                             <span title="AI Scan Passed">
//                               <Scan className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
//                             </span>
//                           )}
//                         </div>
//                         <span
//                           className={`px-2 py-1 text-xs font-bold border-2 border-black flex-shrink-0 ${transfer.status === "completed"
//                               ? "bg-green-300"
//                               : transfer.status === "transferring"
//                                 ? "bg-yellow-300"
//                                 : transfer.status === "scanning"
//                                   ? "bg-blue-300"
//                                   : transfer.status === "blocked"
//                                     ? "bg-red-400"
//                                     : transfer.status === "error"
//                                       ? "bg-red-300"
//                                       : "bg-gray-300"
//                             }`}
//                         >
//                           {transfer.status.toUpperCase()}
//                         </span>
//                       </div>

//                       {transfer.scanResult?.isRisky && (
//                         <div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 text-xs">
//                           <strong>Blocked:</strong> {transfer.scanResult.reason}
//                         </div>
//                       )}

//                       <div className="progress-bar">
//                         <div className="progress-fill" style={{ width: `${transfer.progress}%` }} />
//                       </div>
//                       <div className="text-right text-xs md:text-sm font-bold mt-1">{transfer.progress}%</div>
//                     </div>
//                   ))}
//                 </div>
//               </CardContent>
//             </Card>
//             </div>
//         )}
//       </div>

//       {/* File Transfers */}


//       {/* File Preview Modal */}
//         <FilePreviewModal
//           files={previewFiles}
//           isOpen={showPreview}
//           onClose={() => setShowPreview(false)}
//           onSendFiles={handlePreviewSend}
//           onCancel={handlePreviewCancel}
//           onAddMoreFiles={handleAddMoreFiles}
//         />

//       {/* Debug Info
//         {process.env.NODE_ENV === "development" && (
//           <Card className="neubrutalism-card bg-gray-200 mt-6 md:mt-8">
//             <CardHeader>
//               <CardTitle className="text-lg font-black">DEBUG INFO</CardTitle>
//             </CardHeader>
//             <CardContent>
//               <div className="font-mono text-sm space-y-1">
//                 <div>WebSocket Status: {wsStatus}</div>
//                 <div>P2P Status: {connectionStatus}</div>
//                 <div>User Count: {userCount}/2</div>
//                 <div>Is Initiator: {isInitiator ? "Yes" : "No"}</div>
//                 <div>Connection Attempts: {connectionAttempts}</div>
//                 <div>Reconnect Attempts: {reconnectAttempts}</div>
//                 <div>Session ID: {sessionId}</div>
//                 <div>User ID: {user?.id}</div>
//                 <div>Peer Connection: {peerConnection ? "Created" : "None"}</div>
//                 <div>Data Channel: {peerConnection?.dataChannel ? "Available" : "None"}</div>
//                 <div>Data Channel State: {peerConnection?.dataChannel?.readyState || "None"}</div>
//                 <div>Last Heartbeat: {lastHeartbeat.toLocaleTimeString()}</div>
//                 <div>ICE Queue Length: {iceCandidatesQueue.current.length}</div>
//                 <div>Speed Limit: {speedLimit}</div>
//                 <div>Current Speed: {(currentSpeed / 1024).toFixed(1)} KB/s</div>
//                 <div>Session Time Left: {formatTimeRemaining(sessionTimeLeft)}</div>
//                 <div>AI Scanner: {getAIScanner() ? "Enabled" : "Disabled"}</div>
//                 <div>Notifications: {NotificationManager.hasPermission ? "Enabled" : "Disabled"}</div>
//               </div>
//             </CardContent>
//           </Card>
//         )} */}
//     </div>
//     </div >
//   )
// }
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
import {
  Upload,
  Download,
  Users,
  WifiOff,
  AlertTriangle,
  X,
  RefreshCw,
  Shield,
  Smartphone,
  Monitor,
  Scan,
  Files,
  Zap,
  Activity,
  Signal,
} from "lucide-react"

// Import new components and utilities
import { FilePreviewModal } from "@/components/file-preview-modal"
import { ChatPanel } from "@/components/chat-panel"
import { getAIScanner, type ScanResult } from "@/lib/ai-scanner"
import { SessionManager } from "@/lib/session-manager"
import { SpeedThrottle, type SpeedLimit } from "@/lib/speed-throttle"
import { NotificationManager } from "@/lib/notifications"
import { TransferOptimizer, ChunkManager, ConnectionStabilizer, type TransferStats } from "@/lib/transfer-optimizer"
import { CompressionUtils } from "@/lib/compression-utils"
import { ConnectionManager, FastHandshake } from "@/lib/connection-manager"

interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "scanning" | "transferring" | "completed" | "error" | "blocked"
  direction: "sending" | "receiving"
  checksum?: string
  scanResult?: ScanResult
  transferStats?: TransferStats
  chunkManager?: ChunkManager
  startTime?: number
  compressionRatio?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

interface PeerConnection {
  pc: RTCPeerConnection
  dataChannel?: RTCDataChannel
  connected: boolean
  lastActivity: Date
  reconnectAttempts: number
  stabilizer?: ConnectionStabilizer
}

export default function SessionPage() {
  const { user } = useUser()
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [peerConnection, setPeerConnection] = useState<PeerConnection | null>(null)
  const [fileTransfers, setFileTransfers] = useState<FileTransfer[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isInitiator, setIsInitiator] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [lastHeartbeat, setLastHeartbeat] = useState<Date>(new Date())
  const [isMobile, setIsMobile] = useState(false)
  const [currentWsUrl, setCurrentWsUrl] = useState<string>("")

  // New state for enhanced features
  const [previewFiles, setPreviewFiles] = useState<File[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [speedLimit, setSpeedLimit] = useState<SpeedLimit>("unlimited")
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0)
  const [showExpiryWarning, setShowExpiryWarning] = useState(false)
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "poor" | "unknown">("unknown")
  const [transferOptimizer] = useState(() => new TransferOptimizer())
  const [compressionEnabled, setCompressionEnabled] = useState(false)
  const [overallTransferStats, setOverallTransferStats] = useState<TransferStats | null>(null)
  const [connectionManager] = useState(() => new ConnectionManager())
  const [connectionStats, setConnectionStats] = useState<any>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const peerConnectionRef = useRef<PeerConnection | null>(null)
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const peerHeartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const connectionMonitorRef = useRef<NodeJS.Timeout | null>(null)
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([])
  const speedThrottleRef = useRef<SpeedThrottle>(new SpeedThrottle())
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const receivedChunksRef = useRef<
    Map<
      string,
      {
        chunks: Map<number, ArrayBuffer>
        totalChunks: number
        receivedChunks: number
        fileName: string
        fileType: string
        checksum?: string
        chunkManager?: ChunkManager
        isCompressed?: boolean
      }
    >
  >(new Map())
  const lastPeerHeartbeatRef = useRef<Date>(new Date())
  const connectionStatsRef = useRef({
    packetsLost: 0,
    roundTripTime: 0,
    bytesReceived: 0,
    bytesSent: 0,
  })

  // Initialize compression support check
  useEffect(() => {
    CompressionUtils.isCompressionSupported().then(setCompressionEnabled)
  }, [])

  // Initialize session management and notifications
  useEffect(() => {
    NotificationManager.requestPermission()
    SessionManager.createSession(sessionId)
    startSessionTimer()

    // Pre-warm connections for faster startup
    const fastHandshake = FastHandshake.getInstance()
    const urls = ["wss://signaling-server-1ckx.onrender.com", "ws://localhost:8080"]
    fastHandshake.preWarmConnections(urls)

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
      }
      fastHandshake.cleanup()
    }
  }, [sessionId])

  // Update connection stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setConnectionStats(connectionManager.getConnectionStats())
    }, 5000)

    return () => clearInterval(interval)
  }, [connectionManager])

  // Session timer
  const startSessionTimer = () => {
    sessionTimerRef.current = setInterval(() => {
      const timeLeft = SessionManager.getTimeUntilExpiry(sessionId)
      setSessionTimeLeft(timeLeft)
      const shouldWarn = SessionManager.shouldShowWarning(sessionId)
      if (shouldWarn && !showExpiryWarning) {
        setShowExpiryWarning(true)
        NotificationManager.showWarningNotification(
          "Session Expiring Soon",
          "Your session will expire in 2 minutes. Save any important data.",
        )
      }
      if (timeLeft <= 0) {
        handleSessionExpiry()
      }
    }, 1000)
  }

  const handleSessionExpiry = () => {
    SessionManager.expireSession(sessionId)
    setError("Session has expired due to inactivity")
    cleanup()
    setTimeout(() => {
      router.push("/")
    }, 3000)
  }

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth < 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      )
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Update speed throttle when limit changes
  useEffect(() => {
    speedThrottleRef.current.setLimit(speedLimit)
  }, [speedLimit])

  // Enhanced cleanup function
  const cleanup = useCallback(() => {
    console.log("🧹 Cleaning up connections...")

    // Clear all timeouts and intervals
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }
    if (peerHeartbeatIntervalRef.current) {
      clearInterval(peerHeartbeatIntervalRef.current)
    }
    if (connectionMonitorRef.current) {
      clearInterval(connectionMonitorRef.current)
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
    }

    // Close peer connection gracefully
    if (peerConnectionRef.current?.pc) {
      try {
        if (peerConnectionRef.current.dataChannel) {
          peerConnectionRef.current.dataChannel.close()
        }
        if (peerConnectionRef.current.stabilizer) {
          peerConnectionRef.current.stabilizer.clearQueue()
        }
        peerConnectionRef.current.pc.close()
      } catch (error) {
        console.error("Error closing peer connection:", error)
      }
      peerConnectionRef.current = null
    }

    // Close WebSocket gracefully
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "Component cleanup")
      } catch (error) {
        console.error("Error closing WebSocket:", error)
      }
      wsRef.current = null
    }

    // Cleanup connection manager
    connectionManager.cleanup()

    iceCandidatesQueue.current = []
    setChatMessages([])
  }, [connectionManager])

  // Ultra-fast WebSocket connection with intelligent endpoint selection
  const connectWebSocket = useCallback(async () => {
    if (!user || !sessionId) return

    if (!SessionManager.validateSession(sessionId)) {
      setError("Session has expired or is invalid")
      router.push("/")
      return
    }

    console.log(`🚀 Attempting ultra-fast WebSocket connection (attempt ${reconnectAttempts + 1})`)
    setWsStatus("connecting")
    setError("")

    try {
      // Try to get pre-warmed connection first
      const fastHandshake = FastHandshake.getInstance()
      let ws: WebSocket | null = null

      // Check for pre-warmed connections
      const preWarmedUrls = ["wss://signaling-server-1ckx.onrender.com", "ws://localhost:8080"]

      for (const url of preWarmedUrls) {
        const preWarmed = fastHandshake.getPreWarmedConnection(url)
        if (preWarmed) {
          ws = preWarmed
          setCurrentWsUrl(url)
          console.log(`⚡ Using pre-warmed connection to ${url}`)
          break
        }
      }

      // If no pre-warmed connection, get optimal connection
      if (!ws) {
        ws = await connectionManager.getOptimalConnection()
        setCurrentWsUrl(ws.url)
      }

      wsRef.current = ws

      // Set up event handlers
      ws.onopen = () => {
        console.log(`✅ Ultra-fast WebSocket connected to ${ws!.url}`)
        setWsStatus("connected")
        setReconnectAttempts(0)
        setError("")

        const joinMessage = {
          type: "join",
          sessionId,
          userId: user.id,
          reconnect: connectionAttempts > 0,
          timestamp: Date.now(),
          fastConnect: true, // Flag for fast connection
        }

        console.log("📤 Sending join message:", joinMessage)
        ws!.send(JSON.stringify(joinMessage))
        startHeartbeat()
      }

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data)
          console.log("📨 Received message:", message.type)
          setLastHeartbeat(new Date())
          await handleSignalingMessage(message)
        } catch (error) {
          console.error("❌ Error parsing message:", error, event.data)
        }
      }

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`)
        setWsStatus("disconnected")
        stopHeartbeat()

        if (event.code !== 1000 && event.code !== 1001) {
          connectionManager.markEndpointFailed(ws!.url)
          scheduleReconnect()
        }
      }

      ws.onerror = (error) => {
        console.error(`❌ WebSocket error:`, error)
        connectionManager.markEndpointFailed(ws!.url)
        setWsStatus("error")
        scheduleReconnect()
      }
    } catch (error) {
      console.error("❌ Failed to establish WebSocket connection:", error)
      setWsStatus("error")
      setError("Failed to connect to signaling server. Retrying with backup servers...")
      scheduleReconnect()
    }
  }, [user, sessionId, reconnectAttempts, connectionAttempts, connectionManager])

  // Enhanced heartbeat with better timing
  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ping",
            sessionId,
            userId: user?.id,
            timestamp: Date.now(),
          }),
        )
        SessionManager.extendSession(sessionId)
      }
    }, 10000) // More frequent heartbeat for better responsiveness
  }

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }

  // Enhanced P2P heartbeat
  const startPeerHeartbeat = () => {
    stopPeerHeartbeat()
    peerHeartbeatIntervalRef.current = setInterval(() => {
      if (peerConnectionRef.current?.dataChannel?.readyState === "open") {
        try {
          peerConnectionRef.current.dataChannel.send(
            JSON.stringify({
              type: "peer-heartbeat",
              timestamp: Date.now(),
              stats: connectionStatsRef.current,
            }),
          )
          peerConnectionRef.current.lastActivity = new Date()
        } catch (error) {
          console.error("❌ Failed to send peer heartbeat:", error)
        }
      }
    }, 8000) // More frequent peer heartbeat
  }

  const stopPeerHeartbeat = () => {
    if (peerHeartbeatIntervalRef.current) {
      clearInterval(peerHeartbeatIntervalRef.current)
      peerHeartbeatIntervalRef.current = null
    }
  }

  // Connection monitoring and quality assessment
  const startConnectionMonitor = () => {
    if (connectionMonitorRef.current) {
      clearInterval(connectionMonitorRef.current)
    }

    connectionMonitorRef.current = setInterval(async () => {
      if (peerConnectionRef.current?.pc) {
        try {
          const stats = await peerConnectionRef.current.pc.getStats()
          let packetsLost = 0
          let roundTripTime = 0
          let bytesReceived = 0
          let bytesSent = 0

          stats.forEach((report) => {
            if (report.type === "inbound-rtp") {
              packetsLost += report.packetsLost || 0
              bytesReceived += report.bytesReceived || 0
            }
            if (report.type === "outbound-rtp") {
              bytesSent += report.bytesSent || 0
            }
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              roundTripTime = report.currentRoundTripTime || 0
            }
          })

          connectionStatsRef.current = {
            packetsLost,
            roundTripTime,
            bytesReceived,
            bytesSent,
          }

          // Update transfer optimizer with RTT
          if (roundTripTime > 0) {
            transferOptimizer.updateRTT(roundTripTime * 1000)
          }

          // Assess connection quality
          if (roundTripTime < 0.05 && packetsLost < 2) {
            setConnectionQuality("excellent")
          } else if (roundTripTime < 0.15 && packetsLost < 8) {
            setConnectionQuality("good")
          } else {
            setConnectionQuality("poor")
          }

          // Check for peer heartbeat timeout
          const timeSinceLastPeerHeartbeat = Date.now() - lastPeerHeartbeatRef.current.getTime()
          if (timeSinceLastPeerHeartbeat > 20000 && connectionStatus === "connected") {
            console.warn("⚠️ Peer heartbeat timeout, connection may be unstable")
          }
        } catch (error) {
          console.error("❌ Error getting connection stats:", error)
        }
      }
    }, 3000) // More frequent monitoring
  }

  // Ultra-fast reconnection with intelligent backoff
  const scheduleReconnect = useCallback(async () => {
    if (reconnectAttempts >= 15) {
      // Reduced max attempts but faster retries
      setWsStatus("error")
      setError("Connection failed. Please check your internet connection and try again.")
      return
    }

    console.log(`🔄 Scheduling ultra-fast reconnect (attempt ${reconnectAttempts + 1})`)

    try {
      setReconnectAttempts((prev) => prev + 1)
      const ws = await connectionManager.reconnectWithBackoff(reconnectAttempts)

      // If we got a connection, use it
      if (ws) {
        wsRef.current = ws
        setWsStatus("connected")
        setReconnectAttempts(0)

        // Set up handlers for the new connection
        ws.onopen = () => {
          console.log("✅ Reconnected successfully")
          const joinMessage = {
            type: "join",
            sessionId,
            userId: user?.id,
            reconnect: true,
            timestamp: Date.now(),
          }
          ws.send(JSON.stringify(joinMessage))
          startHeartbeat()
        }

        ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data)
            setLastHeartbeat(new Date())
            await handleSignalingMessage(message)
          } catch (error) {
            console.error("❌ Error parsing message:", error)
          }
        }

        ws.onclose = () => {
          setWsStatus("disconnected")
          stopHeartbeat()
          scheduleReconnect()
        }

        ws.onerror = () => {
          setWsStatus("error")
          scheduleReconnect()
        }
      }
    } catch (error) {
      console.error("❌ Reconnection failed:", error)
      // Try again with a short delay
      setTimeout(() => scheduleReconnect(), 1000)
    }
  }, [reconnectAttempts, connectionManager, user, sessionId])

  // Initial connection
  useEffect(() => {
    connectWebSocket()
    return cleanup
  }, [connectWebSocket, cleanup])

  // Manual reconnect
  const handleReconnect = () => {
    setReconnectAttempts(0)
    setConnectionAttempts((prev) => prev + 1)
    cleanup()
    setTimeout(connectWebSocket, 500) // Faster manual reconnect
  }

  // Enhanced peer connection reset
  const resetPeerConnection = useCallback(() => {
    console.log("🔄 Resetting peer connection...")

    stopPeerHeartbeat()
    if (connectionMonitorRef.current) {
      clearInterval(connectionMonitorRef.current)
    }

    if (peerConnectionRef.current?.pc) {
      try {
        if (peerConnectionRef.current.dataChannel) {
          peerConnectionRef.current.dataChannel.close()
        }
        if (peerConnectionRef.current.stabilizer) {
          peerConnectionRef.current.stabilizer.clearQueue()
        }
        peerConnectionRef.current.pc.close()
      } catch (error) {
        console.error("Error closing peer connection:", error)
      }
    }

    setPeerConnection(null)
    peerConnectionRef.current = null
    setConnectionStatus("connecting")
    setConnectionQuality("unknown")
    iceCandidatesQueue.current = []

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
    }
  }, [])

  // Ultra-fast WebRTC setup with optimized configuration
  const createPeerConnection = useCallback(() => {
    console.log("🚀 Creating ultra-fast peer connection")

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.nextcloud.com:443" },
        { urls: "stun:stun.sipgate.net:3478" },
      ],
      iceCandidatePoolSize: 15, // Increased for faster connection
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    })

    let connectionEstablished = false

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 Sending ICE candidate:", event.candidate.type)
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "ice-candidate",
              sessionId,
              candidate: event.candidate,
              timestamp: Date.now(),
            }),
          )
        }
      } else {
        console.log("🧊 ICE gathering complete")
      }
    }

    pc.onconnectionstatechange = () => {
      console.log("🔄 Peer connection state:", pc.connectionState)

      if (peerConnectionRef.current) {
        peerConnectionRef.current.lastActivity = new Date()
      }

      switch (pc.connectionState) {
        case "connected":
          if (!connectionEstablished) {
            console.log("✅ Ultra-fast P2P connection established!")
            connectionEstablished = true
            setConnectionStatus("connected")
            NotificationManager.showConnectionNotification(true, "peer")
            startPeerHeartbeat()
            startConnectionMonitor()

            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current)
            }
          }
          break
        case "connecting":
          setConnectionStatus("connecting")
          break
        case "disconnected":
          console.log("⚠️ P2P connection disconnected")
          setConnectionStatus("connecting")
          stopPeerHeartbeat()
          NotificationManager.showConnectionNotification(false)

          // Faster ICE restart
          setTimeout(() => {
            if (pc.connectionState === "disconnected" && pc.iceConnectionState !== "closed") {
              console.log("🔄 Attempting fast ICE restart...")
              try {
                pc.restartIce()
              } catch (error) {
                console.error("❌ ICE restart failed:", error)
                setTimeout(() => {
                  if (connectionStatus !== "connected") {
                    resetPeerConnection()
                    setTimeout(() => {
                      if (isInitiator) {
                        initiateConnection()
                      }
                    }, 1000) // Faster retry
                  }
                }, 2000)
              }
            }
          }, 1000) // Faster response
          break
        case "failed":
          console.log("❌ P2P connection failed")
          setConnectionStatus("disconnected")
          connectionEstablished = false
          stopPeerHeartbeat()
          NotificationManager.showConnectionNotification(false)

          // Faster reconnection attempt
          setTimeout(() => {
            resetPeerConnection()
            setTimeout(() => {
              if (isInitiator) {
                initiateConnection()
              }
            }, 1500) // Faster retry
          }, 1000)
          break
        case "closed":
          console.log("🔌 P2P connection closed")
          setConnectionStatus("disconnected")
          connectionEstablished = false
          stopPeerHeartbeat()
          NotificationManager.showConnectionNotification(false)
          break
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log("🧊 ICE connection state:", pc.iceConnectionState)
      switch (pc.iceConnectionState) {
        case "connected":
        case "completed":
          if (!connectionEstablished) {
            console.log("✅ Ultra-fast ICE connection successful")
          }
          break
        case "disconnected":
          console.log("⚠️ ICE disconnected, monitoring for reconnection...")
          break
        case "failed":
          console.log("❌ ICE connection failed, attempting fast restart...")
          setTimeout(() => {
            if (pc.iceConnectionState === "failed") {
              try {
                pc.restartIce()
              } catch (error) {
                console.error("❌ ICE restart failed:", error)
              }
            }
          }, 500) // Faster restart
          break
      }
    }

    pc.ondatachannel = (event) => {
      console.log("📡 Data channel received:", event.channel.label)
      const channel = event.channel
      setupDataChannel(channel)
    }

    // Reduced timeout for faster failure detection
    connectionTimeoutRef.current = setTimeout(() => {
      if (!connectionEstablished) {
        console.log("⏰ P2P connection timeout")
        setError("Connection timeout. Retrying automatically...")
        resetPeerConnection()
        setTimeout(() => {
          if (isInitiator) {
            initiateConnection()
          }
        }, 1000) // Faster retry
      }
    }, 20000) // Reduced timeout

    return pc
  }, [sessionId, isInitiator])

  // Enhanced data channel setup with optimization
  const setupDataChannel = (channel: RTCDataChannel) => {
    console.log("📡 Setting up ultra-fast data channel:", channel.label, "State:", channel.readyState)
    channel.binaryType = "arraybuffer"

    // Create connection stabilizer
    const stabilizer = new ConnectionStabilizer(channel)

    channel.onmessage = (event) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.lastActivity = new Date()
      }
      handleDataChannelMessage(event.data)
    }

    channel.onopen = () => {
      console.log("📡 Ultra-fast data channel opened - ready for lightning-speed transfer!")
      setConnectionStatus("connected")
      startPeerHeartbeat()

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
      }

      try {
        channel.send(
          JSON.stringify({
            type: "connection-test",
            message: "Ultra-fast data channel ready",
            timestamp: Date.now(),
            capabilities: {
              maxFileSize: "1GB",
              chunking: true,
              compression: compressionEnabled,
              encryption: "browser-native",
              optimization: "ultra-fast",
              concurrentChunks: transferOptimizer.getConcurrentChunks(),
              chunkSize: transferOptimizer.getOptimalChunkSize(),
            },
          }),
        )
        console.log("📤 Sent ultra-fast connection test message")
      } catch (error) {
        console.error("❌ Failed to send test message:", error)
      }
    }

    channel.onclose = () => {
      console.log("📡 Data channel closed")
      setConnectionStatus("disconnected")
      stopPeerHeartbeat()
    }

    channel.onerror = (error) => {
      console.error("❌ Data channel error:", error)
      setConnectionStatus("disconnected")
      stopPeerHeartbeat()
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.dataChannel = channel
      peerConnectionRef.current.stabilizer = stabilizer
    }
  }

  const handleSignalingMessage = async (message: any) => {
    switch (message.type) {
      case "connected":
        console.log("✅ Signaling server connection confirmed")
        break
      case "pong":
        setLastHeartbeat(new Date())
        break
      case "joined":
        console.log(`👤 Joined session ${message.sessionId} (${message.userCount}/2 users)`)
        setUserCount(message.userCount)
        if (message.userCount === 1 || message.isInitiator) {
          setIsInitiator(true)
          console.log("👑 This user will initiate the connection")
        } else {
          setIsInitiator(false)
          console.log("👤 This user will wait for connection")
        }
        break
      case "user-joined":
        console.log(`👤 Another user joined! User count: ${message.userCount}`)
        setUserCount(message.userCount)
        if (isInitiator && message.userCount === 2) {
          console.log("🚀 Initiating ultra-fast WebRTC connection as initiator")
          setTimeout(() => initiateConnection(), 1000) // Faster initiation
        }
        break
      case "user-reconnected":
        console.log(`🔄 User reconnected to session`)
        setUserCount(message.userCount)
        if (message.userCount === 2) {
          resetPeerConnection()
          setTimeout(() => {
            if (isInitiator) {
              initiateConnection()
            }
          }, 1500) // Faster reconnection
        }
        break
      case "retry-connection":
        console.log("🔄 Retry connection requested")
        resetPeerConnection()
        setTimeout(() => {
          if (isInitiator) {
            initiateConnection()
          }
        }, 1000) // Faster retry
        break
      case "offer":
        console.log("📨 Received offer, creating answer")
        await handleOffer(message.offer)
        break
      case "answer":
        console.log("📨 Received answer")
        await handleAnswer(message.answer)
        break
      case "ice-candidate":
        console.log("🧊 Received ICE candidate")
        await handleIceCandidate(message.candidate)
        break
      case "user-left":
        console.log("👋 User left session")
        setConnectionStatus("disconnected")
        setUserCount(message.userCount)
        resetPeerConnection()
        break
      case "error":
        console.error("❌ Signaling error:", message.message)
        setError(message.message)
        break
    }
  }

  const initiateConnection = async () => {
    try {
      console.log("🚀 Initiating ultra-fast connection as initiator")
      if (peerConnectionRef.current?.pc) {
        peerConnectionRef.current.pc.close()
      }

      const pc = createPeerConnection()

      // Ultra-fast data channel configuration
      const dataChannel = pc.createDataChannel("fileTransfer", {
        ordered: false, // Allow out-of-order delivery for maximum speed
        maxRetransmits: 2, // Reduced retransmits for speed
        maxPacketLifeTime: 5000, // Reduced timeout for faster failure detection
      })

      console.log("📡 Created ultra-fast data channel:", dataChannel.label)
      setupDataChannel(dataChannel)

      const connection: PeerConnection = {
        pc,
        dataChannel,
        connected: false,
        lastActivity: new Date(),
        reconnectAttempts: 0,
      }
      setPeerConnection(connection)
      peerConnectionRef.current = connection

      console.log("📤 Creating ultra-fast offer...")
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      })

      console.log("📤 Setting local description...")
      await pc.setLocalDescription(offer)

      console.log("📤 Sending offer to peer...")
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "offer",
            sessionId,
            offer: pc.localDescription,
            timestamp: Date.now(),
          }),
        )
      } else {
        throw new Error("WebSocket not connected")
      }
    } catch (error) {
      console.error("❌ Error initiating connection:", error)
      setError("Failed to initiate connection: " + (error as Error).message)
      resetPeerConnection()
    }
  }

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    try {
      console.log("📥 Handling received offer")
      if (peerConnectionRef.current?.pc) {
        peerConnectionRef.current.pc.close()
      }

      const pc = createPeerConnection()
      const connection: PeerConnection = {
        pc,
        connected: false,
        lastActivity: new Date(),
        reconnectAttempts: 0,
      }
      setPeerConnection(connection)
      peerConnectionRef.current = connection

      console.log("📥 Setting remote description...")
      await pc.setRemoteDescription(offer)

      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift()
        if (candidate) {
          try {
            await pc.addIceCandidate(candidate)
            console.log("✅ Added queued ICE candidate")
          } catch (error) {
            console.error("❌ Error adding queued ICE candidate:", error)
          }
        }
      }

      console.log("📤 Creating answer...")
      const answer = await pc.createAnswer()
      console.log("📤 Setting local description...")
      await pc.setLocalDescription(answer)

      console.log("📤 Sending answer to peer...")
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "answer",
            sessionId,
            answer: pc.localDescription,
            timestamp: Date.now(),
          }),
        )
      } else {
        throw new Error("WebSocket not connected")
      }
    } catch (error) {
      console.error("❌ Error handling offer:", error)
      setError("Failed to handle connection offer: " + (error as Error).message)
      resetPeerConnection()
    }
  }

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      console.log("📥 Handling received answer")
      if (peerConnectionRef.current?.pc) {
        console.log("Current signaling state:", peerConnectionRef.current.pc.signalingState)

        if (peerConnectionRef.current.pc.signalingState === "have-local-offer") {
          await peerConnectionRef.current.pc.setRemoteDescription(answer)
          console.log("✅ Answer processed successfully")

          while (iceCandidatesQueue.current.length > 0) {
            const candidate = iceCandidatesQueue.current.shift()
            if (candidate) {
              try {
                await peerConnectionRef.current.pc.addIceCandidate(candidate)
                console.log("✅ Added queued ICE candidate")
              } catch (error) {
                console.error("❌ Error adding queued ICE candidate:", error)
              }
            }
          }
        } else {
          console.warn(
            "⚠️ Cannot set remote description - wrong signaling state:",
            peerConnectionRef.current.pc.signalingState,
          )
          resetPeerConnection()
          setTimeout(() => {
            if (!isInitiator) {
              console.log("🔄 Non-initiator waiting for new offer...")
            }
          }, 1000) // Faster retry
        }
      }
    } catch (error) {
      console.error("❌ Error handling answer:", error)
      setError("Failed to handle connection answer: " + (error as Error).message)
      resetPeerConnection()
    }
  }

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      console.log("🧊 Adding ICE candidate")
      if (peerConnectionRef.current?.pc && peerConnectionRef.current.pc.remoteDescription) {
        await peerConnectionRef.current.pc.addIceCandidate(candidate)
        console.log("✅ ICE candidate added successfully")
      } else {
        console.log("⚠️ Queuing ICE candidate (no remote description yet)")
        iceCandidatesQueue.current.push(candidate)
      }
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error)
    }
  }

  // File checksum calculation for security
  const calculateChecksum = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  // Enhanced data channel message handler with optimization
  const handleDataChannelMessage = async (data: ArrayBuffer | string) => {
    if (typeof data === "string") {
      const message = JSON.parse(data)

      // Handle peer heartbeat
      if (message.type === "peer-heartbeat") {
        lastPeerHeartbeatRef.current = new Date()
        if (peerConnectionRef.current?.dataChannel?.readyState === "open") {
          try {
            peerConnectionRef.current.dataChannel.send(
              JSON.stringify({
                type: "peer-heartbeat-response",
                timestamp: Date.now(),
              }),
            )
          } catch (error) {
            console.error("❌ Failed to send heartbeat response:", error)
          }
        }
        return
      }

      if (message.type === "peer-heartbeat-response") {
        lastPeerHeartbeatRef.current = new Date()
        return
      }

      if (message.type === "connection-test") {
        console.log("📨 Received connection test:", message.message)
        if (peerConnectionRef.current?.dataChannel?.readyState === "open") {
          peerConnectionRef.current.dataChannel.send(
            JSON.stringify({
              type: "connection-ack",
              message: "Ultra-fast connection confirmed",
              timestamp: Date.now(),
              capabilities: {
                maxFileSize: "1GB",
                chunking: true,
                compression: compressionEnabled,
                encryption: "browser-native",
                optimization: "ultra-fast",
                concurrentChunks: transferOptimizer.getConcurrentChunks(),
                chunkSize: transferOptimizer.getOptimalChunkSize(),
              },
            }),
          )
        }
        return
      }

      if (message.type === "connection-ack") {
        console.log("✅ Ultra-fast connection acknowledged by peer")
        return
      }

      // Handle chat messages
      if (message.type === "chat-message") {
        const chatMessage: ChatMessage = {
          id: message.id,
          content: message.content,
          sender: message.sender,
          timestamp: new Date(message.timestamp),
          type: message.messageType || "text",
        }
        setChatMessages((prev) => [...prev, chatMessage])
        return
      }

      if (message.type === "file-start") {
        console.log("📥 Starting ultra-fast file reception:", message.fileName)
        const totalChunks = Math.ceil(message.fileSize / transferOptimizer.getOptimalChunkSize())

        const transfer: FileTransfer = {
          id: message.fileId,
          name: message.fileName,
          size: message.fileSize,
          type: message.fileType,
          progress: 0,
          status: "transferring",
          direction: "receiving",
          checksum: message.checksum,
          startTime: Date.now(),
          compressionRatio: message.compressionRatio || 1,
        }
        setFileTransfers((prev) => [...prev, transfer])

        receivedChunksRef.current.set(message.fileId, {
          chunks: new Map(),
          totalChunks,
          receivedChunks: 0,
          fileName: message.fileName,
          fileType: message.fileType,
          checksum: message.checksum,
          isCompressed: message.isCompressed || false,
        })
      } else if (message.type === "file-end") {
        console.log("📥 Ultra-fast file reception complete:", message.fileId)
        const fileData = receivedChunksRef.current.get(message.fileId)
        if (fileData) {
          // Reconstruct file from chunks
          const sortedChunks = Array.from(fileData.chunks.entries())
            .sort(([a], [b]) => a - b)
            .map(([_, chunk]) => chunk)

          let blob = new Blob(sortedChunks, { type: fileData.fileType })

          // Decompress if needed
          if (fileData.isCompressed && compressionEnabled) {
            console.log("🗜️ Decompressing received file...")
            try {
              const decompressed = await CompressionUtils.decompress(new Uint8Array(await blob.arrayBuffer()))
              blob = new Blob([decompressed], { type: fileData.fileType })
              if (fileData.checksum) {
                verifyAndDownloadFile(blob, fileData.fileName, fileData.checksum, message.fileId)
              } else {
                downloadFile(blob, fileData.fileName)
                setFileTransfers((prev) =>
                  prev.map((t) => (t.id === message.fileId ? { ...t, status: "completed", progress: 100 } : t)),
                )
              }
            } catch (error) {
              console.error("❌ Decompression failed:", error)
              setFileTransfers((prev) => prev.map((t) => (t.id === message.fileId ? { ...t, status: "error" } : t)))
            }
          } else {
            if (fileData.checksum) {
              verifyAndDownloadFile(blob, fileData.fileName, fileData.checksum, message.fileId)
            } else {
              downloadFile(blob, fileData.fileName)
              setFileTransfers((prev) =>
                prev.map((t) => (t.id === message.fileId ? { ...t, status: "completed", progress: 100 } : t)),
              )
            }
          }
          receivedChunksRef.current.delete(message.fileId)
        }
      } else if (message.type === "chunk-ack") {
        // Handle chunk acknowledgment for reliability
        const transfer = fileTransfers.find((t) => t.id === message.fileId && t.direction === "sending")
        if (transfer?.chunkManager) {
          transfer.chunkManager.markCompleted(message.chunkId)
        }
      }
    } else {
      // Binary data (file chunk) - ultra-fast handling
      const view = new DataView(data)
      const fileIdLength = view.getUint32(0)
      const chunkId = view.getUint32(4)
      const fileId = new TextDecoder().decode(data.slice(8, 8 + fileIdLength))
      const chunkData = data.slice(8 + fileIdLength)

      const fileData = receivedChunksRef.current.get(fileId)
      if (fileData) {
        fileData.chunks.set(chunkId, chunkData)
        fileData.receivedChunks++

        const progress = Math.round((fileData.receivedChunks / fileData.totalChunks) * 100)
        setFileTransfers((prev) =>
          prev.map((t) => {
            if (t.id === fileId) {
              const elapsed = Date.now() - (t.startTime || Date.now())
              const speed = (fileData.receivedChunks * transferOptimizer.getOptimalChunkSize()) / (elapsed / 1000)
              return { ...t, progress, transferStats: { ...transferOptimizer.getStats(), speed } }
            }
            return t
          }),
        )

        // Send acknowledgment for reliability
        if (peerConnectionRef.current?.dataChannel?.readyState === "open") {
          try {
            peerConnectionRef.current.dataChannel.send(
              JSON.stringify({
                type: "chunk-ack",
                fileId,
                chunkId,
                timestamp: Date.now(),
              }),
            )
          } catch (error) {
            console.error("❌ Failed to send chunk ack:", error)
          }
        }

        setCurrentSpeed(transferOptimizer.getStats().speed)
      }
    }
  }

  const verifyAndDownloadFile = async (blob: Blob, fileName: string, expectedChecksum: string, fileId: string) => {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const actualChecksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

      if (actualChecksum === expectedChecksum) {
        console.log("✅ File checksum verified")
        downloadFile(blob, fileName)
        setFileTransfers((prev) =>
          prev.map((t) => (t.id === fileId ? { ...t, status: "completed", progress: 100 } : t)),
        )
        NotificationManager.showFileNotification(fileName, true)
      } else {
        console.error("❌ File checksum mismatch")
        setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error", progress: 0 } : t)))
        setError("File integrity check failed")
        NotificationManager.showFileNotification(fileName, false, "Checksum verification failed")
      }
    } catch (error) {
      console.error("❌ Error verifying file:", error)
      setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error", progress: 0 } : t)))
      NotificationManager.showFileNotification(fileName, false, "Verification error")
    }
  }

  const downloadFile = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const validateFile = (file: File): string | null => {
    if (file.size > 1024 * 1024 * 1024) {
      return "File size must be less than 1GB"
    }

    const blockedExtensions = [
      ".exe",
      ".bat",
      ".sh",
      ".cmd",
      ".scr",
      ".pif",
      ".com",
      ".msi",
      ".app",
      ".deb",
      ".rpm",
      ".dmg",
      ".pkg",
      ".run",
      ".bin",
      ".jar",
      ".vbs",
      ".ps1",
    ]

    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()
    if (blockedExtensions.includes(fileExtension)) {
      return "This file type is not allowed for security reasons"
    }

    const suspiciousPatterns = [
      /^\./,
      /\.(exe|bat|cmd|scr|pif|com|msi|app|deb|rpm|dmg|pkg|run|bin|jar|vbs|ps1)$/i,
      /[<>:"|?*]/,
    ]

    if (suspiciousPatterns.some((pattern) => pattern.test(file.name))) {
      return "File name contains invalid or suspicious characters"
    }

    return null
  }

  // Ultra-fast file sending with parallel chunks and adaptive parameters
  const sendFiles = async (files: File[]) => {
    if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
      setError("Data channel not ready for file transfer")
      return
    }

    console.log(`📤 Starting ultra-fast batch file transfer: ${files.length} files`)

    for (const file of files) {
      await sendSingleFile(file)
      await new Promise((resolve) => setTimeout(resolve, 50)) // Minimal delay for ultra-fast transfers
    }
  }

  const sendSingleFile = async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      const fileId = Math.random().toString(36).substring(2, 15)
      const startTime = Date.now()

      const transfer: FileTransfer = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: "scanning",
        direction: "sending",
        startTime,
      }

      setFileTransfers((prev) => [...prev, transfer])

      // AI scanning
      const scanner = getAIScanner()
      if (scanner) {
        console.log("🔍 Scanning file with AI:", file.name)
        const scanResult = await scanner.scanFile(file)
        setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, scanResult } : t)))

        if (scanResult.isRisky) {
          console.log("🚫 File blocked by AI scan:", scanResult.reason)
          setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "blocked" } : t)))
          setError(`File blocked: ${scanResult.reason}`)
          return
        }
      }

      // Calculate checksum and prepare for compression
      const checksum = await calculateChecksum(file)
      let fileData = new Uint8Array(await file.arrayBuffer())
      let isCompressed = false
      let compressionRatio = 1

      // Compress if beneficial and supported
      if (compressionEnabled && CompressionUtils.shouldCompress(fileData)) {
        console.log("🗜️ Compressing file for ultra-fast transfer...")
        const compressed = await CompressionUtils.compress(fileData)
        if (compressed.length < fileData.length * 0.9) {
          // Only use if >10% reduction
          compressionRatio = fileData.length / compressed.length
          fileData = new Uint8Array(compressed)
          isCompressed = true
          console.log(`🗜️ Compression ratio: ${compressionRatio.toFixed(2)}x`)
        }
      }

      // Initialize transfer optimizer for this file
      transferOptimizer.reset(fileData.length)
      const chunkSize = transferOptimizer.getOptimalChunkSize()
      const chunkManager = new ChunkManager(fileData.length, chunkSize)

      setFileTransfers((prev) =>
        prev.map((t) =>
          t.id === fileId
            ? {
                ...t,
                checksum,
                status: "transferring",
                chunkManager,
                compressionRatio: isCompressed ? compressionRatio : undefined,
              }
            : t,
        ),
      )

      console.log(
        `📤 Starting ultra-fast file transfer: ${file.name}, Size: ${fileData.length}, Chunks: ${Math.ceil(fileData.length / chunkSize)}, Compressed: ${isCompressed}`,
      )

      if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
        setError("Data channel not ready for file transfer")
        setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
        return
      }

      // Send file start message
      peerConnection.dataChannel.send(
        JSON.stringify({
          type: "file-start",
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          checksum,
          isCompressed,
          compressionRatio: isCompressed ? compressionRatio : undefined,
        }),
      )

      // Ultra-fast parallel chunk sending
      let isTransferring = true
      let completedChunks = 0
      const totalChunks = Math.ceil(fileData.length / chunkSize)
      const concurrentLimit = transferOptimizer.getConcurrentChunks()
      let activeSends = 0

      const sendNextChunks = async () => {
        while (isTransferring && activeSends < concurrentLimit) {
          const chunks = chunkManager.getNextChunks(concurrentLimit - activeSends)
          if (chunks.length === 0) {
            if (activeSends === 0 && chunkManager.isComplete()) {
              // All chunks sent successfully
              console.log("📤 Ultra-fast file transfer complete:", file.name)
              peerConnection?.dataChannel?.send(
                JSON.stringify({
                  type: "file-end",
                  fileId,
                }),
              )
              setFileTransfers((prev) =>
                prev.map((t) => (t.id === fileId ? { ...t, status: "completed", progress: 100 } : t)),
              )
              NotificationManager.showFileNotification(file.name, true)
              isTransferring = false
            }
            break
          }

          for (const chunk of chunks) {
            activeSends++
            sendChunk(chunk, fileData, chunkSize)
              .then(() => {
                activeSends--
                completedChunks++
                chunkManager.markCompleted(chunk.id)

                const progress = Math.round((completedChunks / totalChunks) * 100)
                const elapsed = Date.now() - startTime
                const speed = (completedChunks * chunkSize) / (elapsed / 1000)

                transferOptimizer.reportSuccessfulTransmission(chunkSize, elapsed / completedChunks)

                setFileTransfers((prev) =>
                  prev.map((t) => {
                    if (t.id === fileId) {
                      return {
                        ...t,
                        progress,
                        transferStats: { ...transferOptimizer.getStats(), speed },
                      }
                    }
                    return t
                  }),
                )

                setCurrentSpeed(speed)
                sendNextChunks() // Continue sending
              })
              .catch((error) => {
                activeSends--
                console.error("❌ Chunk send failed:", error)
                chunkManager.markFailed(chunk.id)
                transferOptimizer.reportPacketLoss(1, 1)

                // Retry failed chunks
                setTimeout(() => sendNextChunks(), 500) // Faster retry
              })
          }
        }
      }

      // Start sending chunks
      sendNextChunks()

      // Monitor for stale chunks and failed transfers
      const monitorInterval = setInterval(() => {
        if (!isTransferring) {
          clearInterval(monitorInterval)
          return
        }

        const staleCount = chunkManager.timeoutStaleChunks(15000) // Reduced timeout for faster detection
        if (staleCount > 0) {
          console.log(`⚠️ ${staleCount} chunks timed out, retrying...`)
          sendNextChunks()
        }

        const failedChunks = chunkManager.getFailedChunks()
        if (failedChunks.length > totalChunks * 0.1) {
          // More than 10% failed
          console.error("❌ Too many failed chunks, aborting transfer")
          isTransferring = false
          setFileTransfers((prev) => prev.map((t) => (t.id === fileId ? { ...t, status: "error" } : t)))
          setError("File transfer failed due to too many errors")
          NotificationManager.showFileNotification(file.name, false, "Transfer failed")
        }
      }, 2000) // More frequent monitoring
    } catch (error) {
      console.error("❌ Error preparing file:", error)
      setError("Failed to prepare file for transfer: " + (error as Error).message)
    }
  }

  const sendChunk = async (chunk: any, fileData: Uint8Array, chunkSize: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!peerConnectionRef.current?.dataChannel || peerConnectionRef.current.dataChannel.readyState !== "open") {
        reject(new Error("Data channel not ready"))
        return
      }

      const start = chunk.id * chunkSize
      const end = Math.min(start + chunkSize, fileData.length)
      const chunkData = fileData.slice(start, end)

      // Create ultra-fast message format
      const fileIdBytes = new TextEncoder().encode(chunk.id.toString())
      const message = new ArrayBuffer(8 + fileIdBytes.length + chunkData.length)
      const view = new DataView(message)

      view.setUint32(0, fileIdBytes.length)
      view.setUint32(4, chunk.id)
      new Uint8Array(message, 8, fileIdBytes.length).set(fileIdBytes)
      new Uint8Array(message, 8 + fileIdBytes.length).set(chunkData)

      try {
        if (peerConnectionRef.current.stabilizer) {
          peerConnectionRef.current.stabilizer.sendData(message).then((success) => {
            if (success) {
              resolve()
            } else {
              reject(new Error("Failed to queue chunk"))
            }
          })
        } else {
          peerConnectionRef.current.dataChannel.send(message)
          resolve()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("📱 File input triggered, files:", e.target.files?.length)
    const files = Array.from(e.target.files || [])

    if (files.length > 0) {
      console.log(
        "📱 Selected files:",
        files.map((f) => f.name),
      )
      setPreviewFiles(files)
      setShowPreview(true)
    } else {
      console.log("📱 No files selected")
    }

    e.target.value = ""
  }

  const handleAddMoreFiles = () => {
    fileInputRef.current?.click()
  }

  const handlePreviewSend = (files: File[]) => {
    sendFiles(files)
    setPreviewFiles([])
  }

  const handlePreviewCancel = () => () => {
    setPreviewFiles([])
  }

  const handleSendChatMessage = (content: string, type: "text" | "clipboard") => {
    if (!peerConnection?.dataChannel || peerConnection.dataChannel.readyState !== "open") {
      setError("Cannot send message - not connected")
      return
    }

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      content,
      sender: user?.firstName || "You",
      timestamp: new Date(),
      type,
    }

    setChatMessages((prev) => [...prev, message])

    peerConnection.dataChannel.send(
      JSON.stringify({
        type: "chat-message",
        id: message.id,
        content: message.content,
        sender: message.sender,
        timestamp: message.timestamp.getTime(),
        messageType: type,
      }),
    )

    SessionManager.extendSession(sessionId)
  }

  // Mobile-specific touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragOver(true)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setPreviewFiles(files)
      setShowPreview(true)
    }
  }

  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const getConnectionQualityColor = () => {
    switch (connectionQuality) {
      case "excellent":
        return "bg-green-400"
      case "good":
        return "bg-yellow-400"
      case "poor":
        return "bg-red-400"
      default:
        return "bg-gray-400"
    }
  }

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
  }

  if (!user) {
    router.push("/")
    return null
  }

  return (
    <div className="min-h-screen bg-purple-300 p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-4 md:mb-6">
          <h1 className="text-2xl md:text-4xl font-black text-black mb-2">SESSION: {sessionId}</h1>
          <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap">
            <div
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${
                wsStatus === "connected" ? "bg-green-400" : wsStatus === "connecting" ? "bg-yellow-400" : "bg-red-400"
              }`}
            >
              {wsStatus === "connected" ? (
                <Signal className="w-3 md:w-5 h-3 md:h-5" />
              ) : (
                <WifiOff className="w-3 md:w-5 h-3 md:h-5" />
              )}
              <span className="hidden md:inline">SIGNALING:</span>
              <span className="md:hidden">SIG:</span>
              {wsStatus.toUpperCase()}
            </div>

            <div
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${
                connectionStatus === "connected"
                  ? "bg-green-400"
                  : connectionStatus === "connecting"
                    ? "bg-yellow-400"
                    : "bg-red-400"
              }`}
            >
              {connectionStatus === "connected" ? (
                <Zap className="w-3 md:w-5 h-3 md:h-5" />
              ) : (
                <WifiOff className="w-3 md:w-5 h-3 md:h-5" />
              )}
              P2P: {connectionStatus.toUpperCase()}
            </div>

            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-blue-400 text-xs md:text-sm">
              <Users className="w-3 md:w-5 h-3 md:h-5" />
              {userCount}/2
            </div>

            {/* Connection Quality Indicator
            <div
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black text-xs md:text-sm ${getConnectionQualityColor()}`}
            >
              <Activity className="w-3 md:w-5 h-3 md:h-5" />
              QUALITY: {connectionQuality.toUpperCase()}
            </div> */}

            {/* Speed Indicator */}
            {currentSpeed > 0 && (
              <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-orange-400 text-xs md:text-sm">
                <Zap className="w-3 md:w-5 h-3 md:h-5" />
                {formatSpeed(currentSpeed)}
              </div>
            )}

            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-purple-400 text-xs md:text-sm">
              <Shield className="w-3 md:w-5 h-3 md:h-5" />
              {isMobile ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            </div>
          </div>

          {/* Connection stats for debugging */}
          {process.env.NODE_ENV === "development" && connectionStats && (
            <div className="mt-2 text-xs text-gray-600">
              Healthy endpoints: {connectionStats.healthyEndpoints}/{connectionStats.totalEndpoints} | Current:{" "}
              {connectionStats.currentEndpoint} | Pool: {connectionStats.poolSize} | RTT:{" "}
              {connectionStatsRef.current.roundTripTime.toFixed(3)}ms
            </div>
          )}
        </header>

        {error && (
          <Card className="neubrutalism-card bg-red-300 mb-4 md:mb-6">
            <CardContent className="p-3 md:p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0" />
              <span className="font-bold flex-1 text-sm md:text-base">{error}</span>
              {(wsStatus === "error" || wsStatus === "disconnected") && (
                <Button
                  onClick={handleReconnect}
                  size="sm"
                  className="neubrutalism-button bg-blue-500 text-white text-xs md:text-sm"
                >
                  <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
                  RECONNECT
                </Button>
              )}
              <Button onClick={() => setError("")} variant="ghost" size="sm" className="touch-target">
                <X className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4 md:space-y-6">
          {/* Row 1: File Drop Zone - Full Width */}
          <div className="w-full">
            <Card className="neubrutalism-card bg-yellow-300">
              <CardHeader className="pb-3 md:pb-6">
                <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                  <Zap className="w-5 md:w-6 h-5 md:h-6" />FILE TRANSFER
                  {getAIScanner() && <Scan className="w-4 h-4 text-green-600" {...{ title: "AI Scanning Enabled" }} />}
                  <Files className="w-4 h-4 text-blue-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-4 border-dashed border-black p-4 md:p-8 text-center transition-colors file-drop-mobile ${
                    dragOver ? "bg-green-200" : "bg-white"
                  } ${connectionStatus !== "connected" ? "opacity-50" : ""} drag-zone`}
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => {
                    if (isMobile && connectionStatus === "connected") {
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <Zap className="w-12 md:w-16 h-12 md:h-16 mx-auto mb-4 text-orange-500" />
                  <p className="text-lg md:text-xl font-black mb-2">
                    {connectionStatus === "connected"
                      ? isMobile
                        ? "TAP FOR TRANSFER"
                        : "DROP FILES FOR TRANSFER"
                      : "WAITING FOR CONNECTION..."}
                  </p>
                  {!isMobile && <p className="font-bold mb-4">or</p>}

                  <div className="relative">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        fileInputRef.current?.click()
                      }}
                      disabled={connectionStatus !== "connected"}
                      className="neubrutalism-button bg-blue-500 text-white hover:bg-white hover:text-blue-500 touch-target"
                      type="button"
                    >
                     CHOOSE FILES
                    </Button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="*/*"
                      capture={undefined}
                    />
                  </div>

                  <p className="text-xs md:text-sm font-bold mt-4 text-gray-600">
                    Max 1GB per file • AI Scanned •
                    SHA-256 verified
                  </p>

                  {connectionStatus === "connected" && (
                    <div className="mt-2 text-xs text-green-700 font-bold">
                       {transferOptimizer.getConcurrentChunks()} parallel chunks •{" "}
                      {(transferOptimizer.getOptimalChunkSize() / 1024).toFixed(0)}KB chunks
                      {compressionEnabled && " • Smart compression"}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile-specific file selection alternative */}
          {/* {isMobile && connectionStatus === "connected" && (
            <div className="mt-4 p-4 bg-blue-100 border-2 border-blue-400 rounded">
              <p className="text-sm font-bold mb-2">📱 Mobile Ultra-Fast Transfer:</p>
              <label
                htmlFor="mobile-file-input"
                className="block w-full p-3 bg-blue-500 text-white font-bold text-center border-2 border-black cursor-pointer hover:bg-blue-600"
              >
                ⚡ SELECT FILES FOR LIGHTNING-FAST TRANSFER
              </label>
              <input
                id="mobile-file-input"
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="*//*"
              />
            </div>
          )} */}

          {/* Row 2: Chat (2/3) + Connection Status (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Chat Panel - 2 blocks */}
            <div className="lg:col-span-2">
              <Card className="neubrutalism-card bg-indigo-300 h-full">
                <ChatPanel
                  isConnected={connectionStatus === "connected"}
                  currentUser={user?.firstName || "You"}
                  onSendMessage={handleSendChatMessage}
                  messages={chatMessages}
                />
              </Card>
            </div>

            {/* Connection Status - 1 block */}
            <div className="lg:col-span-1">
              <Card className="neubrutalism-card bg-blue-300 h-full">
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                    <Zap className="w-5 md:w-6 h-5 md:h-6" />CONNECTION
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-4">
                    {wsStatus === "connecting" && (
                      <div className="bg-yellow-200 p-4 md:p-6 border-4 border-black">
                        <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4 mobile-spinner"></div>
                        <p className="font-black text-base md:text-lg">CONNECTING...</p>
                        <p className="font-bold text-sm md:text-base">Establishing signaling</p>
                        {connectionStats && (
                          <p className="text-xs mt-2 text-gray-600">
                            Trying {connectionStats.healthyEndpoints} healthy endpoints...
                          </p>
                        )}
                      </div>
                    )}
                    {wsStatus === "connected" && userCount < 2 && (
                      <div className="bg-yellow-200 p-4 md:p-6 border-4 border-black">
                        <div className="animate-pulse w-6 md:w-8 h-6 md:h-8 bg-yellow-600 rounded-full mx-auto mb-4"></div>
                        <p className="font-black text-base md:text-lg">WAITING FOR PEER...</p>
                        <p className="font-bold text-sm md:text-base">Share the session code with your friend!</p>
                        <p className="text-xs md:text-sm mt-2">Users in session: {userCount}/2</p>
                      </div>
                    )}
                    {wsStatus === "connected" && userCount === 2 && connectionStatus === "connecting" && (
                      <div className="bg-orange-200 p-4 md:p-6 border-4 border-black">
                        <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4 mobile-spinner"></div>
                        <p className="font-black text-base md:text-lg">ESTABLISHING P2P...</p>
                        <p className="font-bold text-sm md:text-base">Setting up direct connection</p>
                        <p className="text-xs md:text-sm mt-2">
                          {isInitiator ? "Initiating connection..." : "Waiting for connection..."}
                        </p>
                        <Button
                          onClick={() => {
                            resetPeerConnection()
                            setTimeout(() => {
                              if (isInitiator) {
                                initiateConnection()
                              }
                            }, 1000)
                          }}
                          className="neubrutalism-button bg-orange-500 text-white mt-4 touch-target"
                          size="sm"
                        >
                          <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />⚡ RETRY
                        </Button>
                      </div>
                    )}
                    {connectionStatus === "connected" && (
                      <div className="bg-green-200 p-4 md:p-6 border-4 border-black">
                        <Zap className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-green-600" />
                        <p className="font-black text-base md:text-lg text-green-800">
                          CONNECTION ACTIVE!
                        </p>
                        <p className="font-bold text-sm md:text-base">Ready for transfer & chat</p>
                        <p className="text-xs md:text-sm mt-2">
                          P2P • {transferOptimizer.getConcurrentChunks()} parallel • Quality:{" "}
                          {connectionQuality}
                          {compressionEnabled && " • Smart compression"}
                        </p>
                        {connectionStatsRef.current.roundTripTime > 0 && (
                          <p className="text-xs mt-1">RTT: {connectionStatsRef.current.roundTripTime.toFixed(3)}ms</p>
                        )}
                        {currentSpeed > 0 && (
                          <p className="text-xs mt-1 font-bold text-green-700">⚡ Speed: {formatSpeed(currentSpeed)}</p>
                        )}
                      </div>
                    )}
                    {(wsStatus === "disconnected" || wsStatus === "error") && (
                      <div className="bg-red-200 p-4 md:p-6 border-4 border-black">
                        <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-red-600" />
                        <p className="font-black text-base md:text-lg text-red-800">CONNECTION FAILED</p>
                        <p className="font-bold mb-4 text-sm md:text-base">
                          {wsStatus === "error" ? "Cannot connect to signaling server" : "Connection lost"}
                        </p>
                        <Button
                          onClick={handleReconnect}
                          className="neubrutalism-button bg-red-500 text-white touch-target"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />RECONNECT
                        </Button>
                      </div>
                    )}
                    {connectionStatus === "disconnected" && wsStatus === "connected" && (
                      <div className="bg-orange-200 p-4 md:p-6 border-4 border-black">
                        <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-orange-600" />
                        <p className="font-black text-base md:text-lg text-orange-800">PEER DISCONNECTED</p>
                        <p className="font-bold mb-4 text-sm md:text-base">Auto-reconnecting to peer...</p>
                        <Button
                          onClick={() => {
                            resetPeerConnection()
                            setTimeout(() => {
                              if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(
                                  JSON.stringify({
                                    type: "retry-connection",
                                    sessionId,
                                    userId: user?.id,
                                  }),
                                )
                              }
                            }, 500)
                          }}
                          className="neubrutalism-button bg-orange-500 text-white touch-target"
                          size="sm"
                        >
                          <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />RETRY
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Row 3: File Transfers - Full Width */}
          {fileTransfers.length > 0 && (
            <div className="w-full">
              <Card className="neubrutalism-card bg-green-200">
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                    <Zap className="w-5 md:w-6 h-5 md:h-6" />FILE TRANSFERS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 md:space-y-4">
                    {fileTransfers.map((transfer) => (
                      <div key={transfer.id} className="bg-white p-3 md:p-4 border-2 border-black">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {transfer.direction === "sending" ? (
                              <Upload className="w-3 md:w-4 h-3 md:h-4 flex-shrink-0" />
                            ) : (
                              <Download className="w-3 md:w-4 h-3 md:h-4 flex-shrink-0" />
                            )}
                            <span className="font-bold text-sm md:text-base truncate">{transfer.name}</span>
                            <span className="text-xs md:text-sm text-gray-600 flex-shrink-0">
                              ({(transfer.size / 1024 / 1024).toFixed(1)}MB)
                            </span>
                            {transfer.compressionRatio && transfer.compressionRatio > 1 && (
                              <span
                                className="text-xs bg-blue-100 px-1 rounded"
                                title={`Compressed ${transfer.compressionRatio.toFixed(1)}x`}
                              >
                                {transfer.compressionRatio.toFixed(1)}x
                              </span>
                            )}
                            {transfer.checksum && (
                              <span title="Checksum verified">
                                <Shield className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
                              </span>
                            )}
                            {transfer.scanResult && !transfer.scanResult.isRisky && (
                              <span title="AI Scan Passed">
                                <Scan className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
                              </span>
                            )}
                            <Zap
                              className="w-3 md:w-4 h-3 md:h-4 text-orange-500 flex-shrink-0"
                            />
                          </div>

                          <span
                            className={`px-2 py-1 text-xs font-bold border-2 border-black flex-shrink-0 ${
                              transfer.status === "completed"
                                ? "bg-green-300"
                                : transfer.status === "transferring"
                                  ? "bg-yellow-300"
                                  : transfer.status === "scanning"
                                    ? "bg-blue-300"
                                    : transfer.status === "blocked"
                                      ? "bg-red-400"
                                      : transfer.status === "error"
                                        ? "bg-red-300"
                                        : "bg-gray-300"
                            }`}
                          >
                            {transfer.status.toUpperCase()}
                          </span>
                        </div>

                        {transfer.scanResult?.isRisky && (
                          <div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 text-xs">
                            <strong>Blocked:</strong> {transfer.scanResult.reason}
                          </div>
                        )}

                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${transfer.progress}%` }} />
                        </div>

                        <div className="flex justify-between items-center text-xs md:text-sm mt-1">
                          <span className="font-bold">{transfer.progress}%</span>
                          {transfer.transferStats && transfer.transferStats.speed > 0 && (
                            <span className="text-green-600 font-bold">
                              {formatSpeed(transfer.transferStats.speed)}
                            </span>
                          )}
                          {transfer.transferStats && transfer.transferStats.eta > 0 && transfer.progress < 100 && (
                            <span className="text-gray-600">ETA: {Math.ceil(transfer.transferStats.eta)}s</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* File Preview Modal */}
        <FilePreviewModal
          files={previewFiles}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          onSendFiles={handlePreviewSend}
          onCancel={handlePreviewCancel}
          onAddMoreFiles={handleAddMoreFiles}
        />
      </div>
    </div>
  )
}
