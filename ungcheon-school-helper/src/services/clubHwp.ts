import type { Club, ClubStudent, ClubStore } from '../types/club'

// HWP(한글)·인쇄용 HTML 생성
// 참고앱과 동일하게 한글에서 열리는 HTML 문서를 만들어 .hwp 로 저장한다.

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PRINT_CSS = `body{font-family:'바탕',serif;font-size:10pt;margin:0;}
h1{font-size:14pt;text-align:center;margin:12px 0 4px;}
p.sub{font-size:9pt;text-align:center;color:#444;margin:0 0 8px;}
table{border-collapse:collapse;width:100%;margin-bottom:4px;}
th,td{border:1px solid #000;padding:3px 6px;text-align:center;}
th{background:#d8d8d8;font-weight:bold;}
td.name{text-align:left;}
.pb{page-break-after:always;}
@page{margin:15mm;}`

const studentOrder = (a: ClubStudent, b: ClubStudent) =>
  a.grade - b.grade || Number(a.classNum) - Number(b.classNum) || a.number - b.number

export type PrintMode = 'byClub' | 'byClass'

/** 배정 결과를 인쇄/한글용 HTML 문서 문자열로 만든다. */
export function buildResultHtml(store: ClubStore, mode: PrintMode): string {
  const students = store.students.filter(s => s.name !== '__placeholder__')
  let body = ''

  if (mode === 'byClub') {
    store.clubs.forEach((club, ci) => {
      const members = students
        .filter(s => s.assignedClub === club.id)
        .sort(studentOrder)
      body += `<h1>${esc(club.name)}</h1>
<p class="sub">지도교사: ${esc(club.instructor || '-')} &nbsp;|&nbsp; 정원: ${club.capacity}명 &nbsp;|&nbsp; 배정: ${members.length}명</p>
<table><tr><th>연번</th><th>학년</th><th>반</th><th>번호</th><th class="name">이름</th><th>비고</th></tr>
${members.map((s, i) => `<tr><td>${i + 1}</td><td>${s.grade}</td><td>${esc(s.classNum)}</td><td>${s.number}</td><td class="name">${esc(s.name)}</td><td>${s.isExtra ? '추가' : ''}</td></tr>`).join('')}
</table>${ci < store.clubs.length - 1 ? '<div class="pb"></div>' : ''}`
    })
  } else {
    // 학급별
    let first = true
    const grades = [...new Set(students.map(s => s.grade))].sort((a, b) => a - b)
    for (const g of grades) {
      const classes = [...new Set(students.filter(s => s.grade === g).map(s => s.classNum))]
        .sort((a, b) => Number(a) - Number(b))
      for (const cls of classes) {
        const members = students
          .filter(s => s.grade === g && s.classNum === cls)
          .sort((a, b) => a.number - b.number)
        if (!members.length) continue
        if (!first) body += '<div class="pb"></div>'
        first = false
        body += `<h1>${g}학년 ${esc(cls)}반 동아리 배정표</h1>
<table><tr><th>번호</th><th class="name">이름</th><th>배정 동아리</th><th>지도교사</th><th>비고</th></tr>
${members.map(s => {
          const club = store.clubs.find(c => c.id === s.assignedClub)
          return `<tr><td>${s.number}</td><td class="name">${esc(s.name)}</td><td>${esc(club?.name || '미배정')}</td><td>${esc(club?.instructor || '')}</td><td>${s.isExtra ? '추가' : ''}</td></tr>`
        }).join('')}</table>`
      }
    }
  }

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${PRINT_CSS}</style></head><body>${body}</body></html>`
}

/** HWP 저장용 바이트 배열(BOM 포함 UTF-8 HTML). */
export function buildHwpBytes(store: ClubStore, mode: PrintMode): number[] {
  const html = '﻿' + buildResultHtml(store, mode)
  const bytes = new TextEncoder().encode(html)
  return Array.from(bytes)
}

/** 숨겨진 iframe 으로 인쇄 대화상자를 띄운다(Electron 렌더러에서 동작). */
export function printResult(store: ClubStore, mode: PrintMode): void {
  const html = buildResultHtml(store, mode)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = () => {
    setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* noop */ } }, 500)
  }
  iframe.contentWindow!.onafterprint = cleanup
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch { /* noop */ }
    cleanup()
  }, 300)
}
