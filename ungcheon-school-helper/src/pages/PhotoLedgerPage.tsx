import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import './PhotoLedgerPage.css'
import {
  PAGE_SIZES,
  DEFAULT_FILTERS,
  defaultState,
  mergeState,
  cellMetrics,
  buildPages,
  uid,
  pickAndReadImages,
  pickAndImportCaptions,
  exportCsv,
  saveProject,
  pickAndLoadProject,
  printLedger,
  type PhotoItem,
  type PhotoLedgerState,
  type PhotoFilters,
  type Caption,
  type CellMetrics,
} from '../services/photoLedger'

const STORE_KEY = 'photo:data'

// electron-store 영속 — 마운트 시 로드, 변경 시 디바운스 저장(사진 DataURL 대용량 대비)
function usePhotoStore() {
  const [st, setSt] = useState<PhotoLedgerState>(defaultState)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    window.electron
      ?.configGet(STORE_KEY)
      .then((v) => {
        if (v) setSt(mergeState(v as Partial<PhotoLedgerState>))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      window.electron?.configSet(STORE_KEY, st)
    }, 500)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [st, loaded])

  return { st, setSt, loaded }
}

export default function PhotoLedgerPage() {
  const { st, setSt, loaded } = usePhotoStore()

  const setLayout = (k: keyof PhotoLedgerState['layout'], v: unknown) =>
    setSt((s) => ({ ...s, layout: { ...s.layout, [k]: v } }))
  const setPage = (k: keyof PhotoLedgerState['page'], v: unknown) =>
    setSt((s) => ({ ...s, page: { ...s.page, [k]: v } }))
  const setMargin = (k: keyof PhotoLedgerState['page']['margin'], v: number) =>
    setSt((s) => ({ ...s, page: { ...s.page, margin: { ...s.page.margin, [k]: v } } }))
  const setItems = (fn: (items: PhotoItem[]) => PhotoItem[]) =>
    setSt((s) => ({ ...s, items: fn(s.items) }))

  const addImages = async () => {
    const imgs = await pickAndReadImages()
    if (imgs.length) setItems((items) => [...items, ...imgs])
  }

  const applyCaptions = (caps: Caption[]) => {
    setItems((items) => {
      const next = items.map((it) => ({ ...it }))
      caps.forEach((cap, i) => {
        if (i < next.length) {
          next[i].title = cap.title
          next[i].texts = cap.texts
        } else {
          next.push({
            id: uid(),
            src: null,
            originalSrc: null,
            filters: { ...DEFAULT_FILTERS },
            fileName: cap.fileName,
            title: cap.title,
            texts: cap.texts,
            blank: true,
          })
        }
      })
      return next
    })
  }

  const importCaptionsClick = async () => {
    const caps = await pickAndImportCaptions()
    if (caps) applyCaptions(caps)
  }

  const loadProjectClick = async () => {
    const loadedState = await pickAndLoadProject()
    if (loadedState) setSt(loadedState)
  }

  // ── pagination ──
  const pages = useMemo(() => buildPages(st), [st])

  // drag swap
  const dragId = useRef<string | null>(null)
  const onDrop = (toId: string) => {
    const from = dragId.current
    if (from == null) return
    setItems((items) => {
      const fi = items.findIndex((x) => x.id === from)
      const ti = items.findIndex((x) => x.id === toId)
      if (fi < 0 || ti < 0) return items
      const next = [...items]
      ;[next[fi], next[ti]] = [next[ti], next[fi]]
      return next
    })
    dragId.current = null
  }

  const updItem = (id: string, patch: Partial<PhotoItem>) =>
    setItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const removeItem = (id: string) => setItems((items) => items.filter((it) => it.id !== id))
  const insertBlankAfter = (id: string) =>
    setItems((items) => {
      const i = items.findIndex((x) => x.id === id)
      const next = [...items]
      next.splice(i + 1, 0, {
        id: uid(),
        src: null,
        originalSrc: null,
        filters: { ...DEFAULT_FILTERS },
        fileName: '',
        title: '',
        texts: [],
        blank: true,
      })
      return next
    })

  // ── photo editor ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingItem = editingId ? st.items.find((x) => x.id === editingId) : null

  const openEditor = (id: string) => setEditingId(id)
  const closeEditor = () => setEditingId(null)
  const applyEdit = ({ filters, src, originalSrc }: { filters: PhotoFilters; src: string | null; originalSrc: string | null }) => {
    if (editingId) updItem(editingId, { filters, src, originalSrc })
    closeEditor()
  }

  if (!loaded) {
    return (
      <div className="photo-ledger-root">
        <div className="muted" style={{ margin: 'auto' }}>불러오는 중…</div>
      </div>
    )
  }

  return (
    <div className="photo-ledger-root">
      <aside className="panel">
        <h1>사진대장 도우미</h1>
        <div className="ver">웅천고 업무도우미</div>

        <div className="sec">
          <h3>사진 / 데이터</h3>
          <button className="btn" onClick={addImages}>📷 사진 가져오기</button>
          <div className="btnrow">
            <button className="btn ghost row" onClick={() => exportCsv(st.items, st.layout.captionLines)}>CSV 양식</button>
            <button className="btn ghost row" onClick={importCaptionsClick}>CSV 불러오기</button>
          </div>
          <button
            className="btn ghost"
            onClick={() =>
              setItems((items) => [
                ...items,
                { id: uid(), src: null, originalSrc: null, filters: { ...DEFAULT_FILTERS }, fileName: '', title: '', texts: [], blank: true },
              ])
            }
          >
            ＋ 빈칸 추가
          </button>
          <button className="btn rose" onClick={() => { if (window.confirm('모든 사진을 지우시겠습니까?')) setItems(() => []) }}>전체 지우기</button>
          <div className="help">사진 {st.items.length}장 (빈칸 포함)</div>
        </div>

        <div className="sec">
          <h3>용지</h3>
          <div className="field row2">
            <div>
              <label>크기</label>
              <select value={st.page.size} onChange={(e) => setPage('size', e.target.value)}>
                {Object.keys(PAGE_SIZES).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label>방향</label>
              <select value={st.page.orientation} onChange={(e) => setPage('orientation', e.target.value)}>
                <option value="portrait">세로</option>
                <option value="landscape">가로</option>
              </select>
            </div>
          </div>
          <label className="muted" style={{ fontSize: 11 }}>여백 (mm)</label>
          <div className="field row2">
            <div><label>위</label><input type="number" value={st.page.margin.top} onChange={(e) => setMargin('top', Number(e.target.value))} /></div>
            <div><label>아래</label><input type="number" value={st.page.margin.bottom} onChange={(e) => setMargin('bottom', Number(e.target.value))} /></div>
            <div><label>좌</label><input type="number" value={st.page.margin.left} onChange={(e) => setMargin('left', Number(e.target.value))} /></div>
            <div><label>우</label><input type="number" value={st.page.margin.right} onChange={(e) => setMargin('right', Number(e.target.value))} /></div>
          </div>
        </div>

        <div className="sec">
          <h3>레이아웃</h3>
          <div className="field">
            <label>열 수 (가로 분할)</label>
            <div className="opts">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={st.layout.cols === n ? 'on' : ''} onClick={() => setLayout('cols', n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>사진 비율 (가로:세로)</label>
            <div className="opts">
              {[['3', '4', '3:4'], ['4', '3', '4:3'], ['1', '1', '1:1'], ['2', '3', '2:3']].map(([w, h, l]) => (
                <button
                  key={l}
                  className={st.layout.ratioW + ':' + st.layout.ratioH === w + ':' + h ? 'on' : ''}
                  onClick={() => setSt((s) => ({ ...s, layout: { ...s.layout, ratioW: +w, ratioH: +h } }))}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>사진 채움</label>
            <div className="opts">
              <button className={st.layout.imageFit === 'cover' ? 'on' : ''} onClick={() => setLayout('imageFit', 'cover')}>꽉 채움</button>
              <button className={st.layout.imageFit === 'contain' ? 'on' : ''} onClick={() => setLayout('imageFit', 'contain')}>비율 유지</button>
            </div>
          </div>
          <div className="field">
            <label>제목(파일명) 위치</label>
            <div className="opts">
              {[['top', '위'], ['bottom', '아래'], ['hidden', '숨김']].map(([v, l]) => (
                <button key={v} className={st.layout.titlePosition === v ? 'on' : ''} onClick={() => setLayout('titlePosition', v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>추가 텍스트 줄 수</label>
            <div className="opts">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={st.layout.captionLines === n ? 'on' : ''} onClick={() => setLayout('captionLines', n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="field row2">
            <div><label>가로 간격</label><input type="number" value={st.layout.colGap} onChange={(e) => setLayout('colGap', Number(e.target.value))} /></div>
            <div><label>세로 간격</label><input type="number" value={st.layout.rowGap} onChange={(e) => setLayout('rowGap', Number(e.target.value))} /></div>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <input type="checkbox" checked={st.border} onChange={(e) => setSt((s) => ({ ...s, border: e.target.checked }))} /> 사진 테두리
          </label>
        </div>

        <div className="sec">
          <h3>문서</h3>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input type="checkbox" checked={st.layout.showDocTitle} onChange={(e) => setLayout('showDocTitle', e.target.checked)} /> 대장 제목 표시
          </label>
          <div className="field"><label>사진대장 제목</label><input value={st.docTitle} onChange={(e) => setSt((s) => ({ ...s, docTitle: e.target.value }))} /></div>
          <div className="field"><label>파일명</label><input value={st.filename} onChange={(e) => setSt((s) => ({ ...s, filename: e.target.value }))} placeholder="예: 3학년1반_사진대장" /></div>
        </div>

        <div className="sec">
          <h3>저장 / 출력</h3>
          <div className="btnrow">
            <button className="btn ghost row" onClick={() => saveProject(st)}>저장</button>
            <button className="btn ghost row" onClick={loadProjectClick}>불러오기</button>
          </div>
          <button className="btn green" onClick={() => printLedger(st)}>🖨 인쇄 / PDF</button>
        </div>
      </aside>

      <main className="workspace">
        {pages.length === 0 && <div className="muted" style={{ marginTop: 80 }}>좌측에서 사진을 가져오거나 빈칸을 추가하세요.</div>}
        {pages.map((page, pi) => (
          <PageView
            key={pi}
            pageIndex={pi}
            pageCount={pages.length}
            page={page}
            st={st}
            dragId={dragId}
            onDrop={onDrop}
            updItem={updItem}
            removeItem={removeItem}
            insertBlankAfter={insertBlankAfter}
            openEditor={openEditor}
          />
        ))}
      </main>

      {editingItem && editingItem.src && (
        <PhotoEditor item={editingItem} onApply={applyEdit} onClose={closeEditor} />
      )}
    </div>
  )
}

interface PageViewProps {
  pageIndex: number
  pageCount: number
  page: PhotoItem[]
  st: PhotoLedgerState
  dragId: React.MutableRefObject<string | null>
  onDrop: (toId: string) => void
  updItem: (id: string, patch: Partial<PhotoItem>) => void
  removeItem: (id: string) => void
  insertBlankAfter: (id: string) => void
  openEditor: (id: string) => void
}

function PageView({ pageIndex, pageCount, page, st, dragId, onDrop, updItem, removeItem, insertBlankAfter, openEditor }: PageViewProps) {
  const M = cellMetrics(st)
  const m = st.page.margin
  const L = st.layout
  return (
    <div
      className="page"
      style={{
        width: M.wmm * 3.2,
        height: M.hmm * 3.2,
        paddingTop: m.top * 3.2,
        paddingBottom: m.bottom * 3.2,
        paddingLeft: m.left * 3.2,
        paddingRight: m.right * 3.2,
      }}
    >
      {L.showDocTitle && pageIndex === 0 && (
        <div className="docTitle" style={{ fontSize: 22, marginBottom: 10 }}>{st.docTitle}</div>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${L.cols}, 1fr)`,
          columnGap: M.colGapPx,
          rowGap: M.rowGapPx,
        }}
      >
        {page.map((it) => (
          <Cell key={it.id} it={it} M={M} st={st} dragId={dragId} onDrop={onDrop} updItem={updItem} removeItem={removeItem} insertBlankAfter={insertBlankAfter} openEditor={openEditor} />
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 6, right: 12, fontSize: 11, color: '#888' }}>{pageIndex + 1} / {pageCount}</div>
    </div>
  )
}

interface CellProps {
  it: PhotoItem
  M: CellMetrics
  st: PhotoLedgerState
  dragId: React.MutableRefObject<string | null>
  onDrop: (toId: string) => void
  updItem: (id: string, patch: Partial<PhotoItem>) => void
  removeItem: (id: string) => void
  insertBlankAfter: (id: string) => void
  openEditor: (id: string) => void
}

function Cell({ it, M, st, dragId, onDrop, updItem, removeItem, insertBlankAfter, openEditor }: CellProps) {
  const L = st.layout
  const [over, setOver] = useState(false)
  const filterStyle = it.filters
    ? `brightness(${it.filters.brightness}%) contrast(${it.filters.contrast}%) saturate(${it.filters.saturation}%)`
    : undefined

  const title = (
    <input
      className="title"
      value={it.title}
      placeholder="사진(파일) 이름"
      onChange={(e) => updItem(it.id, { title: e.target.value })}
    />
  )
  return (
    <div
      className={'cell' + (over ? ' dragover' : '')}
      style={{ border: st.border ? '1px solid #bbb' : 'none' }}
      draggable
      onDragStart={() => (dragId.current = it.id)}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(it.id) }}
    >
      {L.titlePosition === 'top' && <div className="cap" style={{ fontSize: 11 }}>{title}</div>}
      <div className="imgwrap" style={{ height: M.imgH }}>
        {it.src ? (
          <img src={it.src} alt="" style={{ objectFit: L.imageFit, filter: filterStyle }} />
        ) : (
          <span className="empty">사진 없음</span>
        )}
      </div>
      {L.titlePosition === 'bottom' && <div className="cap" style={{ fontSize: 11 }}>{title}</div>}
      {L.captionLines > 0 && (
        <div className="cap">
          {Array.from({ length: L.captionLines }).map((_, i) => (
            <input
              key={i}
              style={{ fontSize: 10, width: '100%' }}
              value={(it.texts || [])[i] || ''}
              placeholder={`텍스트${i + 1}`}
              onChange={(e) => {
                const texts = [...(it.texts || [])]
                texts[i] = e.target.value
                updItem(it.id, { texts })
              }}
            />
          ))}
        </div>
      )}
      <div className="cellbar">
        {it.src && <button onClick={(e) => { e.stopPropagation(); openEditor(it.id) }} title="사진 편집">편집</button>}
        <button onClick={() => insertBlankAfter(it.id)} title="빈칸 삽입">＋칸</button>
        <button onClick={() => updItem(it.id, { src: null, blank: true })} title="사진 비우기">사진×</button>
        <button onClick={() => removeItem(it.id)} title="칸 삭제">삭제</button>
      </div>
    </div>
  )
}

// ── PhotoEditor modal ──────────────────────────────────────────────────────
interface PhotoEditorProps {
  item: PhotoItem
  onApply: (v: { filters: PhotoFilters; src: string | null; originalSrc: string | null }) => void
  onClose: () => void
}

interface CropBox { x: number; y: number; w: number; h: number }
interface DragState { handle: string; startX: number; startY: number; initBox: CropBox }

function PhotoEditor({ item, onApply, onClose }: PhotoEditorProps) {
  const [tab, setTab] = useState<'adjust' | 'crop'>('adjust')
  const [filters, setFilters] = useState<PhotoFilters>(item.filters ? { ...item.filters } : { ...DEFAULT_FILTERS })
  const [src, setSrc] = useState<string | null>(item.src)
  const [originalSrc] = useState<string | null>(item.originalSrc || item.src)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, w: 0, h: 0 })
  const dragState = useRef<DragState | null>(null)

  useEffect(() => {
    if (tab === 'crop' && imgRef.current) {
      const { clientWidth: w, clientHeight: h } = imgRef.current
      setCropBox({ x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 })
    }
  }, [tab, src])

  const onMouseDownHandle = useCallback(
    (e: React.MouseEvent, handle: string) => {
      e.preventDefault()
      e.stopPropagation()
      dragState.current = { handle, startX: e.clientX, startY: e.clientY, initBox: { ...cropBox } }
    },
    [cropBox]
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current || !imgRef.current) return
    const { handle, startX, startY, initBox } = dragState.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const { clientWidth: W, clientHeight: H } = imgRef.current
    let { x, y, w, h } = initBox
    const MIN = 20

    if (handle === 'move') {
      x = Math.max(0, Math.min(x + dx, W - w))
      y = Math.max(0, Math.min(y + dy, H - h))
    } else {
      if (handle.includes('n')) { let ny = y + dy, nh = h - dy; if (ny < 0) { nh += ny; ny = 0 } if (nh < MIN) { ny = y + h - MIN; nh = MIN } y = ny; h = nh }
      if (handle.includes('s')) { h = Math.max(MIN, Math.min(h + dy, H - y)) }
      if (handle.includes('w')) { let nx = x + dx, nw = w - dx; if (nx < 0) { nw += nx; nx = 0 } if (nw < MIN) { nx = x + w - MIN; nw = MIN } x = nx; w = nw }
      if (handle.includes('e')) { w = Math.max(MIN, Math.min(w + dx, W - x)) }
    }
    setCropBox({ x, y, w, h })
  }, [])

  const onMouseUp = useCallback(() => { dragState.current = null }, [])

  const applyCrop = () => {
    if (!imgRef.current || cropBox.w === 0 || cropBox.h === 0) return
    const img = imgRef.current
    const scaleX = img.naturalWidth / img.clientWidth
    const scaleY = img.naturalHeight / img.clientHeight
    const canvas = document.createElement('canvas')
    canvas.width = cropBox.w * scaleX
    canvas.height = cropBox.h * scaleY
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, cropBox.x * scaleX, cropBox.y * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    setSrc(canvas.toDataURL('image/png'))
    setTab('adjust')
  }

  const resetImage = () => {
    setSrc(originalSrc)
    setFilters({ ...DEFAULT_FILTERS })
    setTab('adjust')
  }

  const filterCss = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`

  const HANDLES: [string, string, string, string, string, string][] = [
    ['nw', '0%', '0%', 'nwse-resize', '-50%', '-50%'],
    ['n', '50%', '0%', 'ns-resize', '-50%', '-50%'],
    ['ne', '100%', '0%', 'nesw-resize', '50%', '-50%'],
    ['w', '0%', '50%', 'ew-resize', '-50%', '-50%'],
    ['e', '100%', '50%', 'ew-resize', '50%', '-50%'],
    ['sw', '0%', '100%', 'nesw-resize', '-50%', '50%'],
    ['s', '50%', '100%', 'ns-resize', '-50%', '50%'],
    ['se', '100%', '100%', 'nwse-resize', '50%', '50%'],
  ]

  return (
    <div className="editor-overlay" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <div className="editor-modal">
        <div className="editor-header">
          <span>사진 편집 — {item.title || item.fileName}</span>
          <button className="editor-close" onClick={onClose}>✕</button>
        </div>

        <div className="editor-body">
          <div className="editor-preview">
            <div className="editor-img-wrap" style={{ backgroundImage: 'radial-gradient(circle, #444 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              <div style={{ position: 'relative', display: 'inline-block', maxHeight: '100%', maxWidth: '100%' }}>
                {src && (
                  <img ref={imgRef} src={src} alt="편집중" draggable="false" style={{ display: 'block', maxHeight: '55vh', maxWidth: '100%', filter: filterCss }} />
                )}
                {tab === 'crop' && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden', pointerEvents: 'none' }}>
                    <div
                      style={{
                        position: 'absolute', left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h,
                        border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                        cursor: 'move', pointerEvents: 'auto',
                      }}
                      onMouseDown={(e) => onMouseDownHandle(e, 'move')}
                    >
                      <div style={{ position: 'absolute', width: '100%', borderBottom: '1px solid rgba(255,255,255,0.4)', top: '33.3%' }} />
                      <div style={{ position: 'absolute', width: '100%', borderBottom: '1px solid rgba(255,255,255,0.4)', top: '66.6%' }} />
                      <div style={{ position: 'absolute', height: '100%', borderRight: '1px solid rgba(255,255,255,0.4)', left: '33.3%' }} />
                      <div style={{ position: 'absolute', height: '100%', borderRight: '1px solid rgba(255,255,255,0.4)', left: '66.6%' }} />
                      {HANDLES.map(([h, l, t, cur, tx, ty]) => (
                        <div
                          key={h}
                          onMouseDown={(e) => onMouseDownHandle(e, h)}
                          style={{
                            position: 'absolute', left: l, top: t, width: 14, height: 14,
                            background: '#fff', border: '1px solid #aaa', cursor: cur,
                            transform: `translate(${tx}, ${ty})`, pointerEvents: 'auto',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="editor-controls">
            <div className="editor-tabs">
              <button className={tab === 'adjust' ? 'on' : ''} onClick={() => setTab('adjust')}>🎨 색상조정</button>
              <button className={tab === 'crop' ? 'on' : ''} onClick={() => setTab('crop')}>✂ 자르기</button>
            </div>

            {tab === 'adjust' ? (
              <div className="editor-sliders">
                {([['brightness', '밝기'], ['contrast', '대비'], ['saturation', '채도']] as const).map(([key, label]) => (
                  <div key={key} className="slider-row">
                    <div className="slider-label">
                      <span>{label}</span>
                      <span className="slider-val">{filters[key]}%</span>
                    </div>
                    <input
                      type="range" min={0} max={200} value={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="editor-crop-info">
                <p>흰색 박스의 모서리를 끌어서 자를 영역을 선택하세요.</p>
                <button className="editor-btn-primary" onClick={applyCrop}>영역 적용하기</button>
              </div>
            )}

            <div className="editor-actions">
              <button className="editor-btn-secondary" onClick={resetImage}>원본으로</button>
              <button className="editor-btn-apply" onClick={() => onApply({ filters, src, originalSrc })}>명부에 반영</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
