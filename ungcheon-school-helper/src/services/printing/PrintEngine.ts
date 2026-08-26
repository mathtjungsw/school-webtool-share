export type PrintOrientation = 'portrait' | 'landscape'
export type PrintPageMode = 'single-page' | 'multi-page'

export interface PrintDocumentOptions {
  title: string
  bodyHtml: string
  styles?: string
  orientation?: PrintOrientation
  pageMode?: PrintPageMode
  lang?: string
}

export interface PrintPreviewHandle {
  close: () => void
  print: () => void
}

export interface PrintPreflightResult {
  fitsSinglePage: boolean
  horizontalOverflow: boolean
  verticalOverflow: boolean
  estimatedPages: number
  scaleToFit: number
  messages: string[]
  suggestions: string[]
}

const BLOCKED_ELEMENTS = new Set([
  'script', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'link', 'meta', 'base', 'audio', 'video', 'canvas', 'svg', 'math',
])

const URL_ATTRIBUTES = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href'])

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{min-height:100%;background:#fff;color:#111;}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.sheet{background:#fff;color:#111;width:210mm;padding:18mm 16mm;}
.print-engine-root[data-page-mode='single-page']{width:210mm;height:297mm;overflow:hidden;}
.print-engine-root[data-page-mode='multi-page']{width:210mm;min-height:297mm;}
`

/** 사용자 입력을 HTML 본문에 넣을 때 사용하는 공용 이스케이프 함수입니다. */
export function escapePrintHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeInlineStyle(value: string): string {
  if (/(?:url\s*\(|expression\s*\(|@import|javascript\s*:|behavior\s*:|-moz-binding)/i.test(value)) return ''
  return value
}

/**
 * 인쇄 HTML에서 실행 가능한 요소·속성을 제거합니다.
 * 본문의 사용자 값은 escapePrintHtml로 먼저 이스케이프하는 것이 기본이며,
 * 이 함수는 누락에 대비한 마지막 방어선입니다.
 */
export function sanitizePrintHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*\/?>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(?:href|src|srcset|action|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  }

  const parsed = new DOMParser().parseFromString(`<div id="print-engine-sanitizer">${html}</div>`, 'text/html')
  const root = parsed.getElementById('print-engine-sanitizer')
  if (!root) return ''

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (BLOCKED_ELEMENTS.has(element.tagName.toLowerCase())) {
      element.remove()
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || URL_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'style') {
        const style = safeInlineStyle(attribute.value)
        if (style) element.setAttribute('style', style)
        else element.removeAttribute('style')
      }
    }
  }
  return root.innerHTML
}

function sanitizeStyles(styles: string): string {
  return safeInlineStyle(styles).replace(/<\/?style\b[^>]*>/gi, '')
}

export function buildPrintDocument(options: PrintDocumentOptions): string {
  const orientation = options.orientation ?? 'portrait'
  const pageMode = options.pageMode ?? 'multi-page'
  const pageWidth = orientation === 'portrait' ? '210mm' : '297mm'
  const pageHeight = orientation === 'portrait' ? '297mm' : '210mm'
  const pageCss = `
@page{size:A4 ${orientation};margin:0;}
.print-engine-root[data-page-mode='single-page']{width:${pageWidth};height:${pageHeight};}
.print-engine-root[data-page-mode='multi-page']{width:${pageWidth};min-height:${pageHeight};}
`
  return `<!DOCTYPE html><html lang="${escapePrintHtml(options.lang ?? 'ko')}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapePrintHtml(options.title)}</title><style>${BASE_CSS}${pageCss}${sanitizeStyles(options.styles ?? '')}</style></head><body><main class="print-engine-root" data-page-mode="${pageMode}">${sanitizePrintHtml(options.bodyHtml)}</main></body></html>`
}

async function waitUntilReady(frame: HTMLIFrameElement): Promise<void> {
  const frameDocument = frame.contentDocument
  if (!frameDocument) return
  const images = Array.from(frameDocument.images)
  const imageReady = Promise.all(images.map(image => image.complete
    ? Promise.resolve()
    : new Promise<void>(resolve => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })))
  const fontReady = frameDocument.fonts?.ready?.then(() => undefined).catch(() => undefined) ?? Promise.resolve()
  await Promise.race([
    Promise.all([imageReady, fontReady]),
    new Promise<void>(resolve => window.setTimeout(resolve, 1_500)),
  ])
}

export function calculatePrintPreflight(
  contentWidth: number,
  contentHeight: number,
  pageWidth: number,
  pageHeight: number,
): PrintPreflightResult {
  const safePageWidth = Math.max(1, pageWidth)
  const safePageHeight = Math.max(1, pageHeight)
  const horizontalOverflow = contentWidth > safePageWidth + 2
  const verticalOverflow = contentHeight > safePageHeight + 2
  const estimatedPages = Math.max(1, Math.ceil(contentHeight / safePageHeight))
  const scaleToFit = Math.max(0.55, Math.min(1, safePageWidth / Math.max(contentWidth, 1), safePageHeight / Math.max(contentHeight, 1)))
  const messages: string[] = []
  const suggestions: string[] = []
  if (horizontalOverflow) {
    messages.push('오른쪽 열이나 표가 A4 경계 밖으로 잘릴 수 있습니다.')
    suggestions.push('가로 방향 전환 또는 표 너비 자동 맞춤')
  }
  if (verticalOverflow) {
    messages.push(`내용이 약 ${estimatedPages}페이지 높이입니다.`)
    suggestions.push('여백·행 높이·글자 크기 단계 조정')
  }
  return {
    fitsSinglePage: !horizontalOverflow && !verticalOverflow,
    horizontalOverflow, verticalOverflow, estimatedPages, scaleToFit,
    messages, suggestions: [...new Set(suggestions)],
  }
}

function inspectFrame(frame: HTMLIFrameElement): PrintPreflightResult {
  const frameDocument = frame.contentDocument
  const root = frameDocument?.querySelector<HTMLElement>('.print-engine-root')
  if (!root) return calculatePrintPreflight(1, 1, 1, 1)
  return calculatePrintPreflight(root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight)
}

function showPreflightDialog(
  title: string,
  result: PrintPreflightResult,
  allowAutoFit: boolean,
): Promise<'fit' | 'print' | 'cancel'> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'A4 한 장 출력 사전검사')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:12000;display:grid;place-items:center;background:rgba(15,23,42,.68);padding:20px;'
    const dialog = document.createElement('section')
    dialog.style.cssText = 'width:min(520px,100%);border:1px solid #f59e0b;border-radius:18px;background:#fff;color:#0f172a;box-shadow:0 24px 70px rgba(15,23,42,.28);padding:22px;font-family:Malgun Gothic,sans-serif;'
    const messages = result.messages.map(message => `<li style="margin-top:7px">${escapePrintHtml(message)}</li>`).join('')
    const suggestions = result.suggestions.map(message => `<li style="margin-top:5px">${escapePrintHtml(message)}</li>`).join('')
    dialog.innerHTML = `<div style="font-size:12px;font-weight:800;color:#92400e">A4 한 장 출력 사전검사</div><h2 style="margin:4px 0 0;font-size:19px">${escapePrintHtml(title)}</h2><p style="margin:12px 0 0;font-size:13px;font-weight:700;color:#475569">인쇄 전에 잘림 가능성을 발견했습니다.</p><ul style="margin:10px 0 0 18px;font-size:13px;font-weight:700;color:#9f1239">${messages}</ul>${suggestions ? `<div style="margin-top:14px;border-radius:11px;background:#fffbeb;padding:11px"><b style="font-size:12px">권장 보정</b><ul style="margin:5px 0 0 18px;font-size:12px;color:#475569">${suggestions}</ul></div>` : ''}<p style="margin-top:12px;font-size:11px;color:#64748b">자동 맞춤은 내용을 삭제하지 않고 전체 문서를 축소합니다. 축소 후 글자가 너무 작으면 취소하고 원본 화면에서 내용을 조정하세요.</p>`
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:18px;'
    const finish = (choice: 'fit' | 'print' | 'cancel') => { overlay.remove(); resolve(choice) }
    const cancel = document.createElement('button'); cancel.textContent = '취소'; cancel.style.cssText = 'border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 12px;font-weight:800;cursor:pointer;'; cancel.onclick = () => finish('cancel')
    const print = document.createElement('button'); print.textContent = '그대로 인쇄'; print.style.cssText = 'border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;padding:8px 12px;font-weight:800;cursor:pointer;'; print.onclick = () => finish('print')
    actions.append(cancel, print)
    if (allowAutoFit) {
      const fit = document.createElement('button'); fit.textContent = '한 장 자동 맞춤'; fit.style.cssText = 'border:0;border-radius:9px;background:#d9ba00;color:#17212b;padding:8px 12px;font-weight:900;cursor:pointer;'; fit.onclick = () => finish('fit'); actions.append(fit)
    }
    dialog.append(actions); overlay.append(dialog); document.body.appendChild(overlay); cancel.focus()
  })
}

function writeFrame(frame: HTMLIFrameElement, html: string): boolean {
  const frameDocument = frame.contentDocument
  if (!frameDocument) return false
  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()
  return true
}

/** 숨김 iframe에서 앱 화면과 분리된 문서만 인쇄합니다. */
export function printDocument(options: PrintDocumentOptions): void {
  const frame = document.createElement('iframe')
  frame.title = `${options.title} 인쇄 문서`
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(frame)
  if (!writeFrame(frame, buildPrintDocument(options))) {
    frame.remove()
    throw new Error('인쇄 문서를 준비하지 못했습니다.')
  }

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    window.setTimeout(() => frame.remove(), 500)
  }
  if (frame.contentWindow) frame.contentWindow.onafterprint = cleanup

  void waitUntilReady(frame).then(async () => {
    const result = inspectFrame(frame)
    const singlePage = (options.pageMode ?? 'multi-page') === 'single-page'
    if (result.horizontalOverflow || (singlePage && result.verticalOverflow)) {
      const choice = await showPreflightDialog(options.title, result, singlePage)
      if (choice === 'cancel') { cleanup(); return }
      if (choice === 'fit') {
        const fitted: PrintDocumentOptions = {
          ...options,
          styles: `${options.styles ?? ''}\n@media print{.print-engine-root{transform:scale(${result.scaleToFit.toFixed(4)});transform-origin:top left;}}`,
        }
        if (!writeFrame(frame, buildPrintDocument(fitted))) { cleanup(); return }
        await waitUntilReady(frame)
      }
    }
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } finally {
      window.setTimeout(cleanup, 5_000)
    }
  }).catch(cleanup)
}

/**
 * 동일한 안전 문서를 큰 미리보기 대화상자로 열고 인쇄할 수 있게 합니다.
 * 호출자는 반환된 handle.close()로도 닫을 수 있습니다.
 */
export function openPrintPreview(options: PrintDocumentOptions): PrintPreviewHandle {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', `${options.title} 인쇄 미리보기`)
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;background:rgba(15,23,42,.82);padding:16px;'

  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:14px 14px 0 0;background:#fff;padding:10px 14px;color:#0f172a;font:700 14px Malgun Gothic,sans-serif;'
  const label = document.createElement('strong')
  label.textContent = options.title
  const preflightBadge = document.createElement('span')
  preflightBadge.textContent = 'A4 검사 중…'
  preflightBadge.style.cssText = 'margin-left:10px;border-radius:999px;background:#f1f5f9;color:#475569;padding:4px 8px;font-size:11px;font-weight:800;'
  const titleGroup = document.createElement('div')
  titleGroup.style.cssText = 'display:flex;align-items:center;min-width:0;'
  titleGroup.append(label, preflightBadge)
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;'
  const printButton = document.createElement('button')
  printButton.type = 'button'
  printButton.textContent = '인쇄·PDF 저장'
  printButton.style.cssText = 'border:0;border-radius:9px;background:#4f46e5;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer;'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = '닫기'
  closeButton.style.cssText = 'border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;padding:8px 12px;font-weight:800;cursor:pointer;'
  actions.append(printButton, closeButton)
  toolbar.append(titleGroup, actions)

  const frame = document.createElement('iframe')
  frame.title = `${options.title} 미리보기`
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'width:100%;height:100%;border:0;border-radius:0 0 14px 14px;background:#e2e8f0;'
  overlay.append(toolbar, frame)
  document.body.appendChild(overlay)
  writeFrame(frame, buildPrintDocument(options))
  void waitUntilReady(frame).then(() => {
    const result = inspectFrame(frame)
    const singlePage = (options.pageMode ?? 'multi-page') === 'single-page'
    const warning = result.horizontalOverflow || (singlePage && result.verticalOverflow)
    preflightBadge.textContent = warning ? `A4 확인 필요 · 예상 ${result.estimatedPages}쪽` : singlePage ? 'A4 한 장 맞춤' : `A4 예상 ${result.estimatedPages}쪽`
    preflightBadge.style.background = warning ? '#fff1f2' : '#ecfdf5'
    preflightBadge.style.color = warning ? '#9f1239' : '#065f46'
    if (warning) preflightBadge.title = [...result.messages, ...result.suggestions].join('\n')
  })

  const close = () => {
    document.removeEventListener('keydown', onKeyDown)
    overlay.remove()
  }
  const print = () => printDocument(options)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }
  closeButton.addEventListener('click', close)
  printButton.addEventListener('click', print)
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close() })
  document.addEventListener('keydown', onKeyDown)
  closeButton.focus()
  return { close, print }
}

