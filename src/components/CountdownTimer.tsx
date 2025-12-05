import React, { useState, useEffect } from 'react'
import { Clock, Zap } from 'lucide-react'

interface CountdownTimerProps {
  targetTime: string
  onComplete?: () => void
  variant?: 'default' | 'success'
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  targetTime,
  onComplete,
  variant = 'default'
}) => {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    // Reset expired state when targetTime changes
    setIsExpired(false)
  }, [targetTime])

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime()
      const target = new Date(targetTime).getTime()
      const remaining = Math.max(0, target - now)

      setTimeRemaining(remaining)

      if (remaining === 0 && !isExpired) {
        setIsExpired(true)
        onComplete?.()
      }
    }

    // Update immediately
    updateTimer()

    // Then update every second
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [targetTime, onComplete, isExpired])

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getTimeColor = () => {
    const minutes = Math.floor(timeRemaining / 60000)
    if (isExpired) return 'text-red-600'
    if (minutes <= 2) return 'text-red-600'
    if (minutes <= 5) return 'text-amber-600'
    return variant === 'success' ? 'text-emerald-600' : 'text-blue-600'
  }

  const getBackgroundColor = () => {
    const minutes = Math.floor(timeRemaining / 60000)
    if (isExpired) return 'bg-red-50 border-red-200'
    if (minutes <= 2) return 'bg-red-50 border-red-200'
    if (minutes <= 5) return 'bg-amber-50 border-amber-200'
    return variant === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
  }

  const getIcon = () => {
    const minutes = Math.floor(timeRemaining / 60000)
    if (minutes <= 2 || isExpired) {
      return <Zap className="w-6 h-6" />
    }
    return <Clock className="w-6 h-6" />
  }

  const getStatusText = () => {
    if (isExpired) return 'Game Starting...'

    const minutes = Math.floor(timeRemaining / 60000)
    if (minutes <= 2) return 'Starting Soon!'
    if (minutes <= 5) return 'Get Ready!'
    return 'Game Starts In'
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${getBackgroundColor()}`}>
      <div className="text-center space-y-2">
        <div className={`flex items-center justify-center gap-2 ${getTimeColor()}`}>
          {getIcon()}
          <span className="font-semibold">{getStatusText()}</span>
        </div>

        <div className={`text-3xl font-bold font-mono ${getTimeColor()}`}>
          {isExpired ? '0:00' : formatTime(timeRemaining)}
        </div>

        {!isExpired && (
          <p className="text-sm text-gray-600">
            {timeRemaining <= 120000
              ? 'Game will start automatically when timer reaches zero'
              : 'Or when 6 players join, whichever comes first'
            }
          </p>
        )}

        {isExpired && (
          <p className="text-sm text-red-600 font-medium">
            Redirecting to game...
          </p>
        )}
      </div>
    </div>
  )
}