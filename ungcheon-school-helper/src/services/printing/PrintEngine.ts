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

  void waitUntilReady(frame).then(() => {
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
  toolbar.append(label, actions)

  const frame = document.createElement('iframe')
  frame.title = `${options.title} 미리보기`
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'width:100%;height:100%;border:0;border-radius:0 0 14px 14px;background:#e2e8f0;'
  overlay.append(toolbar, frame)
  document.body.appendChild(overlay)
  writeFrame(frame, buildPrintDocument(options))

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

