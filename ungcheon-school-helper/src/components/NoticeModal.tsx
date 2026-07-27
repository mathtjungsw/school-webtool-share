import { useState, useEffect } from 'react'
import { Megaphone, X, Clock } from 'lucide-react'
import { useNoticeStore } from '../stores/noticeStore'

const LEVEL_STYLES: Record<string, { badge: string; label: string; ring: string }> = {
  info:      { badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',      label: '안내',   ring: 'bg-sky-500/20 border-sky-500/30 text-sky-400' },
  important: { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', label: '중요',   ring: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
  urgent:    { badge: 'bg-red-500/20 text-red-300 border-red-500/30',       label: '긴급',   ring: 'bg-red-500/20 border-red-500/30 text-red-400' },
}

export default function NoticeModal() {
  const open = useNoticeStore(s => s.open)
  const notices = useNoticeStore(s => s.notices)
  const activeId = useNoticeStore(s => s.activeId)
  const openNotice = useNoticeStore(s => s.openNotice)
  const close = useNoticeStore(s => s.close)

  const [dontShowToday, setDontShowToday] = useState(false)

  // 모달이 열릴 때마다 체크박스 초기화
  useEffect(() => {
    if (open) setDontShowToday(false)
  }, [open, activeId])

  if (!open) return null

  const active = notices.find(n => n.id === activeId) ?? notices[0] ?? null
  const others = notices.filter(n => n.id !== active?.id)
  const lv = LEVEL_STYLES[active?.level ?? 'info'] ?? LEVEL_STYLES.info

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Overlay — 클릭 시 닫기 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => close(dontShowToday)} />

      {/* 모달 카드 */}
      <div className="relative w-[440px] max-w-[92vw] max-h-[80vh] bg-surface-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5 flex-shrink-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${lv.ring}`}>
            <Megaphone size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white">공지사항</h2>
            <p className="text-[10px] text-slate-500">웅천고 업무도우미 알림</p>
          </div>
          <button
            onClick={() => close(dontShowToday)}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
            title="닫기"
          >
            <X size={15} />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-none">
          {!active ? (
            <p className="text-sm text-slate-500 text-center py-10">등록된 공지가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${lv.badge}`}>{lv.label}</span>
                {active.date && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={10} /> {active.date}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-white leading-snug mb-2.5">{active.title}</h3>
              <p className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{active.body}</p>

              {/* 다른 공지 목록 */}
              {others.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">지난 공지</p>
                  <div className="space-y-0.5">
                    {others.map(n => (
                      <button
                        key={n.id}
                        onClick={() => openNotice(n.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="w-1 h-1 rounded-full bg-slate-600 flex-shrink-0" />
                        <span className="text-xs text-slate-400 truncate flex-1">{n.title}</span>
                        {n.date && <span className="text-[10px] text-slate-600 flex-shrink-0">{n.date}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 — 오늘 하루 보지 않기 + 닫기 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 flex-shrink-0 bg-surface-900/50">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowToday}
              onChange={e => setDontShowToday(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-surface-900 accent-violet-500 cursor-pointer"
            />
            <span className="text-[11px] text-slate-400">오늘 하루 보지 않기</span>
          </label>
          <button
            onClick={() => close(dontShowToday)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-500 hover:bg-violet-400 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
