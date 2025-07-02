"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Gauge, Zap } from 'lucide-react'
import { SpeedThrottle, type SpeedLimit } from '@/lib/speed-throttle'

interface SpeedControlProps {
  currentSpeed: SpeedLimit
  onSpeedChange: (speed: SpeedLimit) => void
  actualSpeed: number // bytes per second
}

export function SpeedControl({ currentSpeed, onSpeedChange, actualSpeed }: SpeedControlProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const speedOptions = SpeedThrottle.getSpeedLimitOptions()
  
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s'
    
    const units = ['B/s', 'KB/s', 'MB/s']
    let value = bytesPerSecond
    let unitIndex = 0
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }
    
    return `${value.toFixed(1)} ${units[unitIndex]}`
  }

  return (
    <Card className="neubrutalism-card bg-orange-200">
      <CardHeader className="pb-3">
        <CardTitle 
          className="text-lg font-black flex items-center gap-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Gauge className="w-5 h-5" />
          SPEED CONTROL
          <Button variant="ghost" size="sm" className="ml-auto">
            {isExpanded ? '−' : '+'}
          </Button>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Current Speed Display */}
          <div className="bg-white p-3 border-2 border-black">
            <div className="flex items-center justify-between">
              <span className="font-bold">Current Speed:</span>
              <span className="font-black text-lg flex items-center gap-1">
                <Zap className="w-4 h-4" />
                {formatSpeed(actualSpeed)}
              </span>
            </div>
          </div>

          {/* Speed Limit Selector */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Speed Limit:</label>
            <Select value={currentSpeed} onValueChange={onSpeedChange}>
              <SelectTrigger className="neubrutalism-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {speedOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Speed Info */}
          <div className="text-xs text-gray-600 space-y-1">
            <p>• Unlimited: No speed restrictions</p>
            <p>• Limited: Throttles file transfer speed</p>
            <p>• Useful for bandwidth management</p>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
