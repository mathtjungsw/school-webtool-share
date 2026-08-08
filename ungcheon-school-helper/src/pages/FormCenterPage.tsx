import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ArrowLeftRight, Check, ClipboardCopy, FileDown, FileSpreadsheet, FileText,
  GraduationCap, Printer, Save, Settings2, UsersRound,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { escapeHtml, printHtml } from '../utils/printHtml'

type FormField = {
  id: string
  label: string
  placeholder?: string
  multiline?: boolean
  type?: 'text' | 'date' | 'time' | 'number'
  defaultValue?: string
}

type FormTemplate = {
  id: string
  title: string
  description: string
  fields: FormField[]
}

type CommonInfo = {
  schoolName: string
  academicYear: string
  department: string
  author: string
  documentDate: string
  approvalLine: string
}

const today = () => new Date().toISOString().slice(0, 10)
const currentYear = () => String(new Date().getFullYear())

const TEMPLATES: FormTemplate[] = [
  {
    id: 'meeting_minutes', title: '회의록', description: '부서·학년·교과협의회 등 일반 회의 기록',
    fields: [
      { id: 'meetingName', label: '회의명', placeholder: '예: 1학기 교육과정부 협의회' },
      { id: 'date', label: '회의 날짜', type: 'date', defaultValue: today() },
      { id: 'time', label: '회의 시간', placeholder: '예: 15:40~16:30' },
      { id: 'location', label: '장소', placeholder: '예: 2층 협의회실' },
      { id: 'chair', label: '진행자', placeholder: '성명' },
      { id: 'attendees', label: '참석자', multiline: true, placeholder: '쉼표 또는 줄바꿈으로 입력' },
      { id: 'agenda', label: '안건', multiline: true, placeholder: '안건을 줄마다 입력' },
      { id: 'discussion', label: '협의 내용', multiline: true, placeholder: '주요 논의 내용을 입력' },
      { id: 'decisions', label: '결정 사항', multiline: true, placeholder: '결정 사항을 입력' },
      { id: 'followup', label: '담당자·완료 기한', multiline: true, placeholder: '예: 홍길동 — 8월 10일까지' },
    ],
  },
  {
    id: 'event_plan', title: '행사 계획서', description: '교내 행사·교육활동 시행 계획',
    fields: [
      { id: 'title', label: '행사명', placeholder: '예: 2026학년도 진로체험의 날' },
      { id: 'purpose', label: '목적', multiline: true },
      { id: 'date', label: '일자', type: 'date', defaultValue: today() },
      { id: 'time', label: '시간', placeholder: '예: 09:00~15:30' },
      { id: 'location', label: '장소' },
      { id: 'target', label: '대상' },
      { id: 'manager', label: '담당자' },
      { id: 'participants', label: '참여 인원·명단', multiline: true },
      { id: 'schedule', label: '세부 일정', multiline: true, placeholder: '시간 | 내용 | 담당 순으로 줄마다 입력' },
      { id: 'budget', label: '예산', multiline: true },
      { id: 'safety', label: '안전 계획', multiline: true },
      { id: 'notes', label: '기타 사항', multiline: true },
    ],
  },
  {
    id: 'result_report', title: '결과보고서', description: '행사·연수·사업 운영 결과 정리',
    fields: [
      { id: 'title', label: '사업·행사명' },
      { id: 'date', label: '운영일', type: 'date', defaultValue: today() },
      { id: 'location', label: '장소' },
      { id: 'target', label: '대상' },
      { id: 'participants', label: '참여 인원·명단', multiline: true },
      { id: 'summary', label: '운영 내용', multiline: true },
      { id: 'result', label: '운영 결과', multiline: true },
      { id: 'budget', label: '예산 집행', multiline: true },
      { id: 'improvements', label: '개선 사항', multiline: true },
      { id: 'attachments', label: '붙임 목록', multiline: true },
    ],
  },
  {
    id: 'participant_roster', title: '참가자 명단', description: '학생·교직원 참가자 및 서명 명단',
    fields: [
      { id: 'title', label: '명단 제목', placeholder: '예: 교직원 연수 참가자 명단' },
      { id: 'date', label: '일자', type: 'date', defaultValue: today() },
      { id: 'location', label: '장소' },
      { id: 'participants', label: '참가자', multiline: true, placeholder: '소속(학반) [탭 또는 쉼표] 이름 [탭 또는 쉼표] 비고\n예: 1-1, 홍길동, 학생회' },
      { id: 'notes', label: '안내·비고', multiline: true },
    ],
  },
  {
    id: 'home_letter', title: '가정통신문', description: '보호자 대상 학교 안내문 기본 양식',
    fields: [
      { id: 'title', label: '제목' },
      { id: 'recipient', label: '수신 대상', defaultValue: '학부모님께' },
      { id: 'greeting', label: '인사말', multiline: true, defaultValue: '학부모님의 가정에 건강과 행복이 가득하시기를 기원합니다.' },
      { id: 'body', label: '안내 내용', multiline: true },
      { id: 'replyDeadline', label: '신청·회신 기한', type: 'date' },
      { id: 'contact', label: '문의처' },
      { id: 'closing', label: '마무리 문구', multiline: true, defaultValue: '감사합니다.' },
    ],
  },
  {
    id: 'committee_notice', title: '위원회 개최 안내', description: '위원회 일정과 안건을 위원에게 안내',
    fields: [
      { id: 'committee', label: '위원회명' },
      { id: 'date', label: '개최일', type: 'date', defaultValue: today() },
      { id: 'time', label: '시간' },
      { id: 'location', label: '장소' },
      { id: 'members', label: '참석 대상 위원', multiline: true },
      { id: 'agenda', label: '심의·협의 안건', multiline: true },
      { id: 'materials', label: '준비 자료·안내', multiline: true },
    ],
  },
  {
    id: 'committee_minutes', title: '위원회 회의록', description: '위원회 심의·의결 결과 기록',
    fields: [
      { id: 'committee', label: '위원회명' },
      { id: 'date', label: '개최일', type: 'date', defaultValue: today() },
      { id: 'time', label: '시간' },
      { id: 'location', label: '장소' },
      { id: 'chair', label: '위원장' },
      { id: 'members', label: '참석 위원', multiline: true },
      { id: 'agenda', label: '안건', multiline: true },
      { id: 'discussion', label: '주요 발언·협의 내용', multiline: true },
      { id: 'decisions', label: '의결 결과', multiline: true },
      { id: 'nextActions', label: '후속 조치', multiline: true },
    ],
  },
]

const EXISTING_FORMS = [
  { page: 'staff_roster', title: '연수등록부', desc: '공유 교직원 명렬을 반영한 2단 서명부', icon: GraduationCap },
  { page: 'attendance_print', title: '출석부', desc: '학급·수업·교사·과목별 출석부', icon: UsersRound },
  { page: 'timetable_swap', title: '교환·보강 계획서', desc: '교환·대강 계획 작성 및 HWP·PDF 출력', icon: ArrowLeftRight },
]

const buildDefaults = (template: FormTemplate): Record<string, string> =>
  Object.fromEntries(template.fields.map(field => [field.id, field.defaultValue ?? '']))

const loadJson = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

const splitPeople = (value: string) => value.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean)

function participantRows(value: string): string[][] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const cells = line.split(/\t|,/).map(cell => cell.trim()).filter(Boolean)
    return cells.length === 1 ? ['', cells[0], ''] : [cells[0] ?? '', cells[1] ?? '', cells.slice(2).join(' ') || '']
  })
}

function approvalHtml(value: string): string {
  const labels = value.split(/[,/|]+/).map(label => label.trim()).filter(Boolean)
  if (!labels.length) return ''
  return `<table class="approval"><tr><th rowspan="2">결재</th>${labels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr><tr>${labels.map(() => '<td></td>').join('')}</tr></table>`
}

function buildDocumentHtml(template: FormTemplate, common: CommonInfo, values: Record<string, string>): string {
  const title = values.title || values.meetingName || values.committee || template.title
  const participantField = template.id === 'participant_roster' ? values.participants : ''
  const bodyRows = template.fields
    .filter(field => field.id !== 'title' && field.id !== 'meetingName' && field.id !== 'committee' && !(template.id === 'participant_roster' && field.id === 'participants'))
    .map(field => {
      const value = values[field.id] || '-'
      const formatted = escapeHtml(value).replace(/\n/g, '<br>')
      return `<tr><th>${escapeHtml(field.label)}</th><td>${formatted}</td></tr>`
    }).join('')
  const roster = participantField ? `<table class="roster"><thead><tr><th>번호</th><th>소속·학반</th><th>성명</th><th>서명</th><th>비고</th></tr></thead><tbody>${participantRows(participantField).map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td><td></td><td>${escapeHtml(row[2])}</td></tr>`).join('')}</tbody></table>` : ''
  const recipient = template.id === 'home_letter' && values.recipient ? `<p class="recipient">${escapeHtml(values.recipient)}</p>` : ''
  return `<div class="sheet form-sheet">
    ${approvalHtml(common.approvalLine)}
    <p class="school">${escapeHtml(common.schoolName)} · ${escapeHtml(common.academicYear)}학년도</p>
    <h1>${escapeHtml(title)}</h1>
    ${recipient}
    <table class="meta"><tr><th>작성 부서</th><td>${escapeHtml(common.department || '-')}</td><th>작성자</th><td>${escapeHtml(common.author || '-')}</td><th>작성일</th><td>${escapeHtml(common.documentDate)}</td></tr></table>
    ${roster || `<table class="content"><tbody>${bodyRows}</tbody></table>`}
    <p class="footer">${escapeHtml(common.schoolName)}</p>
  </div>`
}

const PRINT_CSS = `
  .form-sheet{min-height:297mm;padding:16mm 15mm;position:relative}.school{text-align:center;font-size:11pt;color:#555;margin-top:4mm}
  h1{text-align:center;font-size:22pt;margin:7mm 0 10mm}.approval{margin-left:auto;width:auto;border-collapse:collapse;margin-bottom:5mm}
  .approval th,.approval td{border:1px solid #222;text-align:center;min-width:18mm;height:9mm;font-size:9pt}.approval th:first-child{min-width:9mm}
  table.meta,table.content,table.roster{width:100%;border-collapse:collapse}.meta th,.meta td,.content th,.content td,.roster th,.roster td{border:1px solid #222;padding:2.6mm;font-size:10pt}
  .meta th,.content th,.roster th{background:#f1f5f9;font-weight:700}.meta th{width:12%}.content th{width:24%;vertical-align:top}.content td{min-height:11mm;white-space:normal}
  .roster th,.roster td{text-align:center;height:9mm}.roster th:nth-child(1){width:9%}.roster th:nth-child(2){width:25%}.roster th:nth-child(3){width:22%}.roster th:nth-child(4){width:22%}
  .recipient{font-size:12pt;font-weight:700;margin:0 0 5mm}.footer{text-align:center;font-size:13pt;font-weight:700;margin-top:12mm}@media print{.form-sheet{page-break-after:always}}
`

export default function FormCenterPage() {
  const config = useAppStore(state => state.config)
  const [selectedId, setSelectedId] = useState(TEMPLATES[0].id)
  const selected = TEMPLATES.find(template => template.id === selectedId) ?? TEMPLATES[0]
  const [common, setCommon] = useState<CommonInfo>(() => loadJson('form-center.common.v1', {
    schoolName: config.schoolName || '웅천고등학교', academicYear: currentYear(), department: '',
    author: config.teacherName || '', documentDate: today(), approvalLine: '담당, 부장, 교감, 교장',
  }))
  const [values, setValues] = useState<Record<string, string>>(() => loadJson(`form-center.draft.${selectedId}`, buildDefaults(selected)))
  const [message, setMessage] = useState('')

  useEffect(() => {
    setCommon(current => ({
      ...current,
      schoolName: current.schoolName || config.schoolName || '웅천고등학교',
      author: current.author || config.teacherName || '',
    }))
  }, [config.schoolName, config.teacherName])

  useEffect(() => { localStorage.setItem('form-center.common.v1', JSON.stringify(common)) }, [common])
  useEffect(() => { localStorage.setItem(`form-center.draft.${selectedId}`, JSON.stringify(values)) }, [selectedId, values])

  const selectTemplate = (id: string) => {
    const template = TEMPLATES.find(item => item.id === id) ?? TEMPLATES[0]
    setSelectedId(id)
    setValues(loadJson(`form-center.draft.${id}`, buildDefaults(template)))
    setMessage('')
  }
  const html = useMemo(() => buildDocumentHtml(selected, common, values), [selected, common, values])
  const updateValue = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }))
  const navigate = (page: string) => window.dispatchEvent(new CustomEvent('app:navigate', { detail: page }))

  const copyForHwp = async () => {
    const plain = [values.title || values.meetingName || values.committee || selected.title, ...selected.fields.map(field => `${field.label}\t${values[field.id] || ''}`)].join('\n')
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([`<meta charset="utf-8"><style>${PRINT_CSS}</style>${html}`], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        })])
      } else await navigator.clipboard.writeText(plain)
      setMessage('한글에 붙여넣기 좋은 형식으로 복사했습니다.')
    } catch { setMessage('복사하지 못했습니다. 다시 시도해주세요.') }
  }

  const downloadExcel = async () => {
    const rows = [
      ['학교명', common.schoolName], ['학년도', common.academicYear], ['부서', common.department],
      ['작성자', common.author], ['작성일', common.documentDate],
      ...selected.fields.map(field => [field.label, values[field.id] || '']),
    ]
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = [{ wch: 22 }, { wch: 75 }]
    XLSX.utils.book_append_sheet(workbook, sheet, '서식내용')
    if (selected.id === 'participant_roster') {
      const roster = [['번호', '소속·학반', '성명', '서명', '비고'], ...participantRows(values.participants || '').map((row, i) => [i + 1, row[0], row[1], '', row[2]])]
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(roster), '참가자명단')
    }
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const fileName = `${selected.title}_${common.documentDate || today()}.xlsx`.replace(/[\\/:*?"<>|]/g, '_')
    await window.electron.saveFileDialog(fileName, Array.from(new Uint8Array(bytes)))
  }

  const clearDraft = () => {
    if (!window.confirm(`${selected.title} 작성 내용을 초기화할까요?`)) return
    const next = buildDefaults(selected)
    setValues(next)
    localStorage.removeItem(`form-center.draft.${selectedId}`)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <header>
        <h1 className="page-title flex items-center gap-2"><FileText size={23} className="text-amber-400" />서식센터</h1>
        <p className="page-subtitle">학교 공통 정보를 한 번 입력하고 자주 쓰는 서식을 작성·인쇄·저장합니다.</p>
      </header>

      <section className="card p-4">
        <div className="flex items-center gap-2 mb-3"><Settings2 size={16} className="text-sky-400" /><h2 className="font-semibold text-white">공통 정보</h2><span className="text-[11px] text-slate-500">이 PC에 자동 저장</span></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="field-label lg:col-span-2">학교명<input className="input-field mt-1" value={common.schoolName} onChange={e => setCommon({ ...common, schoolName: e.target.value })} /></label>
          <label className="field-label">학년도<input className="input-field mt-1" value={common.academicYear} onChange={e => setCommon({ ...common, academicYear: e.target.value })} /></label>
          <label className="field-label">담당 부서<input className="input-field mt-1" value={common.department} onChange={e => setCommon({ ...common, department: e.target.value })} /></label>
          <label className="field-label">작성자<input className="input-field mt-1" value={common.author} onChange={e => setCommon({ ...common, author: e.target.value })} /></label>
          <label className="field-label">작성일<input type="date" className="input-field mt-1" value={common.documentDate} onChange={e => setCommon({ ...common, documentDate: e.target.value })} /></label>
          <label className="field-label lg:col-span-6">결재란 <span className="text-slate-600">(쉼표 구분)</span><input className="input-field mt-1" value={common.approvalLine} onChange={e => setCommon({ ...common, approvalLine: e.target.value })} /></label>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-2">기존 학교 서식 바로가기</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {EXISTING_FORMS.map(item => {
            const Icon = item.icon
            return <button key={item.page} onClick={() => navigate(item.page)} className="card card-hover p-4 text-left flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 grid place-items-center"><Icon size={19} /></span>
              <span><strong className="block text-sm text-white">{item.title}</strong><span className="text-xs text-slate-500">{item.desc}</span></span>
            </button>
          })}
        </div>
      </section>

      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)_minmax(360px,0.9fr)] gap-4 items-start">
        <aside className="card p-2 lg:sticky lg:top-3">
          {TEMPLATES.map(template => <button key={template.id} onClick={() => selectTemplate(template.id)} className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${selectedId === template.id ? 'bg-amber-400/15 text-amber-200' : 'text-slate-400 hover:bg-white/5'}`}>
            <span className="block text-sm font-semibold">{template.title}</span><span className="block text-[11px] mt-0.5 opacity-70">{template.description}</span>
          </button>)}
        </aside>

        <section className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-white">{selected.title} 작성</h2><p className="text-xs text-slate-500 mt-1">{selected.description}</p></div><button onClick={clearDraft} className="btn-ghost text-xs">내용 초기화</button></div>
          <div className="grid sm:grid-cols-2 gap-3">
            {selected.fields.map(field => <label key={field.id} className={`field-label ${field.multiline ? 'sm:col-span-2' : ''}`}>{field.label}
              {field.multiline
                ? <textarea className="input-field mt-1 min-h-[92px] resize-y" value={values[field.id] || ''} placeholder={field.placeholder} onChange={e => updateValue(field.id, e.target.value)} />
                : <input type={field.type || 'text'} className="input-field mt-1" value={values[field.id] || ''} placeholder={field.placeholder} onChange={e => updateValue(field.id, e.target.value)} />}
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
            <button className="btn-primary flex items-center gap-1.5" onClick={() => printHtml(html, PRINT_CSS)}><Printer size={14} />인쇄·PDF 저장</button>
            <button className="btn-ghost flex items-center gap-1.5" onClick={downloadExcel}><FileSpreadsheet size={14} />Excel 저장</button>
            <button className="btn-ghost flex items-center gap-1.5" onClick={copyForHwp}><ClipboardCopy size={14} />한글용 표 복사</button>
            <span className="ml-auto text-[11px] text-emerald-400 flex items-center gap-1"><Save size={12} />자동 저장됨</span>
          </div>
          {message && <p className="text-xs text-sky-300 flex items-center gap-1.5"><Check size={13} />{message}</p>}
        </section>

        <section className="card p-4 lg:sticky lg:top-3">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-white">A4 미리보기</h2><FileDown size={15} className="text-slate-500" /></div>
          <div className="bg-white rounded-lg overflow-hidden shadow-xl max-h-[720px] overflow-y-auto">
            <div className="text-slate-900 p-6 text-[10px]" dangerouslySetInnerHTML={{ __html: html.replace('sheet form-sheet', 'form-preview') }} />
          </div>
          <style>{`.form-preview .approval{margin-left:auto;border-collapse:collapse}.form-preview .approval th,.form-preview .approval td,.form-preview .meta th,.form-preview .meta td,.form-preview .content th,.form-preview .content td,.form-preview .roster th,.form-preview .roster td{border:1px solid #444;padding:4px}.form-preview table{border-collapse:collapse;width:100%;margin-bottom:8px}.form-preview .approval{width:auto}.form-preview .approval td{height:22px;min-width:34px}.form-preview h1{text-align:center;font-size:18px;margin:12px}.form-preview .school,.form-preview .footer{text-align:center}.form-preview .meta th,.form-preview .content th,.form-preview .roster th{background:#f1f5f9}.form-preview .content th{width:25%}.form-preview .recipient{font-weight:700}`}</style>
        </section>
      </div>
    </div>
  )
}
