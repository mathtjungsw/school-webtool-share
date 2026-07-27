// 숨김 iframe 인쇄 — 앱 전체 창 인쇄(window.print/window.open) 방지용 공용 유틸.
// 패턴 출처: src/services/assessmentPlan.ts printDoc()

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#111;line-height:1.5;}
.sheet{background:#fff;color:#111;width:210mm;padding:18mm 16mm;}
@page{size:A4;margin:0;}
`

/** body HTML 문자열을 숨김 iframe 에서 인쇄한다. extraCss 로 페이지별 스타일 추가 가능. */
export function printHtml(bodyHtml: string, extraCss = ''): void {
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${BASE_CSS}${extraCss}</style></head><body>${bodyHtml}</body></html>`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
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

/** HTML 특수문자 이스케이프 (인쇄 본문에 사용자/AI 텍스트를 넣을 때). */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
