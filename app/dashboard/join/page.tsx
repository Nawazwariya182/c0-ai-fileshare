"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useUser } from "@/hooks/useUser"
import { LogIn, QrCode } from 'lucide-react'
import { useRouter } from "next/navigation"

export default function JoinSessionPage() {
  const { user } = useUser()
  const router = useRouter()
  const [sessionCode, setSessionCode] = useState("")
  const [error, setError] = useState("")

  const validateAndJoin = () => {
    const code = sessionCode.trim().toUpperCase()

    // Validate 6-character alphanumeric code
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Code must be exactly 6 alphanumeric characters")
      return
    }

    setError("")
    router.push(`/session/${code}`)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6)
    setSessionCode(value)
    setError("")
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-blue-300 p-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl md:text-5xl font-black text-black mb-2 transform rotate-1">JOIN SESSION</h1>
          <p className="text-base md:text-lg font-bold px-2">Enter the 6-digit code to connect!</p>
        </header>

        <Card className="neubrutalism-card bg-yellow-300">
          <CardHeader>
            <CardTitle className="text-2xl font-black flex items-center gap-2">
              <LogIn className="w-6 h-6" />
              ENTER SESSION CODE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <Input
                  type="text"
                  placeholder="ABC123"
                  value={sessionCode}
                  onChange={handleInputChange}
                  className="neubrutalism-input text-center text-2xl md:text-3xl font-black tracking-widest bg-white touch-target"
                  maxLength={6}
                />
                {error && <p className="text-red-600 font-bold mt-2 text-center">{error}</p>}
              </div>

              <Button
                onClick={validateAndJoin}
                disabled={sessionCode.length !== 6}
                className="w-full neubrutalism-button bg-green-500 text-white hover:bg-white hover:text-green-500 text-lg md:text-xl py-3 md:py-4 disabled:opacity-50 disabled:cursor-not-allowed touch-target"
              >
                <LogIn className="w-4 md:w-5 h-4 md:h-5 mr-2" />
                JOIN SESSION
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Scanner Option */}
        <Card className="neubrutalism-card bg-purple-300 mt-8">
          <CardHeader>
            <CardTitle className="text-2xl font-black flex items-center gap-2">
              <QrCode className="w-6 h-6" />
              OR SCAN QR CODE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-center mb-4">
              Use your phone's camera to scan a QR code shared by your friend
            </p>
            <div className="bg-white p-6 md:p-8 border-4 border-black text-center">
              <QrCode className="w-12 md:w-16 h-12 md:h-16 mx-auto mb-2" />
              <p className="font-bold text-sm md:text-base">Point camera at QR code</p>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="neubrutalism-card bg-green-200 mt-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-black mb-4">HOW TO JOIN:</h3>
            <ol className="list-decimal list-inside space-y-2 font-bold">
              <li>Get the 6-digit code from your friend</li>
              <li>Type it in the box above (letters and numbers only)</li>
              <li>Click "JOIN SESSION" to connect</li>
              <li>Start receiving files instantly!</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
