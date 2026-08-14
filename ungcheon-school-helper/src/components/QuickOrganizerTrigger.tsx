import { useEffect, useRef } from 'react'
import { CalendarPlus } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export interface QuickOrganizerHint {
  date: string
  x: number
  y: number
}

export function QuickOrganizerTrigger({ hint, onOpen, onClose }: {
  hint: QuickOrganizerHint | null
  onOpen: (date: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!hint) return
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape)
    }
  }, [hint, onClose])

  if (!hint) return null
  const left = Math.min(Math.max(8, hint.x + 8), window.innerWidth - 170)
  const top = Math.min(Math.max(8, hint.y + 8), window.innerHeight - 48)
  const dateLabel = format(new Date(`${hint.date}T00:00:00`), 'M/d (EEE)', { locale: ko })

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(hint.date)}
      className="fixed z-[90] inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-300 px-3 py-2 text-[11px] font-black text-slate-950 shadow-xl transition-transform hover:scale-[1.03]"
      style={{ left, top }}
      aria-label={`${dateLabel} 일정 생성 창 열기`}
    >
      <CalendarPlus size={13} />+ 일정 생성 <span className="font-bold opacity-70">{dateLabel}</span>
    </button>
  )
}
