"use client"

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MessageCircle, Send, Copy, Clipboard } from 'lucide-react'
import { ClipboardManager, type ClipboardData } from '@/lib/clipboard-manager'
import { NotificationManager } from '@/lib/notifications'

interface ChatMessage {
  id: string
  content: string
  sender: string
  timestamp: Date
  type: 'text' | 'clipboard'
}

interface ChatPanelProps {
  isConnected: boolean
  currentUser: string
  onSendMessage: (message: string, type: 'text' | 'clipboard') => void
  messages: ChatMessage[]
}

export function ChatPanel({ isConnected, currentUser, onSendMessage, messages }: ChatPanelProps) {
  const [messageInput, setMessageInput] = useState('')
  const [clipboardContent, setClipboardContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Show notification for new messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.sender !== currentUser) {
      NotificationManager.showChatNotification(lastMessage.content, lastMessage.sender)
    }
  }, [messages, currentUser])

  const handleSendMessage = () => {
    const content = messageInput.trim()
    if (!content || !isConnected) return

    // Sanitize message content
    const sanitized = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .substring(0, 10240) // Limit message length

    onSendMessage(sanitized, 'text')
    setMessageInput('')
    inputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleReadClipboard = async () => {
    const content = await ClipboardManager.readClipboard()
    if (!content) {
      alert('Failed to read clipboard or clipboard is empty')
      return
    }

    const validation = ClipboardManager.validateClipboardContent(content)
    if (!validation.isValid) {
      alert(`Cannot share clipboard: ${validation.reason}`)
      return
    }

    setClipboardContent(content)
  }

  const handleSendClipboard = () => {
    if (!clipboardContent || !isConnected) return

    const sanitized = ClipboardManager.sanitizeClipboardContent(clipboardContent)
    onSendMessage(sanitized, 'clipboard')
    setClipboardContent('')
  }

  const handleCopyMessage = async (content: string) => {
    const success = await ClipboardManager.writeClipboard(content)
    if (success) {
      // Show brief feedback
      const button = document.activeElement as HTMLButtonElement
      if (button) {
        const originalText = button.textContent
        button.textContent = 'COPIED!'
        setTimeout(() => {
          button.textContent = originalText
        }, 10240)
      }
    }
  }

  return (
    <Card className="neubrutalism-card bg-green-200 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-xl font-black flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          CHAT & CLIPBOARD
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4">
        {/* Messages */}
        <div className="flex-1 border-2 border-black bg-white p-2 overflow-y-auto mobile-scroll max-h-[300px]">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="font-bold">No messages yet</p>
              <p className="text-sm">Start chatting when connected!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-2 border-2 border-black ${
                    message.sender === currentUser
                      ? 'bg-blue-1024 ml-4'
                      : 'bg-gray-1024 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">
                      {message.sender === currentUser ? 'You' : message.sender}
                    </span>
                    <div className="flex items-center gap-1">
                      {message.type === 'clipboard' && (
                        <span title="Clipboard content">
                          <Clipboard className="w-3 h-3 text-blue-600" />
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                      <Button
                        onClick={() => handleCopyMessage(message.content)}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Clipboard Section */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              onClick={handleReadClipboard}
              disabled={!isConnected}
              className="neubrutalism-button bg-purple-500 text-white hover:bg-white hover:text-purple-500 flex-1"
              size="sm"
            >
              <Clipboard className="w-4 h-4 mr-1" />
              READ CLIPBOARD
            </Button>
            {clipboardContent && (
              <Button
                onClick={handleSendClipboard}
                className="neubrutalism-button bg-orange-500 text-white"
                size="sm"
              >
                <Send className="w-4 h-4 mr-1" />
                SEND
              </Button>
            )}
          </div>
          
          {clipboardContent && (
            <div className="bg-yellow-1024 p-2 border-2 border-black text-sm">
              <p className="font-bold mb-1">Clipboard Preview:</p>
              <p className="break-words">
                {clipboardContent.length > 1024 
                  ? clipboardContent.substring(0, 1024) + '...'
                  : clipboardContent
                }
              </p>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isConnected ? "Type a message..." : "Connect to chat"}
            disabled={!isConnected}
            className="neubrutalism-input flex-1"
            maxLength={10240}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!isConnected || !messageInput.trim()}
            className="neubrutalism-button bg-blue-500 text-white hover:bg-white hover:text-blue-500 touch-target"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
