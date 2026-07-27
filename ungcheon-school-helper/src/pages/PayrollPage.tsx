import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calculator, RefreshCw, Plus, Trash2, Info, FileSpreadsheet, Upload, Printer, Download, Table2, HelpCircle, X } from 'lucide-react'
import {
  JAGYEOK, HAKRYEOK, CAREER_TYPES,
  calcTotalConverted, calcTotalReal, calcHobong, calcNextPromotion,
  periodToString, type CareerEntry, type HobongResult
} from '../services/hobong'
import { exportHobongXlsx, exportHobongTemplate, importHobongXlsx, parseDate, type CareerRowData } from '../services/hobongExcel'
import { format } from 'date-fns'
import clsx from 'clsx'

interface CareerRow extends CareerRowData {
  id: string
  isBYEOKYI: boolean
}

function makeRow(): CareerRow {
  return { id: crypto.randomUUID(), content: '', typeName: '기간제교사', rate: 1.00, isBYEOKYI: false, startStr: '', endStr: '' }
}

function rowToEntry(r: CareerRow): CareerEntry {
  return {
    type: r.typeName,
    rate: r.rate,
    start: parseDate(r.startStr),
    end: parseDate(r.endStr),
    isBYEOKYI: r.isBYEOKYI,
  }
}

const REASONS = ['계약제교원임용', '초임호봉획정', '호봉재획정', '호봉정정']

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function PayrollPage() {
  // 기본정보
  const [deptName, setDeptName] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [reason, setReason] = useState('계약제교원임용')
  const [writer, setWriter] = useState('')
  const [currentHobong, setCurrentHobong] = useState(0)

  // 자격·학력
  const [jagyeokCode, setJagyeokCode] = useState(2)
  const [hakryeokCode, setHakryeokCode] = useState(5)
  const [hobongDate, setHobongDateStr] = useState('')
  const [hobongCap, setHobongCap] = useState(false)

  // 경력
  const [rows, setRows] = useState<CareerRow[]>([makeRow()])

  // 결과
  const [result, setResult] = useState<null | {
    hobong: HobongResult
    realPeriod: string
    convertedPeriod: string
    nextPromo: string | null
  }>(null)
  const [error, setError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [showRefModal, setShowRefModal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const addRow = () => setRows(r => [...r, makeRow()])
  const removeRow = (id: string) => setRows(r => r.filter(x => x.id !== id))
  const updateRow = (id: string, patch: Partial<CareerRow>) =>
    setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))

  const handleTypeChange = (id: string, typeName: string) => {
    const found = CAREER_TYPES.find(([n]) => n === typeName)
    updateRow(id, {
      typeName,
      rate: found ? found[1] : 0,
      isBYEOKYI: typeName === '병역',
    })
  }

  const calculate = () => {
    setError('')
    const entries = rows.map(rowToEntry)
    const hasDate = entries.some(e => e.start && e.end)
    if (!hasDate) {
      setError('최소 1개 경력의 시작일과 종료일을 입력해주세요.')
      return
    }
    const converted = calcTotalConverted(entries)
    const real = calcTotalReal(entries)
    const hobong = calcHobong(jagyeokCode, hakryeokCode, converted, hobongCap)
    const hd = parseDate(hobongDate) ?? new Date()
    const next = calcNextPromotion(hd, hobong.remainMonths, hobong.remainDays)
    setResult({
      hobong,
      realPeriod: periodToString(real),
      convertedPeriod: periodToString(converted),
      nextPromo: next ? format(next, 'yyyy년 M월 d일') : null,
    })
  }

  const reset = () => {
    setRows([makeRow()])
    setResult(null)
    setError('')
    setHobongDateStr('')
    setJagyeokCode(2)
    setHakryeokCode(5)
    setHobongCap(false)
    setDeptName('')
    setTeacherName('')
    setReason('계약제교원임용')
    setWriter('')
    setCurrentHobong(0)
  }

  const handleTemplateDownload = async () => {
    const buffer = exportHobongTemplate()
    const ok = await window.electron?.saveFileDialog('호봉획정표_양식.xlsx', buffer)
    if (ok) { setSaveMsg('양식을 저장했습니다.'); setTimeout(() => setSaveMsg(''), 3000) }
  }

  const handleExcelSave = async () => {
    if (!result) return
    const buffer = exportHobongXlsx({
      dept: deptName,
      name: teacherName,
      writer,
      reason,
      fixDate: hobongDate,
      jagyeokCode,
      hakryeokCode,
      currentHobong,
      rows: rows.map(r => ({ content: r.content, typeName: r.typeName, rate: r.rate, startStr: r.startStr, endStr: r.endStr })),
      result: {
        ...result.hobong,
        realPeriod: result.realPeriod,
        convertedPeriod: result.convertedPeriod,
        nextPromo: result.nextPromo,
      },
    })
    const safeName = teacherName ? teacherName.replace(/[\\/:*?"<>|]/g, '') : '교사'
    const fileName = `호봉획정표_${safeName}.xlsx`
    const ok = await window.electron?.saveFileDialog(fileName, buffer)
    if (ok) {
      setSaveMsg('저장되었습니다.')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const handleExcelLoad = async () => {
    const filePath = await window.electron?.openFileDialog([{ name: 'Excel 파일', extensions: ['xlsx'] }])
    if (!filePath) return
    const bytes = await window.electron?.readFile(filePath)
    if (!bytes) return
    const buffer = new Uint8Array(bytes).buffer
    try {
      const data = importHobongXlsx(buffer)
      if (data.dept !== undefined) setDeptName(data.dept)
      if (data.name !== undefined) setTeacherName(data.name)
      if (data.reason !== undefined) setReason(data.reason)
      if (data.fixDate !== undefined) setHobongDateStr(data.fixDate)
      if (data.writer !== undefined) setWriter(data.writer)
      if (data.jagyeokCode !== undefined) setJagyeokCode(data.jagyeokCode)
      if (data.hakryeokCode !== undefined) setHakryeokCode(data.hakryeokCode)
      if (data.currentHobong !== undefined) setCurrentHobong(data.currentHobong)
      if (data.rows && data.rows.length > 0) {
        setRows(data.rows.map(r => ({
          ...r,
          id: crypto.randomUUID(),
          isBYEOKYI: r.typeName === '병역',
        })))
      }
      setResult(null)
    } catch {
      setError('파일을 읽을 수 없습니다. 올바른 호봉획정표 양식 파일인지 확인하세요.')
    }
  }

  const handlePrint = () => {
    if (!result) return
    const jag = JAGYEOK[jagyeokCode]
    const hak = HAKRYEOK[hakryeokCode]
    const careerRows = rows
      .filter(r => r.startStr && r.endStr)
      .map(r => `<tr>
        <td>${esc(r.content || '-')}</td>
        <td style="text-align:center;">${esc(r.typeName)}</td>
        <td style="text-align:center;">${r.startStr}</td>
        <td style="text-align:center;">${r.endStr}</td>
        <td style="text-align:center;">${(r.rate * 100).toFixed(0)}%</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>호봉획정표</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 10pt; color:#000; }
  h1 { text-align:center; font-size:18pt; font-weight:bold; margin-bottom:3mm; letter-spacing:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:4mm; }
  th,td { border:1px solid #000; padding:4px 8px; font-size:9.5pt; }
  th { background:#e0e0e0; text-align:center; font-weight:bold; }
  .lbl { background:#f0f0f0; text-align:center; font-weight:bold; width:80px; }
  .big { font-size:22pt; font-weight:bold; text-align:center; }
  .note { font-size:8pt; color:#555; margin-top:5mm; text-align:center; }
</style></head><body>
<h1>호 봉 획 정 표</h1>
<table><tbody>
  <tr><td class="lbl">소 속</td><td>${esc(deptName||'')}</td><td class="lbl">성 명</td><td>${esc(teacherName||'')}</td></tr>
  <tr><td class="lbl">획정사유</td><td>${esc(reason)}</td><td class="lbl">획정일</td><td>${esc(hobongDate||'')}</td></tr>
  <tr><td class="lbl">자격증</td><td>${jag?`${jag[0]} (기산 ${jag[1]}호봉)`:''}</td>
      <td class="lbl">최종학력</td><td>${hak?`${hak[0]} (${hak[1]>=0?'+':''}${hak[1]}호봉)`:''}</td></tr>
</tbody></table>
<table>
  <thead><tr><th style="width:35%">경 력 내 용</th><th style="width:20%">경 력 유 형</th>
    <th style="width:15%">시 작 일</th><th style="width:15%">종 료 일</th><th style="width:15%">환 산 율</th></tr></thead>
  <tbody>${careerRows||'<tr><td colspan="5" style="text-align:center;color:#999">경력 없음</td></tr>'}</tbody>
</table>
<table><tbody>
  <tr><td class="lbl">실경력</td><td>${result.realPeriod}</td><td class="lbl">환산경력</td><td>${result.convertedPeriod}</td></tr>
  <tr><td class="lbl">기산호봉</td><td>${result.hobong.kisanHobong}호봉</td>
      <td class="lbl" rowspan="2">사 정 호 봉</td><td class="big" rowspan="2">${result.hobong.sabong}호봉</td></tr>
  <tr><td class="lbl">차기승급일</td><td>${result.nextPromo??'해당없음'}${result.hobong.atCap?' (40호봉 상한)':''}</td></tr>
  ${writer?`<tr><td class="lbl">작 성 자</td><td colspan="3">${esc(writer)}</td></tr>`:''}
</tbody></table>
<p class="note">※ 본 계산기는 참고용입니다. 정확한 호봉획정은 소속 교육청 담당자에게 문의하세요. (교육부 예규 제97호 기준)</p>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 300)
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">호봉획정 계산기</h1>
          <p className="page-subtitle">교육공무원 초임 호봉을 자동 계산합니다 · 교육부 예규 제97호 기준</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-1 justify-end">
          <button onClick={handleTemplateDownload} className="btn-ghost flex items-center gap-1.5 text-sm" title="빈 양식 엑셀 다운로드">
            <Download size={13} />양식 다운로드
          </button>
          <button onClick={handleExcelLoad} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Upload size={13} />불러오기
          </button>
          <button onClick={handleExcelSave} disabled={!result}
            className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            <FileSpreadsheet size={13} />엑셀 저장
          </button>
          <button onClick={handlePrint} disabled={!result}
            className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            <Printer size={13} />PDF 출력
          </button>
          <button onClick={() => setShowRefModal(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Table2 size={13} />참조표
          </button>
          <button onClick={() => setShowHelp(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <HelpCircle size={13} />도움말
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* 기본정보 */}
        <div className="card">
          <SectionHeader title="기본정보" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">소속</label>
              <input type="text" className="input" placeholder="예) 웅천고등학교" value={deptName} onChange={e => setDeptName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">성명</label>
              <input type="text" className="input" placeholder="홍길동" value={teacherName} onChange={e => setTeacherName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">획정사유</label>
              <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">작성자</label>
              <input type="text" className="input" placeholder="담당자명" value={writer} onChange={e => setWriter(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 자격 + 학력 */}
        <div className="card">
          <SectionHeader title="자격 및 학력" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">교원 자격증</label>
              <select
                className="input"
                value={jagyeokCode}
                onChange={e => setJagyeokCode(Number(e.target.value))}
              >
                {Object.entries(JAGYEOK).map(([code, [name, base]]) => (
                  <option key={code} value={code}>{name} (기산 {base}호봉)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">최종 학력</label>
              <select
                className="input"
                value={hakryeokCode}
                onChange={e => setHakryeokCode(Number(e.target.value))}
              >
                {Object.entries(HAKRYEOK).map(([code, [name, sup]]) => (
                  <option key={code} value={code}>
                    {name} ({sup >= 0 ? '+' : ''}{sup}호봉)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">호봉획정일</label>
              <input
                type="date"
                className="input"
                value={hobongDate}
                onChange={e => setHobongDateStr(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">차기승급일 계산에 사용합니다.</p>
            </div>
            <div>
              <label className="field-label">현호봉 (선택)</label>
              <input
                type="number"
                min={0}
                max={40}
                className="input"
                placeholder="0"
                value={currentHobong || ''}
                onChange={e => setCurrentHobong(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500 mt-1">엑셀 저장용 참고 정보입니다.</p>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={hobongCap}
                  onChange={e => setHobongCap(e.target.checked)}
                  className="w-4 h-4 rounded accent-violet-500"
                />
                <div>
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">40호봉 상한 적용</span>
                  <p className="text-xs text-slate-500">최고호봉 초과 시 40호봉으로 제한</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* 경력 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
            <SectionHeader title="경력 입력" noMargin />
            <button onClick={addRow} className="btn-ghost flex items-center gap-1.5 text-xs">
              <Plus size={13} />경력 추가
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <CareerRowInput
                key={row.id}
                row={row}
                idx={idx}
                onTypeChange={typeName => handleTypeChange(row.id, typeName)}
                onRateChange={rate => updateRow(row.id, { rate })}
                onStartChange={startStr => updateRow(row.id, { startStr })}
                onEndChange={endStr => updateRow(row.id, { endStr })}
                onContentChange={content => updateRow(row.id, { content })}
                onRemove={() => removeRow(row.id)}
                canRemove={rows.length > 1}
              />
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-300">
            <Info size={13} className="flex-shrink-0 mt-0.5" />
            <span>병역 경력은 최대 3년(1080일)까지만 인정됩니다. 초과분은 자동 차감됩니다.</span>
          </div>
        </div>

        {error && (
          <div className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={calculate} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Calculator size={15} />호봉 계산
          </button>
          <button onClick={reset} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={14} />초기화
          </button>
        </div>

        {/* 결과 */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="card border-violet-500/30"
            >
              <h3 className="font-semibold text-white mb-5">계산 결과</h3>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <ResultBox label="기산호봉" value={`${result.hobong.kisanHobong}호봉`} sub="자격+학령수" color="slate" />
                <ResultBox label="환산경력" value={result.convertedPeriod} sub={`실경력: ${result.realPeriod}`} color="sky" />
                <ResultBox label="사정호봉" value={`${result.hobong.sabong}호봉`} sub={result.hobong.atCap ? '40호봉 상한 적용' : undefined} color="violet" large />
                <ResultBox
                  label="차기 승급일"
                  value={result.nextPromo ?? '해당없음'}
                  sub={result.hobong.atCap ? '상한 도달' : `잔여 ${result.hobong.remainMonths}개월 ${result.hobong.remainDays}일`}
                  color="emerald"
                />
              </div>

              <div className="pt-4 border-t border-white/5 space-y-1.5 mb-5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-28">기산호봉 계산:</span>
                  <span className="text-slate-300">
                    {JAGYEOK[jagyeokCode]?.[1]}(자격) + {HAKRYEOK[hakryeokCode]?.[1] >= 0 ? '+' : ''}{HAKRYEOK[hakryeokCode]?.[1]}(학령) = {result.hobong.kisanHobong}호봉
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-28">사정호봉 계산:</span>
                  <span className="text-slate-300">
                    {result.hobong.kisanHobong}(기산) + {Math.floor(result.hobong.sabong - result.hobong.kisanHobong)}(경력환산 년) = {result.hobong.sabong}호봉
                  </span>
                </div>
              </div>

              {saveMsg && (
                <p className="text-xs text-emerald-400 mt-2 text-center">{saveMsg}</p>
              )}

              <p className="text-xs text-slate-600 mt-3">
                ※ 본 계산기는 참고용입니다. 정확한 호봉획정은 소속 교육청 담당자에게 문의하세요.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {showRefModal && <ReferenceModal onClose={() => setShowRefModal(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ─── 참조표 모달 ─────────────────────────────────────────────────────────────
function ReferenceModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'jagyeok' | 'hakryeok' | 'career'>('jagyeok')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-800 rounded-2xl border border-surface-600 w-[640px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600">
          <h3 className="font-semibold text-white">참조표</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="flex border-b border-surface-600">
          {([
            { id: 'jagyeok' as const, label: '자격코드' },
            { id: 'hakryeok' as const, label: '학력코드' },
            { id: 'career' as const, label: '경력유형·환산율' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors
                ${tab === t.id ? 'bg-violet-600/20 text-violet-300 border-b-2 border-violet-400' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'jagyeok' && (
            <div>
              <p className="text-xs text-slate-400 mb-3">※ 기산호봉 = 자격 기산호봉 + 학령수</p>
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-700">
                  <th className="px-3 py-2 text-left text-slate-300">코드</th>
                  <th className="px-3 py-2 text-left text-slate-300">자격명</th>
                  <th className="px-3 py-2 text-center text-slate-300">기산호봉</th>
                </tr></thead>
                <tbody>
                  {Object.entries(JAGYEOK).map(([code, [name, base]], i) => (
                    <tr key={code} className={i % 2 === 0 ? 'bg-surface-900/40' : ''}>
                      <td className="px-3 py-1.5 text-slate-400 text-center">{code}</td>
                      <td className="px-3 py-1.5 text-slate-200">{name}</td>
                      <td className="px-3 py-1.5 text-center text-violet-300">{base}호봉</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'hakryeok' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-700">
                <th className="px-3 py-2 text-left text-slate-300">코드</th>
                <th className="px-3 py-2 text-left text-slate-300">학력명</th>
                <th className="px-3 py-2 text-center text-slate-300">학령수</th>
              </tr></thead>
              <tbody>
                {Object.entries(HAKRYEOK).map(([code, [name, sup]], i) => (
                  <tr key={code} className={i % 2 === 0 ? 'bg-surface-900/40' : ''}>
                    <td className="px-3 py-1.5 text-slate-400 text-center">{code}</td>
                    <td className="px-3 py-1.5 text-slate-200">{name}</td>
                    <td className={`px-3 py-1.5 text-center font-medium ${sup > 0 ? 'text-emerald-400' : sup < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {sup >= 0 ? '+' : ''}{sup}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'career' && (
            <div>
              <p className="text-xs text-slate-400 mb-3">※ 환산율은 경력 입력 시 수동 수정 가능합니다.</p>
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-700">
                  <th className="px-3 py-2 text-left text-slate-300">경력유형</th>
                  <th className="px-3 py-2 text-center text-slate-300">기본환산율</th>
                  <th className="px-3 py-2 text-left text-slate-300">설명</th>
                </tr></thead>
                <tbody>
                  {CAREER_TYPES.map(([name, rate, desc], i) => (
                    <tr key={name} className={i % 2 === 0 ? 'bg-surface-900/40' : ''}>
                      <td className="px-3 py-1.5 text-slate-200 whitespace-nowrap">{name}</td>
                      <td className="px-3 py-1.5 text-center text-amber-300 font-medium">{(rate * 100).toFixed(0)}%</td>
                      <td className="px-3 py-1.5 text-slate-400 text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 도움말 모달 ─────────────────────────────────────────────────────────────
function HelpModal({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: '입력 순서',
      items: [
        "1. 기본정보 입력: 소속, 성명, 획정사유, 획정기준일(차기승급일 계산용)",
        "2. 자격 및 학력 선택: 교원자격증 종류, 최종학력 선택",
        "3. 경력 입력: [+ 경력 추가]로 행 추가 후 시작일·종료일·경력내용·유형 입력",
        "4. [호봉 계산] 버튼 클릭 → 결과 확인",
      ],
    },
    {
      title: '호봉 계산 원리',
      items: [
        "기산호봉 = 자격 기산호봉 + 학령수",
        "사정호봉 = 기산호봉 + 환산경력(년) [소수점 이하 버림]",
        "환산경력 = 각 경력기간 × 환산율의 합산 (병역은 최대 3년)",
        "40호봉 상한 적용 시 최고 40호봉으로 제한",
      ],
    },
    {
      title: '파일 기능',
      items: [
        "양식 다운로드: 빈 양식 엑셀 파일 다운로드 → 오프라인 작성 후 [불러오기]",
        "불러오기: 저장한 .xlsx 파일을 불러와 자동으로 폼 채움",
        "엑셀 저장: 계산 결과를 '출력용' + '데이터' 시트로 저장",
        "PDF 출력: 시스템 인쇄 대화상자를 열어 PDF로 저장 가능",
      ],
    },
    {
      title: '주의사항',
      items: [
        "병역 경력은 총 3년(1,080일)까지만 인정됩니다.",
        "시간제 기간제 교사는 환산율 0.88을 적용합니다.",
        "사립학교 미보고 기간은 환산율 0.5를 적용합니다.",
        "본 계산기는 참고용이며, 정확한 획정은 교육청에 문의하세요. (교육부 예규 제97호 기준)",
      ],
    },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-800 rounded-2xl border border-surface-600 w-[560px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600">
          <h3 className="font-semibold text-white">도움말</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {sections.map(s => (
            <div key={s.title}>
              <h4 className="text-sm font-semibold text-violet-300 mb-2">{s.title}</h4>
              <ul className="space-y-1">
                {s.items.map((item, i) => (
                  <li key={i} className="text-sm text-slate-300 leading-relaxed pl-2 border-l border-surface-600">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, noMargin }: { title: string; noMargin?: boolean }) {
  return (
    <h3 className={clsx('font-semibold text-white', !noMargin && 'mb-4 pb-3 border-b border-white/5')}>
      {title}
    </h3>
  )
}

function CareerRowInput({
  row, idx, onTypeChange, onRateChange, onStartChange, onEndChange, onContentChange, onRemove, canRemove,
}: {
  row: CareerRow
  idx: number
  onTypeChange: (v: string) => void
  onRateChange: (v: number) => void
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onContentChange: (v: string) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const found = CAREER_TYPES.find(([n]) => n === row.typeName)

  return (
    <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-5 text-center">{idx + 1}</span>
        <select
          className="input flex-1 text-sm"
          value={row.typeName}
          onChange={e => onTypeChange(e.target.value)}
        >
          {CAREER_TYPES.map(([name, rate, desc]) => (
            <option key={name} value={name}>{name}  |  {(rate * 100).toFixed(0)}%  |  {desc}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">환산율</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            className="input w-20 text-center text-sm"
            value={row.rate}
            onChange={e => onRateChange(Number(e.target.value))}
          />
        </div>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="btn-ghost p-1.5 text-red-400 hover:text-red-300 disabled:opacity-20"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {found && <p className="text-xs text-slate-500 pl-7">{found[2]}</p>}
      <div className="pl-7">
        <input
          type="text"
          className="input text-sm w-full"
          placeholder="경력 내용 (예: 웅천고 기간제교사)"
          value={row.content}
          onChange={e => onContentChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pl-7">
        <div className="flex items-center gap-1.5 flex-1">
          <label className="text-xs text-slate-500 whitespace-nowrap">시작일</label>
          <input type="date" className="input text-sm flex-1" value={row.startStr} onChange={e => onStartChange(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <label className="text-xs text-slate-500 whitespace-nowrap">종료일</label>
          <input type="date" className="input text-sm flex-1" value={row.endStr} onChange={e => onEndChange(e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function ResultBox({
  label, value, sub, color, large,
}: {
  label: string; value: string; sub?: string; color: string; large?: boolean
}) {
  const colorMap: Record<string, string> = {
    slate:   'bg-white/5 text-slate-200 border-white/10',
    sky:     'bg-sky-500/15 text-sky-200 border-sky-500/25',
    violet:  'bg-violet-500/20 text-violet-200 border-violet-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
  }
  return (
    <div className={clsx('rounded-xl border p-4', colorMap[color])}>
      <p className="text-xs opacity-60 mb-1">{label}</p>
      <p className={clsx('font-bold leading-tight', large ? 'text-3xl' : 'text-xl')}>{value}</p>
      {sub && <p className="text-xs opacity-50 mt-1">{sub}</p>}
    </div>
  )
}
