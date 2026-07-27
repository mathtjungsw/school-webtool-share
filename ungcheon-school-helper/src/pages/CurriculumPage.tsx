import { useState, useMemo, useRef } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2, Download, Upload, FileSpreadsheet } from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'

// 고등학교 일반고 교육과정 기준 (2022 개정 교육과정)
const HIGH_REQUIRED: Record<string, { name: string; required: number }[]> = {
  '국어': [
    { name: '공통국어1', required: 4 },
    { name: '공통국어2', required: 4 },
  ],
  '수학': [
    { name: '공통수학1', required: 4 },
    { name: '공통수학2', required: 4 },
  ],
  '영어': [
    { name: '공통영어1', required: 4 },
    { name: '공통영어2', required: 4 },
  ],
  '사회': [
    { name: '통합사회1', required: 4 },
    { name: '통합사회2', required: 4 },
  ],
  '과학': [
    { name: '통합과학1', required: 4 },
    { name: '통합과학2', required: 4 },
    { name: '과학탐구실험1', required: 1 },
    { name: '과학탐구실험2', required: 1 },
  ],
  '한국사': [{ name: '한국사1', required: 3 }, { name: '한국사2', required: 3 }],
  '체육': [{ name: '체육1', required: 2 }, { name: '체육2', required: 2 }],
  '음악': [{ name: '음악', required: 2 }],
  '미술': [{ name: '미술', required: 2 }],
  '기술가정': [{ name: '기술·가정', required: 4 }],
  '정보': [{ name: '정보', required: 2 }],
}

const MID_REQUIRED: Record<string, { name: string; required: number }[]> = {
  '국어': [{ name: '국어', required: 10 }],
  '사회': [{ name: '사회/도덕 포함', required: 10 }],
  '수학': [{ name: '수학', required: 10 }],
  '과학': [{ name: '과학', required: 10 }],
  '기술가정': [{ name: '기술·가정/정보', required: 10 }],
  '체육': [{ name: '체육', required: 10 }],
  '예술': [{ name: '음악/미술', required: 10 }],
  '영어': [{ name: '영어', required: 10 }],
  '선택': [{ name: '한문/환경 등', required: 4 }],
}

type SchoolLevel = 'high' | 'middle'

interface SubjectRow {
  id: string
  subject: string
  subjectName: string
  grade1: number
  grade2: number
  grade3: number
  required: number
}

function initRows(level: SchoolLevel): SubjectRow[] {
  const def = level === 'high' ? HIGH_REQUIRED : MID_REQUIRED
  let idx = 0
  return Object.entries(def).flatMap(([subj, items]) =>
    items.map(item => ({
      id: `${subj}-${idx++}`,
      subject: subj,
      subjectName: item.name,
      grade1: 0, grade2: 0, grade3: 0,
      required: item.required,
    }))
  )
}

export default function CurriculumPage() {
  const [level, setLevel] = useState<SchoolLevel>('high')
  const [rows, setRows] = useState<SubjectRow[]>(initRows('high'))
  const [schoolName, setSchoolName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const switchLevel = (l: SchoolLevel) => {
    setLevel(l)
    setRows(initRows(l))
  }

  const update = (id: string, field: 'grade1' | 'grade2' | 'grade3', val: number) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: Math.max(0, val) } : x))

  const totals = useMemo(() => rows.map(r => ({
    ...r,
    total: r.grade1 + r.grade2 + r.grade3,
    ok: r.grade1 + r.grade2 + r.grade3 >= r.required,
  })), [rows])

  const grandTotal = totals.reduce((s, r) => s + r.total, 0)
  const requiredTotal = rows.reduce((s, r) => s + r.required, 0)
  const allOk = totals.every(r => r.ok)

  // 교과군별 그룹핑
  const subjects = [...new Set(rows.map(r => r.subject))]

  // Excel 양식 다운로드
  const downloadTemplate = () => {
    const header = [['학교명', '학년도', '학교구분', '교과(군)', '과목명', '기준단위', '1학년', '2학년', '3학년', '합계']]
    const ws = XLSX.utils.aoa_to_sheet(header)
    ws['!cols'] = [12, 8, 8, 10, 18, 8, 8, 8, 8, 8].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '편제표')
    XLSX.writeFile(wb, '교육과정편제표_양식.xlsx')
    showToast('양식 다운로드 완료!')
  }

  // Excel 저장
  const exportExcel = () => {
    const header = [schoolName || '○○학교', `${year}학년도 교육과정 편제표`]
    const tableHeader = ['교과(군)', '과목명', '기준단위', '1학년', '2학년', '3학년', '합계', '충족']
    const dataRows = totals.map(r => [
      r.subject, r.subjectName, r.required,
      r.grade1, r.grade2, r.grade3, r.total,
      r.ok ? '✓' : '✗',
    ])
    const totalRow = ['합계', '', requiredTotal,
      totals.reduce((s, r) => s + r.grade1, 0),
      totals.reduce((s, r) => s + r.grade2, 0),
      totals.reduce((s, r) => s + r.grade3, 0),
      grandTotal, allOk ? '✓' : '✗'
    ]
    const aoa = [header, [], [tableHeader[0], ...tableHeader.slice(1)], ...dataRows, totalRow]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [12, 18, 8, 8, 8, 8, 8, 6].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '편제표')
    XLSX.writeFile(wb, `교육과정편제표_${schoolName || year}.xlsx`)
    showToast('Excel 저장 완료!')
  }

  // Excel 불러오기
  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const updatedRows = [...rows]
        for (const row of data) {
          const subjectName = String(row['과목명'] ?? '')
          const idx = updatedRows.findIndex(r => r.subjectName === subjectName)
          if (idx >= 0) {
            updatedRows[idx] = {
              ...updatedRows[idx],
              grade1: Number(row['1학년'] ?? updatedRows[idx].grade1),
              grade2: Number(row['2학년'] ?? updatedRows[idx].grade2),
              grade3: Number(row['3학년'] ?? updatedRows[idx].grade3),
            }
          }
        }
        setRows(updatedRows)
        showToast('불러오기 완료!')
      } catch {
        showToast('파일을 읽을 수 없습니다.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">교육과정편제표 작성</h1>
          <p className="page-subtitle">학년별 과목 이수단위를 입력하면 기준 충족 여부를 자동으로 확인합니다</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Download size={13} />양식 다운로드
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Upload size={13} />불러오기
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" />
          <button onClick={exportExcel} className="btn-secondary flex items-center gap-1.5 text-sm">
            <FileSpreadsheet size={13} />Excel 저장
          </button>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="card mb-4">
        <div className="grid grid-cols-4 gap-3 items-end">
          <div>
            <label className="field-label">학교 구분</label>
            <div className="flex gap-1.5">
              {([['high', '고등학교'], ['middle', '중학교']] as [SchoolLevel, string][]).map(([v, l]) => (
                <button key={v} onClick={() => switchLevel(v)}
                  className={clsx('flex-1 py-2 rounded-lg text-xs border transition-all',
                    level === v
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                  )}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">학교명</label>
            <input className="input" placeholder="○○고등학교" value={schoolName}
              onChange={e => setSchoolName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">학년도</label>
            <input type="number" className="input" value={year}
              onChange={e => setYear(Number(e.target.value))} />
          </div>
          <button onClick={() => setRows(initRows(level))}
            className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} />초기화
          </button>
        </div>
      </div>

      {/* 충족 여부 요약 */}
      <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border mb-4',
        allOk
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
      )}>
        {allOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        <span className="text-sm font-medium">
          {allOk
            ? `총 이수단위 ${grandTotal}단위 — 모든 과목 기준 충족`
            : `총 이수단위 ${grandTotal}/${requiredTotal} — 미충족 과목이 있습니다`}
        </span>
      </div>

      {/* 편제표 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="text-left py-2 px-2 w-24">교과(군)</th>
              <th className="text-left py-2 px-2">과목명</th>
              <th className="text-center py-2 px-2 w-20">기준단위</th>
              <th className="text-center py-2 px-2 w-20">1학년</th>
              <th className="text-center py-2 px-2 w-20">2학년</th>
              <th className="text-center py-2 px-2 w-20">3학년</th>
              <th className="text-center py-2 px-2 w-20">합계</th>
              <th className="text-center py-2 px-2 w-16">충족</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(subj => {
              const group = totals.filter(r => r.subject === subj)
              return group.map((r, i) => (
                <tr key={r.id} className="border-b border-white/5">
                  {i === 0 && (
                    <td className="py-1.5 px-2 text-slate-400 align-top font-medium" rowSpan={group.length}>
                      {subj}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-slate-300">{r.subjectName}</td>
                  <td className="py-1.5 px-2 text-center text-slate-500">{r.required}</td>
                  {(['grade1', 'grade2', 'grade3'] as const).map(g => (
                    <td key={g} className="py-1 px-1 text-center">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        className="input w-full text-center text-xs px-0.5"
                        value={r[g] || ''}
                        placeholder="0"
                        onChange={e => update(r.id, g, Number(e.target.value))}
                      />
                    </td>
                  ))}
                  <td className={clsx('py-1.5 px-2 text-center font-semibold',
                    r.total >= r.required ? 'text-emerald-300' : 'text-amber-300'
                  )}>
                    {r.total}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {r.ok
                      ? <CheckCircle2 size={13} className="mx-auto text-emerald-400" />
                      : <AlertCircle size={13} className="mx-auto text-amber-400" />}
                  </td>
                </tr>
              ))
            })}
            <tr className="border-t-2 border-white/20 bg-surface-900">
              <td className="py-2 px-2 font-bold text-white" colSpan={2}>총계</td>
              <td className="py-2 px-2 text-center font-bold text-white">{requiredTotal}</td>
              <td className="py-2 px-2 text-center font-bold text-white">
                {totals.reduce((s, r) => s + r.grade1, 0)}
              </td>
              <td className="py-2 px-2 text-center font-bold text-white">
                {totals.reduce((s, r) => s + r.grade2, 0)}
              </td>
              <td className="py-2 px-2 text-center font-bold text-white">
                {totals.reduce((s, r) => s + r.grade3, 0)}
              </td>
              <td className="py-2 px-2 text-center font-bold text-violet-300 text-sm">{grandTotal}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600 mt-3">
        ※ 2022 개정 교육과정 기준. 학교 자율과정·창의적 체험활동은 별도 편성하세요.
      </p>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-700 text-white text-sm px-4 py-2 rounded-xl shadow-xl border border-white/10 z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
