import { parseHtmlRows } from './html-table'

export type DutyScheduleKind = 'gate' | 'meal'

export interface DutyScheduleSource {
  kind: DutyScheduleKind
  spreadsheetId: string
  gid: string
  sheetName: string
  title: string
  time: string
  location: string
}

export interface DutyScheduleEvent {
  date: string
  kind: DutyScheduleKind
  title: string
  time: string
  location: string
  sourceSheet: string
  sourceUrl: string
}

function formatYmd(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')
}

function resolveDate(year: number, month: number, dateMonth: number, day: number) {
  const target = Date.UTC(year, month - 1, 15)
  return [year - 1, year, year + 1]
    .map(candidateYear => new Date(Date.UTC(candidateYear, dateMonth - 1, day)))
    .sort((a, b) => Math.abs(a.getTime() - target) - Math.abs(b.getTime() - target))[0]
}

function extractDate(text: string, year: number, month: number) {
  const match = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (!match) return null
  const dateMonth = Number(match[1])
  const day = Number(match[2])
  if (dateMonth < 1 || dateMonth > 12 || day < 1 || day > 31) return null
  const date = resolveDate(year, month, dateMonth, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function containsTeacher(text: string, teacherName: string) {
  return text
    .split(/[,，·/\s]+/)
    .map(value => value.trim())
    .filter(Boolean)
    .includes(teacherName)
}

export function parseDutySheet(
  html: string,
  source: DutyScheduleSource,
  year: number,
  month: number,
  teacherName: string,
): DutyScheduleEvent[] {
  const rows = parseHtmlRows(html)
  const events: DutyScheduleEvent[] = []
  const monthPrefix = `${year}${String(month).padStart(2, '0')}`

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const dateCells = rows[rowIndex].cells
      .map(cell => ({ cell, date: extractDate(cell.text, year, month) }))
      .filter((item): item is { cell: (typeof rows)[number]['cells'][number]; date: Date } => Boolean(item.date))
    if (dateCells.length === 0) continue

    let blockEnd = rowIndex + 1
    while (blockEnd < rows.length && !rows[blockEnd].cells.some(cell => extractDate(cell.text, year, month))) {
      blockEnd += 1
    }

    for (const { cell: dateCell, date } of dateCells) {
      const dateYmd = formatYmd(date)
      if (!dateYmd.startsWith(monthPrefix)) continue
      for (const row of rows.slice(rowIndex + 1, blockEnd)) {
        const assignment = row.cells.find(cell =>
          cell.col <= dateCell.col &&
          dateCell.col < cell.col + cell.colspan &&
          containsTeacher(cell.text, teacherName),
        )
        if (!assignment) continue

        const gateLocation = row.cells
          .map(cell => cell.text.trim())
          .find(value => value === '정문' || value === '후문')
        const location = source.kind === 'gate' ? (gateLocation ?? source.location) : source.location
        events.push({
          date: dateYmd,
          kind: source.kind,
          title: source.kind === 'gate' ? `${source.title} · ${location}` : source.title,
          time: source.time,
          location,
          sourceSheet: source.sheetName,
          sourceUrl: `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit?gid=${source.gid}#gid=${source.gid}`,
        })
      }
    }
  }

  return events.filter((event, index, all) =>
    all.findIndex(item => item.date === event.date && item.kind === event.kind && item.location === event.location) === index,
  )
}
