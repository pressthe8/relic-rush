import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function GameCode({ code, copyable = false }: { code: string; copyable?: boolean }) {
  const [feedback, setFeedback] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    clearTimeout(timer.current)
    try { await navigator.clipboard.writeText(code); setFeedback('Copied!') }
    catch { setFeedback('Couldn’t copy. Select the code to copy it.') }
    timer.current = setTimeout(() => setFeedback(''), 4000)
  }
  return <div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      <span>Game <strong className="select-all font-mono tracking-wider text-emerald-800">{code}</strong></span>
      {copyable && <button type="button" className="game-button-secondary !px-3 !py-2 text-xs" onClick={copy}>
        {feedback === 'Copied!' ? <Check size={15} /> : <Copy size={15} />}Copy
      </button>}
    </div>
    {copyable && <p role="status" className="mt-1 text-xs text-emerald-800">{feedback}</p>}
  </div>
}
