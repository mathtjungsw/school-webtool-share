import { useMemo, useState, useRef, useEffect } from 'react'
import {
  BookOpen, Search, FileText, ExternalLink, X, ChevronRight, Info, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import { DOC_SECTIONS, QNA_ITEMS, DOC_META, type QnaItem } from '../data/admissionCounseling'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

export default function AdmissionCounselingPage() {
  const [sectionId, setSectionId] = useState<string>(DOC_SECTIONS[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [viewerPage, setViewerPage] = useState<number | null>(null)

  const searching = query.trim().length > 0

  const visible = useMemo<QnaItem[]>(() => {
    if (searching) {
      const nq = norm(query)
      return QNA_ITEMS.filter(q => norm(`${q.question}${q.sectionTitle}`).includes(nq))
    }
    return QNA_ITEMS.filter(q => q.sectionId === sectionId)
  }, [searching, query, sectionId])

  const activeSection = DOC_SECTIONS.find(s => s.id === sectionId)

  return (
    <div className="flex h-full">
      {/* 좌측 TOC */}
      <aside className="w-60 flex-shrink-0 border-r border-white/5 bg-surface-950/40 overflow-y-auto p-3">
        <div className="flex items-center gap-1.5 px-1 mb-3">
          <BookOpen size={15} className="text-violet-400" />
          <span className="text-xs font-bold text-slate-300">목차</span>
        </div>
        {DOC_SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => { setSectionId(s.id); setQuery('') }}
            className={clsx('w-full text-left px-2.5 py-2 rounded-lg mb-0.5 transition-colors group',
              !searching && s.id === sectionId ? 'bg-violet-500/15 border border-violet-500/25' : 'hover:bg-white/5 border border-transparent')}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-violet-400 flex-shrink-0">{s.roman}</span>
              <span className="text-xs text-slate-300 leading-snug flex-1">{s.title}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 pl-4">
              {s.qnaCount > 0
                ? <span className="text-[10px] text-slate-500">{s.qnaCount}문항</span>
                : <span className="text-[10px] text-slate-600">원본 PDF</span>}
            </div>
          </button>
        ))}
      </aside>

      {/* 본문 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 + 검색 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="질문 검색 (예: 수시, 등록, 지역인재, 의예과)"
              className="input !pl-9 !py-2" />
            {query && <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={14} /></button>}
          </div>
          <span className="text-[11px] text-slate-500 ml-auto hidden sm:inline">{DOC_META.year}학년도 · 총 {DOC_META.qnaCount}문항</span>
          <button onClick={() => setViewerPage(1)} className="btn-secondary !py-2 !px-3 flex items-center gap-1.5 text-xs flex-shrink-0">
            <FileText size={13} /> 원본 자료집
          </button>
        </div>

        {/* 결과 */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs text-slate-500 mb-3">
            {searching
              ? <>‘{query}’ 검색 결과 <span className="text-slate-300">{visible.length}</span>건</>
              : <><span className="text-violet-300 font-medium">{activeSection?.roman} {activeSection?.title}</span> · {visible.length}문항</>}
          </p>

          {!searching && activeSection && activeSection.qnaCount === 0 ? (
            <div className="card text-center py-12">
              <FileText size={28} className="text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-4">이 단원은 표·계획표 위주로, 원본 자료집에서 확인하는 것이 정확합니다.</p>
              <button onClick={() => setViewerPage(activeSection.pdfPage)} className="btn-primary !py-2 !px-4 text-sm inline-flex items-center gap-1.5">
                <BookOpen size={14} /> 이 단원 원본 보기
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center text-center py-16 text-slate-500">
              <Info size={28} className="mb-3 opacity-50" />
              <p className="text-sm">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map(q => (
                <button key={`${q.sectionId}-${q.no}`} onClick={() => setViewerPage(q.pdfPage)}
                  className="w-full text-left card !p-3.5 group transition-all duration-200 hover:border-violet-500/30 hover:bg-surface-700 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-violet-400 bg-violet-500/10 rounded-md px-1.5 py-0.5 flex-shrink-0 mt-0.5">{q.no}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 leading-relaxed">{q.question}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {searching && <span className="text-[10px] text-slate-500">{q.section} {q.sectionTitle}</span>}
                        <span className="text-[10px] text-slate-500">자료집 {q.printedPage}쪽</span>
                      </div>
                    </div>
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-500 group-hover:text-violet-300 flex-shrink-0 mt-0.5">
                      원본 <ChevronRight size={12} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewerPage !== null && <PdfViewer page={viewerPage} onClose={() => setViewerPage(null)} />}
    </div>
  )
}

// ─── 번들 PDF 뷰어 (resources/ 에서 로드 → Blob → iframe #page=) ──────
function PdfViewer({ page, onClose }: { page: number; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [error, setError] = useState('')
  const blobRef = useRef<string | null>(null)

  // 최초 1회: 번들 PDF를 읽어 Blob URL 생성. 언마운트 시 revoke.
  useEffect(() => {
    let revoked = false
    ;(async () => {
      try {
        if (!window.electron) throw new Error('Electron 환경에서만 원본 PDF를 열 수 있습니다.')
        const base = (await window.electron.getResourcesPath()).replace(/\\/g, '/')
        const path = `${base}/${DOC_META.pdfFile}`
        setFilePath(path)
        const bytes: number[] = await window.electron.readFile(path)
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        blobRef.current = url
        if (!revoked) setBlobUrl(url)
      } catch (e) {
        setError(String(e))
      }
    })()
    return () => { revoked = true; if (blobRef.current) URL.revokeObjectURL(blobRef.current) }
  }, [])

  const cleanup = () => onClose()

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={cleanup}>
      <div className="flex items-center justify-between px-4 h-11 bg-surface-950 border-b border-white/10 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-violet-400" />
          <span className="text-sm font-medium text-slate-200">대입상담 역량강화 자료집 — {page}쪽</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => filePath && window.electron.openPath(filePath)}
            title="외부 프로그램에서 열기" className="btn-ghost p-1.5"><ExternalLink size={14} /></button>
          <button onClick={cleanup} title="닫기" className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
      </div>
      <div className="flex-1 relative" onClick={e => e.stopPropagation()}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <Info size={28} className="text-rose-400 mb-3" />
            <p className="text-sm text-rose-300 mb-1">원본 PDF를 불러오지 못했습니다.</p>
            <p className="text-xs text-slate-500 max-w-md">{error}</p>
          </div>
        ) : !blobUrl ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            <Loader2 size={18} className="animate-spin mr-2" /> 원본 자료집을 불러오는 중…
          </div>
        ) : (
          <iframe
            key={page}
            src={`${blobUrl}#page=${page}&view=FitH`}
            title="대입상담 자료집"
            className="w-full h-full bg-white"
          />
        )}
      </div>
    </div>
  )
}
