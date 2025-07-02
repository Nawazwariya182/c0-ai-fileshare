"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUser } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
import {
  Upload,
  Download,
  Users,
  Wifi,
  WifiOff,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  Shield,
  Smartphone,
  Monitor,
  Scan,
  Files,
} from "lucide-react"

// Import optimized core systems
import { FilePreviewModal } from "@/components/file-preview-modal"
import { ChatPanel } from "@/components/chat-panel"
import { getAIScanner, type ScanResult } from "@/lib/ai-scanner"
import { SessionManager } from "@/lib/session-manager"
import { NotificationManager } from "@/lib/notifications"
import { UltraReliableP2P } from "@/lib/ultra-reliable-p2p"

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
  speed?: number
}

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: "text" | "clipboard"
}

export default function SessionPage() {
  const { user } = useUser()
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  // Core connection states
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [fileTransfers, setFileTransfers] = useState<FileTransfer[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState("")
  const [userCount, setUserCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  // File handling states
  const [dragOver, setDragOver] = useState(false)
  const [previewFiles, setPreviewFiles] = useState<File[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "poor">("good")

  // Core system refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ultraP2PRef = useRef<UltraReliableP2P | null>(null)
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const connectionAttempts = useRef(0)
  const isReconnecting = useRef(false)
  const lastActivity = useRef(Date.now())
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Enhanced mobile and connection management
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("📱 Page hidden - maintaining ultra-reliable connection")
        lastActivity.current = Date.now()

        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current)
        }

        if (ultraP2PRef.current) {
          ultraP2PRef.current.enableBackgroundMode(true)
          ultraP2PRef.current.maintainConnection()
        }
      } else {
        console.log("📱 Page visible - optimizing connection")

        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current)
        }

        if (ultraP2PRef.current) {
          ultraP2PRef.current.enableBackgroundMode(false)
          // Ultra-fast connection check and recovery
          setTimeout(() => {
            if (ultraP2PRef.current && (connectionStatus !== "connected" || wsStatus !== "connected")) {
              console.log("🔄 Ultra-fast recovery after visibility change")
              handleReconnect()
            }
          }, 200) // Reduced from 500ms to 200ms
        }
      }
    }

    const handlePageHide = () => {
      console.log("📱 Page hide event - preserving ultra-reliable state")
      lastActivity.current = Date.now()
      if (ultraP2PRef.current) {
        ultraP2PRef.current.preserveConnectionState()
        ultraP2PRef.current.maintainConnection()
      }
    }

    const handlePageShow = () => {
      console.log("📱 Page show event - restoring ultra-reliable connection")
      if (ultraP2PRef.current) {
        setTimeout(() => {
          ultraP2PRef.current?.restoreConnectionState()
          if (connectionStatus !== "connected" || wsStatus !== "connected") {
            handleReconnect()
          }
        }, 50) // Reduced from 100ms to 50ms for faster recovery
      }
    }

    const handleBeforeUnload = () => {
      if (ultraP2PRef.current) {
        ultraP2PRef.current.gracefulDisconnect()
      }
    }

    // Add all mobile-specific event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handlePageHide)
    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("beforeunload", handleBeforeUnload)

    // Mobile-specific events
    window.addEventListener("focus", handlePageShow)
    window.addEventListener("blur", handlePageHide)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handlePageHide)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("focus", handlePageShow)
      window.removeEventListener("blur", handlePageHide)

      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current)
      }
    }
  }, [connectionStatus, wsStatus])

  // Enhanced reconnection logic with exponential backoff
  const handleReconnect = () => {
    if (isReconnecting.current) {
      console.log("🔄 Reconnection already in progress")
      return
    }

    isReconnecting.current = true
    connectionAttempts.current++

    console.log(`🔄 Ultra-fast reconnection attempt ${connectionAttempts.current}`)

    setError("")

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Faster exponential backoff: 500ms, 1s, 2s, 4s, max 15s
    const delay = Math.min(500 * Math.pow(2, connectionAttempts.current - 1), 15000)

    reconnectTimeoutRef.current = setTimeout(() => {
      if (ultraP2PRef.current) {
        ultraP2PRef.current.forceReconnect()
      }

      // Reset reconnection flag after attempt
      setTimeout(() => {
        isReconnecting.current = false

        // If still not connected, try again with increased limit
        if (connectionStatus !== "connected" && connectionAttempts.current < 20) {
          // Increased from 10 to 20
          handleReconnect()
        } else if (connectionAttempts.current >= 20) {
          setError("Connection issues detected. The system will continue trying to reconnect automatically.")
          // Reset attempts after a longer delay for continuous retry
          setTimeout(() => {
            connectionAttempts.current = 0
          }, 30000)
        }
      }, 3000) // Reduced from 5000ms to 3000ms
    }, delay)
  }

  // Initialize ultra-reliable P2P system with enhanced configuration
  useEffect(() => {
    if (!user || !sessionId) return

    console.log("🚀 Initializing Ultra-Reliable P2P System")

    const ultraP2P = new UltraReliableP2P(sessionId, user.id, {
      // Ultra-enhanced configuration for maximum reliability and speed
      maxReconnectAttempts: 100,
      reconnectDelay: 500,
      heartbeatInterval: 2000, // Faster heartbeat for better responsiveness
      connectionTimeout: 10000,
      chunkSize: 1024 * 1024, // 1MB chunks for maximum speed
      maxConcurrentChunks: 8, // Parallel transfers for speed
      enableCompression: true,
      enableResumableTransfers: true,
      mobileOptimizations: true,
      backgroundMode: false,
    })

    ultraP2PRef.current = ultraP2P

    // Core connection event handlers with enhanced reliability
    ultraP2P.onConnectionStatusChange = (status) => {
      console.log(`🔗 Connection status: ${status}`)
      setConnectionStatus(status)

      if (status === "connected") {
        connectionAttempts.current = 0
        isReconnecting.current = false
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      } else if (status === "disconnected" && !isReconnecting.current) {
        // Auto-reconnect on disconnection
        setTimeout(() => handleReconnect(), 1000)
      }
    }

    ultraP2P.onSignalingStatusChange = (status) => {
      console.log(`📡 Signaling status: ${status}`)
      setWsStatus(status)

      if (status === "disconnected" || status === "error") {
        if (!isReconnecting.current) {
          setTimeout(() => handleReconnect(), 500)
        }
      }
    }

    ultraP2P.onUserCountChange = (count) => {
      setUserCount(count)
    }

    ultraP2P.onError = (errorMsg) => {
      console.error("❌ P2P Error:", errorMsg)
      setError(errorMsg)

      // Auto-recovery for certain errors
      if (errorMsg.includes("connection") || errorMsg.includes("signaling")) {
        setTimeout(() => handleReconnect(), 2000)
      }
    }

    ultraP2P.onConnectionQualityChange = (quality) => {
      setConnectionQuality(quality)
    }

    ultraP2P.onSpeedUpdate = (speed) => {
      setCurrentSpeed(speed)
    }

    // File transfer event handlers with resumption support
    ultraP2P.onFileTransferUpdate = (transfers) => {
      setFileTransfers(transfers)
    }

    ultraP2P.onChatMessage = (message) => {
      setChatMessages((prev) => [...prev, message])
    }

    // Enhanced connection recovery
    ultraP2P.onConnectionRecovery = () => {
      console.log("✅ Connection recovered successfully")
      setError("")
      connectionAttempts.current = 0
      isReconnecting.current = false
    }

    // Initialize connection with retry logic
    const initializeConnection = async () => {
      try {
        await ultraP2P.initialize()
      } catch (error) {
        console.error("❌ Failed to initialize P2P:", error)
        setTimeout(() => handleReconnect(), 2000)
      }
    }

    initializeConnection()

    // Session management
    NotificationManager.requestPermission()
    SessionManager.createSession(sessionId)
    startSessionTimer()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current)
      }

      ultraP2P.destroy()

      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current)
      }
    }
  }, [user, sessionId])

  // Detect mobile device with enhanced detection
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.innerWidth < 768 ||
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0

      setIsMobile(isMobileDevice)

      // Configure P2P for mobile if needed
      if (ultraP2PRef.current && isMobileDevice) {
        ultraP2PRef.current.configureMobileOptimizations(true)
      }
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const startSessionTimer = () => {
    sessionTimerRef.current = setInterval(() => {
      const timeLeft = SessionManager.getTimeUntilExpiry(sessionId)
      if (timeLeft <= 0) {
        handleSessionExpiry()
      }
    }, 1000)
  }

  const handleSessionExpiry = () => {
    SessionManager.expireSession(sessionId)
    setError("Session has expired due to inactivity")
    setTimeout(() => router.push("/"), 3000)
  }

  // Enhanced file handling with connection preservation
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setPreviewFiles(files)
      setShowPreview(true)

      // Ensure ultra-reliable connection is maintained during file selection
      if (ultraP2PRef.current) {
        ultraP2PRef.current.maintainConnection()
      }
    }
    e.target.value = ""
  }

  const handlePreviewSend = async (files: File[]) => {
    if (ultraP2PRef.current) {
      // Ensure ultra-strong connection before sending
      if (connectionStatus !== "connected") {
        setError("Connection not ready. Establishing ultra-reliable connection...")
        handleReconnect()
        return
      }

      // Maintain connection during transfer
      ultraP2PRef.current.maintainConnection()
      await ultraP2PRef.current.sendFiles(files)
    }
    setPreviewFiles([])
    setShowPreview(false)
  }

  const handleSendChatMessage = (content: string, type: "text" | "clipboard") => {
    if (ultraP2PRef.current) {
      ultraP2PRef.current.sendChatMessage(content, type, user?.firstName || "You")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setPreviewFiles(files)
      setShowPreview(true)

      // Maintain connection during drag and drop
      if (ultraP2PRef.current) {
        ultraP2PRef.current.maintainConnection()
      }
    }
  }

  if (!user) {
    router.push("/")
    return null
  }

  const getConnectionQualityColor = () => {
    switch (connectionQuality) {
      case "excellent":
        return "bg-green-500"
      case "good":
        return "bg-yellow-500"
      case "poor":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getSpeedDisplay = () => {
    if (currentSpeed === 0) return "0 KB/s"
    if (currentSpeed < 1024) return `${currentSpeed.toFixed(0)} B/s`
    if (currentSpeed < 1024 * 1024) return `${(currentSpeed / 1024).toFixed(1)} KB/s`
    return `${(currentSpeed / 1024 / 1024).toFixed(1)} MB/s`
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
                <Wifi className="w-3 md:w-5 h-3 md:h-5" />
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
                <Users className="w-3 md:w-5 h-3 md:h-5" />
              ) : (
                <WifiOff className="w-3 md:w-5 h-3 md:h-5" />
              )}
              P2P: {connectionStatus.toUpperCase()}
            </div>

            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-blue-400 text-xs md:text-sm">
              <Users className="w-3 md:w-5 h-3 md:h-5" />
              {userCount}/2
            </div>

            <div
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black ${getConnectionQualityColor()} text-white text-xs md:text-sm`}
            >
              <Shield className="w-3 md:w-5 h-3 md:h-5" />
              {connectionQuality.toUpperCase()}
            </div>

            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 border-2 md:border-4 border-black font-black bg-purple-400 text-xs md:text-sm">
              {isMobile ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
              {getSpeedDisplay()}
            </div>
          </div>
        </header>

        {error && (
          <Card className="neubrutalism-card bg-red-300 mb-4 md:mb-6">
            <CardContent className="p-3 md:p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0" />
              <span className="font-bold flex-1 text-sm md:text-base">{error}</span>
              <Button
                onClick={handleReconnect}
                size="sm"
                className="neubrutalism-button bg-blue-500 text-white text-xs md:text-sm"
              >
                <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
                RECONNECT
              </Button>
              <Button onClick={() => setError("")} variant="ghost" size="sm" className="touch-target">
                <X className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4 md:space-y-6">
          {/* File Drop Zone */}
          <div className="w-full">
            <Card className="neubrutalism-card bg-yellow-300">
              <CardHeader className="pb-3 md:pb-6">
                <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                  <Upload className="w-5 md:w-6 h-5 md:h-6" />
                  SEND FILES
                  {getAIScanner() && <Scan className="w-4 h-4 text-green-600" />}
                  <Files className="w-4 h-4 text-blue-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-4 border-dashed border-black p-4 md:p-8 text-center transition-colors ${
                    dragOver ? "bg-green-200" : "bg-white"
                  } ${connectionStatus !== "connected" ? "opacity-50" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => {
                    if (isMobile && connectionStatus === "connected") {
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <Upload className="w-12 md:w-16 h-12 md:h-16 mx-auto mb-4" />
                  <p className="text-lg md:text-xl font-black mb-2">
                    {connectionStatus === "connected"
                      ? isMobile
                        ? "TAP HERE TO SELECT FILES"
                        : "DROP FILES HERE"
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
                    />
                  </div>
                  <p className="text-xs md:text-sm font-bold mt-4 text-gray-600">
                    Max 1GB per file • Multi-file support • AI Scanned • SHA-256 verified • Ultra-reliable transfer
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat + Connection Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
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

            <div className="lg:col-span-1">
              <Card className="neubrutalism-card bg-blue-300 h-full">
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                    <Users className="w-5 md:w-6 h-5 md:h-6" />
                    CONNECTION STATUS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-4">
                    {wsStatus === "connecting" && (
                      <div className="bg-yellow-200 p-4 md:p-6 border-4 border-black">
                        <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="font-black text-base md:text-lg">CONNECTING TO SERVER...</p>
                        <p className="font-bold text-sm md:text-base">Establishing ultra-reliable connection</p>
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
                        <div className="animate-spin w-6 md:w-8 h-6 md:h-8 border-4 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="font-black text-base md:text-lg">ESTABLISHING P2P...</p>
                        <p className="font-bold text-sm md:text-base">Setting up ultra-reliable connection</p>
                        <Button
                          onClick={handleReconnect}
                          className="neubrutalism-button bg-orange-500 text-white mt-4 touch-target"
                          size="sm"
                        >
                          <RefreshCw className="w-3 md:w-4 h-3 md:h-4 mr-1" />
                          RETRY
                        </Button>
                      </div>
                    )}

                    {connectionStatus === "connected" && (
                      <div className="bg-green-200 p-4 md:p-6 border-4 border-black">
                        <CheckCircle className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-green-600" />
                        <p className="font-black text-base md:text-lg text-green-800">ULTRA-RELIABLE CONNECTION!</p>
                        <p className="font-bold text-sm md:text-base">Zero packet loss • Maximum speed</p>
                        <p className="text-xs md:text-sm mt-2">
                          Quality: {connectionQuality} • Speed: {getSpeedDisplay()}
                        </p>
                      </div>
                    )}

                    {(wsStatus === "disconnected" || wsStatus === "error") && (
                      <div className="bg-red-200 p-4 md:p-6 border-4 border-black">
                        <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-red-600" />
                        <p className="font-black text-base md:text-lg text-red-800">CONNECTION FAILED</p>
                        <p className="font-bold mb-4 text-sm md:text-base">Auto-reconnecting...</p>
                        <Button
                          onClick={handleReconnect}
                          className="neubrutalism-button bg-red-500 text-white touch-target"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          FORCE RECONNECT
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* File Transfers */}
          {fileTransfers.length > 0 && (
            <div className="w-full">
              <Card className="neubrutalism-card bg-green-200">
                <CardHeader className="pb-3 md:pb-6">
                  <CardTitle className="text-lg md:text-2xl font-black flex items-center gap-2">
                    <FileText className="w-5 md:w-6 h-5 md:h-6" />
                    FILE TRANSFERS
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
                            {transfer.speed && transfer.speed > 0 && (
                              <span className="text-xs md:text-sm text-blue-600 flex-shrink-0">
                                {transfer.speed < 1024
                                  ? `${transfer.speed.toFixed(0)} B/s`
                                  : transfer.speed < 1024 * 1024
                                    ? `${(transfer.speed / 1024).toFixed(1)} KB/s`
                                    : `${(transfer.speed / 1024 / 1024).toFixed(1)} MB/s`}
                              </span>
                            )}
                            {transfer.checksum && (
                              <Shield className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
                            )}
                            {transfer.scanResult && !transfer.scanResult.isRisky && (
                              <Scan className="w-3 md:w-4 h-3 md:h-4 text-green-600 flex-shrink-0" />
                            )}
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
                        <div className="text-right text-xs md:text-sm font-bold mt-1">{transfer.progress}%</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <FilePreviewModal
          files={previewFiles}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          onSendFiles={handlePreviewSend}
          onCancel={() => () => setPreviewFiles([])}
          onAddMoreFiles={() => fileInputRef.current?.click()}
        />
      </div>
    </div>
  )
}
