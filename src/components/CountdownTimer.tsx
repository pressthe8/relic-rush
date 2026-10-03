import { useEffect, useRef, useState } from 'react'

interface CountdownTimerProps {
  targetTime: string
  onComplete?: () => void
  variant?: 'default' | 'success'
  label?: string
  expiredText?: string
  clockOffset?: number
  compact?: boolean
  inline?: boolean
}
export function CountdownTimer({ targetTime, onComplete, label = 'Game starts in', expiredText = 'Updating lobby…', clockOffset = 0, compact = false, inline = false }: CountdownTimerProps) {
  const remaining = () => Math.max(0, Date.parse(targetTime) - Date.now() - clockOffset)
  const [time, setTime] = useState(remaining)
  const callback = useRef(onComplete)
  callback.current = onComplete
  useEffect(() => {
    let notified = false
    const update = () => {
      const value = Math.max(0, Date.parse(targetTime) - Date.now() - clockOffset)
      setTime(value)
      if (!value && !notified) { notified = true; callback.current?.() }
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [targetTime, clockOffset])
  const seconds = Math.ceil(time / 1000)
  if (inline) return <div>
    <p className="text-[11px] text-gray-600">{label}</p>
    <p role="timer" aria-label={time > 0 ? label : expiredText} className={`mt-1 text-2xl font-bold leading-tight tabular-nums ${seconds <= 20 ? 'text-red-700' : 'text-emerald-800'}`}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </p>
    {time <= 0 && <span role="status" className="sr-only">{expiredText}</span>}
  </div>
  return <div className={`rounded-lg border border-emerald-200 bg-white text-center ${compact ? 'flex items-center justify-between gap-4 p-3' : 'p-4'}`}>
    <p className="text-sm text-gray-700">{time > 0 ? label : expiredText}</p>
    <p role="timer" className={`text-3xl font-bold font-mono ${seconds <= 20 ? 'text-red-700' : 'text-emerald-800'}`}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </p>
  </div>
}
