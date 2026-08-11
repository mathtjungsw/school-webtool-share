export interface ParsedCell {
  col: number
  colspan: number
  rowspan: number
  text: string
}

export interface ParsedRow {
  cells: ParsedCell[]
}

function decodeHtmlText(value: string) {
  const withBreaks = value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return withBreaks
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function numericAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\b${name}=["']?(\\d+)`, 'i'))
  return match ? Math.max(1, Number(match[1])) : 1
}

export function parseHtmlRows(html: string): ParsedRow[] {
  const rawRows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []
  const occupied = new Map<number, Set<number>>()

  return rawRows.map((rawRow, rowIndex) => {
    const cells: ParsedCell[] = []
    const cellPattern = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi
    let match: RegExpExecArray | null
    let col = 0
    const blocked = occupied.get(rowIndex) ?? new Set<number>()

    while ((match = cellPattern.exec(rawRow))) {
      while (blocked.has(col)) col += 1
      const colspan = numericAttribute(match[1], 'colspan')
      const rowspan = numericAttribute(match[1], 'rowspan')
      cells.push({ col, colspan, rowspan, text: decodeHtmlText(match[2]) })

      if (rowspan > 1) {
        for (let futureRow = rowIndex + 1; futureRow < rowIndex + rowspan; futureRow += 1) {
          const futureBlocked = occupied.get(futureRow) ?? new Set<number>()
          for (let offset = 0; offset < colspan; offset += 1) futureBlocked.add(col + offset)
          occupied.set(futureRow, futureBlocked)
        }
      }
      col += colspan
    }
    return { cells }
  })
}
