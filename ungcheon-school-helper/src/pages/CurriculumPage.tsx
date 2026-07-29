import { useEffect, useState } from 'react'
import {
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Printer,
} from 'lucide-react'
import clsx from 'clsx'

type PdfId = 'all' | 'grade1' | 'grade2' | 'grade3'
type ChoiceId = 'choice1' | 'choice2'
type PageTab = PdfId | ChoiceId

const PDF_TABS: { id: PdfId; label: string; fileName: string; description: string }[] = [
  {
    id: 'all',
    label: '전학년',
    fileName: '2026학년도_웅천고_전학년_교육과정편성표.pdf',
    description: '2026학년도 당해연도 전 학년 교육과정 편성표',
  },
  {
    id: 'grade1',
    label: '1학년',
    fileName: '2026학년도_웅천고_1학년_교육과정편성표.pdf',
    description: '2026학년도 입학생 3개년 교육과정 편성표',
  },
  {
    id: 'grade2',
    label: '2학년',
    fileName: '2026학년도_웅천고_2학년_교육과정편성표.pdf',
    description: '2025학년도 입학생 3개년 교육과정 편성표',
  },
  {
    id: 'grade3',
    label: '3학년',
    fileName: '2026학년도_웅천고_3학년_교육과정편성표.pdf',
    description: '2024학년도 입학생 3개년 교육과정 편성표',
  },
]

const CHOICE_TABS: { id: ChoiceId; label: string; title: string; url: string }[] = [
  {
    id: 'choice1',
    label: '과목선택 도우미 - 1학년',
    title: '웅천고 과목 선택 도우미_1학년',
    url: 'https://mathtjungsw.github.io/ungcheon-high-school-work-tools/course-selection-grade1.html',
  },
  {
    id: 'choice2',
    label: '과목선택 도우미 - 2학년',
    title: '웅천고 과목 선택 도우미_2학년',
    url: 'https://mathtjungsw.github.io/ungcheon-high-school-work-tools/course-selection-grade2.html',
  },
]

export default function CurriculumPage() {
  const [tab, setTab] = useState<PageTab>('all')
  const [pdfUrl, setPdfUrl] = useState('')
  const [toast, setToast] = useState('')
  const pdf = PDF_TABS.find(item => item.id === tab)
  const choice = CHOICE_TABS.find(item => item.id === tab)

  useEffect(() => {
    let cancelled = false
    if (!pdf) {
      setPdfUrl('')
      return
    }
    window.electron.curriculumGetPdfUrl(pdf.id)
      .then(url => { if (!cancelled) setPdfUrl(url) })
      .catch(error => {
        if (!cancelled) showToast(error instanceof Error ? error.message : 'PDF를 불러오지 못했습니다.')
      })
    return () => { cancelled = true }
  }, [pdf?.id])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const savePdf = async () => {
    if (!pdf) return
    const saved = await window.electron.curriculumSavePdf(pdf.id, pdf.fileName)
    if (saved) showToast('PDF를 저장했습니다.')
  }

  return (
    <div className="h-full flex flex-col p-5 max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={21} className="text-sky-400" />
            <h1 className="page-title">교육과정 편제표 출력</h1>
          </div>
          <p className="page-subtitle mt-1">
            2026학년도 웅천고 편제표를 학년별로 확인·출력하고 학생 과목선택 상담을 진행합니다.
          </p>
        </div>
        {pdf && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => window.electron.curriculumOpenPdf(pdf.id)} className="btn-ghost flex items-center gap-1.5 text-sm">
              <ExternalLink size={14} /> 크게 열기
            </button>
            <button onClick={savePdf} className="btn-primary flex items-center gap-1.5 text-sm">
              <Download size={14} /> PDF 저장
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 mb-4 flex-shrink-0">
        {PDF_TABS.map(item => (
          <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            <FileText size={13} /> {item.label}
          </TabButton>
        ))}
        <span className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />
        {CHOICE_TABS.map(item => (
          <TabButton key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            <GraduationCap size={13} /> {item.label}
          </TabButton>
        ))}
      </div>

      {pdf && (
        <section className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-t-xl border border-b-0 border-white/10 bg-white/[0.035]">
            <div>
              <p className="text-sm font-semibold text-slate-100">{pdf.description}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">원본 Excel의 인쇄 설정과 서식을 그대로 반영한 PDF입니다.</p>
            </div>
            <button onClick={() => window.electron.curriculumOpenPdf(pdf.id)} className="text-xs text-sky-300 hover:text-sky-200 flex items-center gap-1">
              <Printer size={13} /> 인쇄
            </button>
          </div>
          <div className="flex-1 min-h-[520px] rounded-b-xl overflow-hidden border border-white/10 bg-slate-200">
            {pdfUrl ? (
              <iframe key={pdfUrl} src={`${pdfUrl}#view=FitH&toolbar=1`} title={pdf.description} className="w-full h-full border-0" />
            ) : (
              <div className="h-full grid place-items-center text-sm text-slate-500">편제표를 불러오는 중...</div>
            )}
          </div>
        </section>
      )}

      {choice && (
        <OriginalSubjectChoiceFrame key={choice.id} title={choice.title} url={choice.url} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-slate-950 border border-white/10 px-4 py-2.5 text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
        active
          ? 'border-sky-400 text-sky-200 bg-sky-500/5'
          : 'border-transparent text-slate-500 hover:text-slate-200',
      )}
    >
      {children}
    </button>
  )
}

function OriginalSubjectChoiceFrame({ title, url }: { title: string; url: string }) {
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-t-xl border border-b-0 border-white/10 bg-white/[0.035]">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            원본 도우미를 그대로 표시합니다. 학생 이름과 선택 내용은 이 PC에 자동 임시 저장됩니다.
          </p>
        </div>
        <button
          onClick={() => window.electron.openExternal(url)}
          className="btn-ghost flex items-center gap-1.5 text-xs flex-shrink-0"
        >
          <ExternalLink size={13} /> 브라우저에서 열기
        </button>
      </div>
      <div className="flex-1 min-h-[620px] rounded-b-xl overflow-hidden border border-white/10 bg-white">
        <iframe
          src={url}
          title={title}
          className="w-full h-full border-0 bg-white"
          allow="clipboard-write"
        />
      </div>
    </section>
  )
}
