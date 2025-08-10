"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUser } from "@/hooks/useUser"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Users, Wifi } from 'lucide-react'
import { useRouter } from "next/navigation"

export default function CreateSessionPage() {
  const { user } = useUser()
  const router = useRouter()
  const [sessionCode, setSessionCode] = useState<string>("")
  const [sessionUrl, setSessionUrl] = useState<string>("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Generate 6-digit alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    setSessionCode(code)
    setSessionUrl(`${window.location.origin}/session/${code}`)
  }, [])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const startSession = () => {
    router.push(`/session/${sessionCode}`)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-green-300 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-5xl font-black text-black mb-2 transform -rotate-1">CREATE SESSION</h1>
          <p className="text-base md:text-lg font-bold px-2">Share this code with your friend!</p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:gap-8">
          {/* Session Code Card */}
          <Card className="neubrutalism-card bg-yellow-300">
            <CardHeader>
              <CardTitle className="text-2xl font-black flex items-center gap-2">
                <Users className="w-6 h-6" />
                SESSION CODE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-6">
                <div className="text-4xl md:text-6xl font-black text-black bg-white p-4 md:p-6 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1 mb-4">
                  {sessionCode}
                </div>
                <Button
                  onClick={() => copyToClipboard(sessionCode)}
                  className="neubrutalism-button bg-blue-500 text-white hover:bg-white hover:text-blue-400 touch-target"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? "COPIED!" : "COPY CODE"}
                </Button>
              </div>

              <div className="text-center">
                <p className="font-bold mb-2">Session URL:</p>
                <div className="bg-white p-2 border-2 border-black font-mono text-sm break-all mb-2">{sessionUrl}</div>
                <Button
                  onClick={() => copyToClipboard(sessionUrl)}
                  variant="outline"
                  className="neubrutalism-button bg-white"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  COPY URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Code Card
          <Card className="neubrutalism-card bg-purple-300">
            <CardHeader>
              <CardTitle className="text-2xl font-black">QR CODE</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="bg-white p-4 md:p-6 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] inline-block mb-4">
                <QRCodeSVG value={sessionUrl} size={window.innerWidth < 768 ? 150 : 200} level="H" includeMargin={true} />
              </div>
              <p className="font-bold text-sm">Scan with phone camera to join instantly!</p>
            </CardContent>
          </Card> */}
        </div>

        {/* Start Session Button */}
        <div className="text-center mt-8">
          <Button onClick={startSession} className="neubrutalism-button bg-red-500 text-white hover:bg-white hover:text-red-500 text-lg md:text-2xl px-8 md:px-12 py-4 md:py-6 touch-target">
            <Wifi className="w-5 md:w-6 h-5 md:h-6 mr-2" />
            START SESSION
          </Button>
        </div>

        {/* Instructions */}
        <Card className="neubrutalism-card bg-blue-200 mt-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-black mb-4">INSTRUCTIONS:</h3>
            <ol className="list-decimal list-inside space-y-2 font-bold">
              <li>Share the 6-digit code with your friend</li>
              <li>Click "START SESSION" to enter the sharing room</li>
              <li>Wait for your friend to join using the code</li>
              <li>Once connected, drag & drop files to share instantly!</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
