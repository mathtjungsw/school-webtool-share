// 입출력 — 교사 명단 가져오기, 결과 엑셀/한글 내보내기, 인쇄, 프로젝트 저장/불러오기
import * as XLSX from 'xlsx'
import type { ExamState, Teacher, Assignments } from './types'
import { genUnits, uid } from './defaults'

const yes = (v: unknown): boolean => ['O', 'o', 'Y', 'y', '예', '1', 'true', 'TRUE', 'v', 'V', '○'].includes(String(v ?? '').trim())
const wbBytes = (wb: XLSX.WorkBook): number[] => Array.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array)

export async function pickAndImportTeachers(): Promise<Teacher[]> {
  const path = await window.electron?.openFileDialog([{ name: '엑셀/CSV', extensions: ['xlsx', 'xls', 'csv'] }])
  if (!path || !window.electron) return []
  const bytes = await window.electron.readFile(path)
  const wb = XLSX.read(Uint8Array.from(bytes), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  return rows
    .map((r): Teacher | null => {
      const name = String(r['이름'] ?? r['성명'] ?? r['name'] ?? '').trim()
      if (!name) return null
      const rawCat = String(r['구분']).trim()
      const category = (['교사', '명예교사', '교육봉사자'] as const).includes(rawCat as never) ? rawCat as Teacher['category'] : '교사'
      const hasMainCol = '정감독' in r
      return {
        id: uid('t'), name, category,
        isMain: hasMainCol ? yes(r['정감독']) : category === '교사',
        isSub: '부감독' in r ? yes(r['부감독']) : true,
        isSpecial: '특별실' in r ? yes(r['특별실']) : true,
        isHallway: '복도' in r ? yes(r['복도']) : true,
        homeroom: String(r['담임'] ?? '').trim(),
        subjects: String(r['담당과목'] ?? r['과목'] ?? '').split(/[,、/]/).map((s) => s.trim()).filter(Boolean),
        avoidance: [], exclusions: [], absences: [], isAbsentAll: false,
        maxPeriods: r['최대시수'] !== '' && r['최대시수'] != null ? Number(r['최대시수']) : '',
        gender: String(r['성별'] ?? '').trim(),
      }
    })
    .filter((t): t is Teacher => t !== null)
}

export async function downloadTeacherTemplate(): Promise<void> {
  const data = [
    ['이름', '구분', '정감독', '부감독', '특별실', '복도', '담임', '담당과목', '최대시수', '성별'],
    ['홍길동', '교사', 'O', 'O', 'O', 'O', '1-3', '수학', '', '남'],
    ['김명예', '명예교사', '', 'O', 'O', 'O', '', '', '', '여'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '교사명단')
  return window.electron?.saveFileDialog('교사명단_양식.xlsx', wbBytes(wb))
}

interface ResultRow { unitId: string; room: string; type: string; main: string; sub: string; sub2: string; relaxed: boolean }
interface ResultTable { date: string; name: string; time: string; rows: ResultRow[] }

export function buildResultTables(state: ExamState, assignments: Assignments): ResultTable[] {
  const { periods, teachers, config } = state
  const tName = (id: string | null) => (id && teachers.find((t) => t.id === id)?.name) || ''
  const units = genUnits(config)
  const groups: Record<string, { date: string; name: string; time: string; periods: typeof periods }> = {}
  periods.forEach((p) => {
    const key = `${p.date}_${p.name}_${p.time || ''}`
    ;(groups[key] || (groups[key] = { date: p.date, name: p.name, time: p.time, periods: [] })).periods.push(p)
  })
  return Object.values(groups)
    .sort((a, b) => (a.date + a.name).localeCompare(b.date + b.name))
    .map((g) => {
      const rows: ResultRow[] = []
      units.forEach((u) => {
        g.periods.forEach((p) => {
          if (!(p.grade === '전체' || u.grade === '전체' || u.grade === p.grade)) return
          const cell = (assignments[p.id] || {})[u.id]
          if (!cell || (!cell.main && !cell.sub && !cell.sub2)) return
          if (rows.some((r) => r.unitId === u.id)) return
          rows.push({ unitId: u.id, room: u.fullLabel || u.label, type: u.type, main: tName(cell.main), sub: tName(cell.sub), sub2: tName(cell.sub2), relaxed: !!cell._relaxed })
        })
      })
      return { ...g, rows }
    })
    .filter((g) => g.rows.length > 0)
}

export async function exportResultExcel(state: ExamState, assignments: Assignments): Promise<void> {
  const tables = buildResultTables(state, assignments)
  const wb = XLSX.utils.book_new()
  tables.forEach((g) => {
    const aoa = [
      [`${g.date} ${g.name} (${g.time || ''})`],
      ['시험실', '정감독', '부감독', '제2부감독', '비고'],
      ...g.rows.map((r) => [r.room, r.main, r.sub, r.sub2, r.relaxed ? '완화배정' : '']),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const sheetName = `${g.date}_${g.name}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || '결과'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })
  return window.electron?.saveFileDialog(`${state.config.examName || '시험감독'}_배정결과.xlsx`, wbBytes(wb))
}

function printHtml(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open(); doc.write(html); doc.close()
  const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* noop */ } }, 500)
  ;(iframe.contentWindow as Window & { onafterprint?: () => void }).onafterprint = cleanup
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch { /* noop */ }
    cleanup()
  }, 300)
}

export function printResult(state: ExamState, assignments: Assignments): void {
  const tables = buildResultTables(state, assignments)
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
  <title>${state.config.examName || '시험감독 배정표'}</title>
  <style>
    body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;padding:24px;color:#111}
    h2{font-size:16pt;margin:24px 0 8px}
    table{border-collapse:collapse;width:100%;margin-bottom:18px}
    th,td{border:1px solid #555;padding:6px 8px;font-size:10pt;text-align:center}
    th{background:#eef}
    .relaxed{color:#c026d3;font-weight:700}
    @media print{button{display:none}}
  </style></head><body>
  <h1 style="font-size:18pt">${state.config.examName || '시험감독 배정표'}</h1>
  ${tables.map((g) => `<h2>${g.date} · ${g.name} ${g.time ? '(' + g.time + ')' : ''}</h2>
    <table><thead><tr><th>시험실</th><th>정감독</th><th>부감독</th><th>제2부감독</th></tr></thead>
    <tbody>${g.rows.map((r) => `<tr class="${r.relaxed ? 'relaxed' : ''}"><td>${r.room}</td><td>${r.main}</td><td>${r.sub || ''}</td><td>${r.sub2 || ''}</td></tr>`).join('')}</tbody></table>`).join('')}
  </body></html>`
  printHtml(html)
}

export async function saveProject(state: ExamState): Promise<void> {
  const bytes = Array.from(new TextEncoder().encode(JSON.stringify(state, null, 2)))
  return window.electron?.saveFileDialog(`${state.config.examName || '시험감독'}_프로젝트.json`, bytes)
}

export async function pickAndLoadProject(): Promise<ExamState | null> {
  const path = await window.electron?.openFileDialog([{ name: '시험감독 프로젝트', extensions: ['json'] }])
  if (!path || !window.electron) return null
  const bytes = await window.electron.readFile(path)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as ExamState
}

interface ClassGridResult {
  cols: { key: string; date: string; periodName: string; time: string }[]
  units: ReturnType<typeof genUnits>
  cells: Record<string, Record<string, { periodId: string; mainId: string; main: string; subId: string; sub: string; sub2Id: string; sub2: string; subject: string; _relaxed: boolean }>>
  periodMap: Record<string, Record<string, string>>
}

export function buildClassGrid(state: ExamState, assignments: Assignments): ClassGridResult {
  const { periods = [], teachers, config } = state
  const tName = (id: string | null) => (id && teachers.find((t) => t.id === id)?.name) || ''
  const units = genUnits(config)
  const seenCols = new Set<string>()
  const cols: ClassGridResult['cols'] = []
  for (const p of periods) {
    const key = `${p.date}|${p.name}`
    if (!seenCols.has(key)) { seenCols.add(key); cols.push({ key, date: p.date, periodName: p.name, time: p.time }) }
  }
  const periodMap: Record<string, Record<string, string>> = {}
  for (const u of units) {
    periodMap[u.id] = {}
    for (const col of cols) {
      const p = periods.find((pd) => pd.date === col.date && pd.name === col.periodName && (u.grade === '전체' || pd.grade === u.grade))
      if (p) periodMap[u.id][col.key] = p.id
    }
  }
  const cells: ClassGridResult['cells'] = {}
  for (const u of units) {
    cells[u.id] = {}
    for (const [colKey, pid] of Object.entries(periodMap[u.id])) {
      const cell = (assignments[pid] || {})[u.id]; if (!cell) continue
      const subject = (state.classSubjects?.[pid] || {})[u.id] || ''
      cells[u.id][colKey] = { periodId: pid, mainId: cell.main || '', main: tName(cell.main), subId: cell.sub || '', sub: tName(cell.sub), sub2Id: cell.sub2 || '', sub2: tName(cell.sub2), subject, _relaxed: !!cell._relaxed }
    }
  }
  return { cols, units, cells, periodMap }
}

interface TeacherGridResult {
  cols: { key: string; date: string; periodName: string }[]
  teachers: Teacher[]
  tcells: Record<string, Record<string, { room: string; role: string; _relaxed: boolean }>>
}

export function buildTeacherGrid(state: ExamState, assignments: Assignments): TeacherGridResult {
  const { periods = [], teachers, config } = state
  const units = genUnits(config)
  const unitMap = Object.fromEntries(units.map((u) => [u.id, u]))
  const seenCols = new Set<string>()
  const cols: TeacherGridResult['cols'] = []
  for (const p of periods) {
    const key = `${p.date}|${p.name}`
    if (!seenCols.has(key)) { seenCols.add(key); cols.push({ key, date: p.date, periodName: p.name }) }
  }
  const tcells: TeacherGridResult['tcells'] = {}
  for (const t of teachers) tcells[t.id] = {}
  for (const p of periods) {
    const colKey = `${p.date}|${p.name}`
    for (const [unitId, cell] of Object.entries(assignments[p.id] || {})) {
      const u = unitMap[unitId]; if (!u) continue
      const room = u.fullLabel || u.label
      ;(['main', 'sub', 'sub2'] as const).forEach((k, i) => {
        const label = ['정', '부', '2부'][i]
        const tId = cell[k]; if (!tId || !tcells[tId]) return
        if (!tcells[tId][colKey]) tcells[tId][colKey] = { room, role: label, _relaxed: !!cell._relaxed }
        else tcells[tId][colKey].room += `·${room}`
      })
    }
  }
  return { cols, teachers, tcells }
}

function hwpBytes(title: string, bodyHtml: string): number[] {
  const html = `﻿<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;padding:20px;color:#111}
h1{font-size:16pt;margin-bottom:12px}
table{border-collapse:collapse;width:100%;margin-bottom:14px}
th,td{border:1px solid #555;padding:4px 8px;font-size:9pt;text-align:center;word-break:break-all}
th{background:#dde}.relaxed{background:#f5d0fe}
</style></head><body><h1>${title}</h1>${bodyHtml}</body></html>`
  return Array.from(new TextEncoder().encode(html))
}

export async function exportClassHwp(state: ExamState, assignments: Assignments, gradeFilter = '전체'): Promise<void> {
  const { cols, units, cells } = buildClassGrid(state, assignments)
  const filtered = units.filter((u) => {
    if (gradeFilter === '전체') return true
    const g = gradeFilter.replace('학년', '')
    return u.grade === g || u.grade === '전체'
  })
  const rows = filtered.map((u) => {
    const tds = cols.map((c) => {
      const cell = cells[u.id]?.[c.key]; if (!cell) return '<td>-</td>'
      const names = [cell.main, cell.sub, cell.sub2].filter(Boolean).join('/')
      return `<td${cell._relaxed ? ' class="relaxed"' : ''}>${names || '-'}</td>`
    })
    return `<tr><td><strong>${u.fullLabel || u.label}</strong></td>${tds.join('')}</tr>`
  })
  const html = `<table><thead><tr><th>시험실</th>${cols.map((c) => `<th>${c.date.slice(5)}<br/>${c.periodName}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  const title = `${state.config.examName || '시험감독'}_학급별시간표`
  return window.electron?.saveFileDialog(title + '.hwp', hwpBytes(title, html))
}

export async function exportTeacherHwp(state: ExamState, assignments: Assignments): Promise<void> {
  const { cols, teachers, tcells } = buildTeacherGrid(state, assignments)
  const rows = teachers.map((t) => {
    const tds = cols.map((c) => { const cell = tcells[t.id]?.[c.key]; return cell ? `<td>${cell.room}<br/>(${cell.role}감독)</td>` : '<td></td>' })
    return `<tr><td><strong>${t.name}</strong></td>${tds.join('')}</tr>`
  })
  const html = `<table><thead><tr><th>성명</th>${cols.map((c) => `<th>${c.date.slice(5)}<br/>${c.periodName}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
  const title = `${state.config.examName || '시험감독'}_교사별시간표`
  return window.electron?.saveFileDialog(title + '.hwp', hwpBytes(title, html))
}

export async function exportTeacherExcel(state: ExamState, assignments: Assignments): Promise<void> {
  const { cols, teachers, tcells } = buildTeacherGrid(state, assignments)
  const header = ['성명', ...cols.map((c) => `${c.date} ${c.periodName}`)]
  const rows = teachers.map((t) => [t.name, ...cols.map((c) => { const cell = tcells[t.id]?.[c.key]; return cell ? `${cell.room}(${cell.role})` : '' })])
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '교사별시간표')
  return window.electron?.saveFileDialog(`${state.config.examName || '시험감독'}_교사별시간표.xlsx`, wbBytes(wb))
}

export async function exportClassExcel(state: ExamState, assignments: Assignments, gradeFilter = '전체'): Promise<void> {
  const { cols, units, cells } = buildClassGrid(state, assignments)
  const filtered = units.filter((u) => {
    if (gradeFilter === '전체') return true
    const g = gradeFilter.replace('학년', '')
    return u.grade === g || u.grade === '전체'
  })
  const header = ['시험실', ...cols.map((c) => `${c.date} ${c.periodName}`)]
  const rows = filtered.map((u) => [u.fullLabel || u.label, ...cols.map((c) => { const cell = cells[u.id]?.[c.key]; return cell ? [cell.main, cell.sub, cell.sub2].filter(Boolean).join('/') : '' })])
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '학급별시간표')
  return window.electron?.saveFileDialog(`${state.config.examName || '시험감독'}_학급별시간표.xlsx`, wbBytes(wb))
}
