import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Download } from 'lucide-react'
import { attendanceRequest } from './connection'

type ExportRow = { date: string; number: number; name: string; values: string[] }

export function shiftAttendanceDate(date: string, days: number) {
  const time = Date.parse(date + 'T00:00:00Z')
  return new Date(time + days * 86400000).toISOString().slice(0, 10)
}

export async function attendanceWorkbook(classLabel: string, rows: ExportRow[]) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const headers = ['날짜', '학급', '번호', '이름', ...Array.from({ length: 7 }, (_, index) => `${index + 1}교시 담임 출결`)]
  const data = [
    headers.map(value => ({ value, align: 'center' as const, fontWeight: 'bold' as const, backgroundColor: '#EAF2EC', textColor: '#245644' })),
    ...rows.map(row => [
      { value: new Date(row.date + 'T00:00:00Z'), align: 'center' as const },
      { value: classLabel, align: 'center' as const },
      { value: row.number, align: 'center' as const },
      { value: row.name, type: String },
      ...row.values.map(value => value ? { value: value === '미확인' ? '미입력' : value, align: 'center' as const } : null),
    ]),
  ]
  return writeExcelFile(data, {
    sheet: '학급 출결', dateFormat: 'yyyy-mm-dd', stickyRowsCount: 1,
    columns: [14, 14, 7, 14, ...Array(7).fill(20)].map(width => ({ width })),
  }).toBlob()
}

export function AttendanceExport({ token, classId, classLabel, selectedDate, today, earliestDate }: {
  token: string; classId: string; classLabel: string; selectedDate: string; today: string; earliestDate: string
}) {
  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState(selectedDate)
  const [toDate, setToDate] = useState(selectedDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current || !fromDate || !toDate || fromDate > toDate || fromDate < earliestDate || toDate > today) return
    const controller = new AbortController()
    request.current = controller
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const rows: ExportRow[] = []
      // Keep each request bounded while allowing longer periods in one file.
      for (let start = fromDate; start <= toDate;) {
        const limit = shiftAttendanceDate(start, 30)
        const end = limit < toDate ? limit : toDate
        const query = new URLSearchParams({ group: classId, fromDate: start, toDate: end })
        const result = await attendanceRequest<{ rows: ExportRow[] }>(token, `export?${query}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        rows.push(...result.rows)
        if (end !== toDate) setStatus(`${end}까지의 출결을 불러왔습니다.`)
        start = shiftAttendanceDate(end, 1)
      }
      if (!rows.length) {
        setStatus('선택한 기간에 저장된 담임 출결이 없습니다.')
        return
      }
      const workbook = await attendanceWorkbook(classLabel, rows)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(workbook)
      const link = document.createElement('a')
      link.href = url
      link.download = `학급출결_${classId}_${fromDate}_${toDate}.xlsx`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setStatus(`출결 ${rows.length}건의 내려받기를 시작했습니다.`)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus('')
        setError(cause instanceof Error ? cause.message : '출결을 내려받지 못했습니다.')
      }
    } finally {
      request.current = null
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return <section className="lab-export">
    <button type="button" className="lab-refresh" aria-expanded={open} aria-controls="lab-export-form" onClick={() => {
      if (!open && !fromDate) { setFromDate(selectedDate); setToDate(selectedDate) }
      setOpen(!open)
    }}>
      <Download size={15} aria-hidden="true" /> 출결 내려받기
    </button>
    {open && <form id="lab-export-form" onSubmit={event => void download(event)}>
      <p>{classLabel}의 날짜별 담임 출결을 엑셀로 저장합니다. 기록이 있는 학생만 포함됩니다.</p>
      <div className="lab-export-fields">
        <label>시작일<input type="date" value={fromDate} min={earliestDate} max={toDate || today} onChange={event => setFromDate(event.target.value)} disabled={saving} required /></label>
        <label>종료일<input type="date" value={toDate} min={fromDate || earliestDate} max={today} onChange={event => setToDate(event.target.value)} disabled={saving} required /></label>
        <button className="lab-bulk-present" disabled={saving || !fromDate || !toDate || fromDate > toDate} type="submit">{saving ? '불러오는 중…' : '엑셀 내려받기'}</button>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p className="lab-notice" role="alert">{error}</p>}
    </form>}
  </section>
}
