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
} from "lucide-react"
import { FilePreviewModal } from "@/components/file-preview-modal"
import { ChatPanel } from "@/components/chat-panel"
import { BulletproofP2P } from "@/lib/bulletproof-p2p"

interface FileTransfer {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: "pending" | "transferring" | "completed" | "error" | "cancelled"
  direction: "sending" | "receiving"
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

  // Connection states
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
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
  const [connectionQuality, setConnectionQuality] = useState<"excellent" | "good" | "poor">("excellent")

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const p2pRef = useRef<BulletproofP2P | null>(null)

  // Initialize P2P
  useEffect(() => {
    if (!user || !sessionId) return

    console.log("🚀 Initializing Simple P2P System")
    const p2p = new BulletproofP2P(sessionId, user.id)
    p2pRef.current = p2p

    // Set up event handlers
    p2p.onConnectionStatusChange = (status) => {
      console.log(`🔗 P2P status: ${status}`)
      setConnectionStatus(status)
      if (status === "connected") {
        setError("")
      }
    }

    p2p.onSignalingStatusChange = (status) => {
      console.log(`📡 Signaling status: ${status}`)
      setWsStatus(status)
      if (status === "connected") {
        setError("")
      }
    }

    p2p.onUserCountChange = (count) => {
      setUserCount(count)
    }

    p2p.onError = (errorMsg) => {
      console.error("❌ P2P Error:", errorMsg)
      setError(errorMsg)
    }

    p2p.onConnectionQualityChange = (quality) => {
      setConnectionQuality(quality)
    }

    p2p.onSpeedUpdate = (speed) => {
      setCurrentSpeed(speed)
    }

    p2p.onFileTransferUpdate = (transfers) => {
      setFileTransfers(transfers)
    }

    p2p.onChatMessage = (message) => {
      setChatMessages((prev) => [...prev, message])
    }

    p2p.onConnectionRecovery = () => {
      console.log("✅ Connection recovered")
      setError("")
    }

    // Initialize
    p2p.initialize()

    return () => {
      p2p.destroy()
    }
  }, [user, sessionId])

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.innerWidth < 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      setIsMobile(isMobileDevice)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      // Check file sizes (max 1GB per file)
      const oversizedFiles = files.filter((file) => file.size > 1024 * 1024 * 1024)
      if (oversizedFiles.length > 0) {
        setError(`Files too large: ${oversizedFiles.map((f) => f.name).join(", ")}. Max size: 1GB per file`)
        return
      }
      setPreviewFiles(files)
      setShowPreview(true)
    }
    e.target.value = ""
  }

  const handlePreviewSend = async (files: File[]) => {
    if (p2pRef.current) {
      await p2pRef.current.sendFiles(files)
    }
    setPreviewFiles([])
    setShowPreview(false)
  }

  const handleSendChatMessage = (content: string, type: "text" | "clipboard") => {
    if (p2pRef.current) {
      p2pRef.current.sendChatMessage(content, type, user?.firstName || "You")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      // Check file sizes (max 1GB per file)
      const oversizedFiles = files.filter((file) => file.size > 1024 * 1024 * 1024)
      if (oversizedFiles.length > 0) {
        setError(`Files too large: ${oversizedFiles.map((f) => f.name).join(", ")}. Max size: 1GB per file`)
        return
      }
      setPreviewFiles(files)
      setShowPreview(true)
    }
  }

  const handleCancelTransfer = (transferId: string) => {
    if (p2pRef.current) {
      p2pRef.current.cancelFileTransfer(transferId)
    }
  }

  const handleReconnect = () => {
    if (p2pRef.current) {
      p2pRef.current.forceReconnect()
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
        return "bg-green-500"
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
                      : "ESTABLISHING CONNECTION..."}
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
                    Max 1GB per file • Multi-file support • Bulletproof transfer
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
                        <p className="font-bold text-sm md:text-base">Establishing bulletproof connection</p>
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
                        <p className="font-bold text-sm md:text-base">Bulletproof connection setup</p>
                      </div>
                    )}

                    {connectionStatus === "connected" && (
                      <div className="bg-green-200 p-4 md:p-6 border-4 border-black">
                        <CheckCircle className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-green-600" />
                        <p className="font-black text-base md:text-lg text-green-800">BULLETPROOF CONNECTION!</p>
                        <p className="font-bold text-sm md:text-base">Maximum stability • Zero packet loss</p>
                        <p className="text-xs md:text-sm mt-2">
                          Quality: {connectionQuality} • Speed: {getSpeedDisplay()}
                        </p>
                      </div>
                    )}

                    {(wsStatus === "disconnected" || connectionStatus === "disconnected") && (
                      <div className="bg-red-200 p-4 md:p-6 border-4 border-black">
                        <WifiOff className="w-10 md:w-12 h-10 md:h-12 mx-auto mb-4 text-red-600" />
                        <p className="font-black text-base md:text-lg text-red-800">CONNECTION ISSUE</p>
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
                    BULLETPROOF TRANSFERS
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
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs font-bold border-2 border-black flex-shrink-0 ${
                                transfer.status === "completed"
                                  ? "bg-green-300"
                                  : transfer.status === "transferring"
                                    ? "bg-yellow-300"
                                    : transfer.status === "cancelled"
                                      ? "bg-gray-300"
                                      : transfer.status === "error"
                                        ? "bg-red-300"
                                        : "bg-gray-300"
                              }`}
                            >
                              {transfer.status.toUpperCase()}
                            </span>
                            {(transfer.status === "transferring" || transfer.status === "pending") && (
                              <Button
                                onClick={() => handleCancelTransfer(transfer.id)}
                                size="sm"
                                variant="ghost"
                                className="p-1 h-auto"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
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
