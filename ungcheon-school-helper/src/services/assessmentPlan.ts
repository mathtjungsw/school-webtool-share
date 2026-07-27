// 사정안 — 타입 · 데이터 모델/템플릿 · 파일 입출력(IPC) · 인쇄(iframe)
// 원본 57-assessment-plan 의 lib/templates.js + App.jsx I/O 를 호스트 인프라에 맞게 포팅.

// ── 타입 ──────────────────────────────────────────────────────────────────
export type SectionKind = 'enrollment' | 'subjects' | 'awardList' | 'table' | 'textarea'

export interface SectionField { key: string; label: string; type: string; value: string | number }
export interface SubjectAvg { name: string; avg: string | number }

export interface Section {
  id: string
  title: string
  kind: SectionKind
  variant?: string
  desc?: string
  showDesc?: boolean
  tableLabel?: string
  fields?: SectionField[]
  subjects?: SubjectAvg[]
  classAvg?: string | number
  columns?: string[]
  rows?: string[][]
  hasSeq?: boolean
  text?: string
}

export interface Meta {
  school: string
  year: string
  grade: string
  className: string
  targetCount: string
  level: string
  teacherName?: string
}

export interface DocModel {
  title: string
  council: string
  note: string
  numberStyle: 'roman' | 'number'
  sections: Section[]
}

export interface AssessmentState {
  meta: Meta
  doc: DocModel
}

export interface CouncilType { id: string; label: string; desc: string }

/** 배포된 담임용 파일(.rsam-class) 포맷. */
export interface RsamClassFile {
  type: 'rsam-class'
  schemaVersion?: number
  meta: Meta
  doc: DocModel
  distributedAt?: string
  submittedAt?: string
  councilLabel?: string
  _fileName?: string
}

// ── 모델/템플릿 (원본 templates.js 포팅) ───────────────────────────────────
export const uid = (p = 'id'): string => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

export const COUNCIL_TYPES: CouncilType[] = [
  { id: 'sem1', label: '1학기 사정회', desc: '1학기 종료 학업·생활 종합 사정' },
  { id: 'sem2', label: '2학기 사정회', desc: '2학기 종료 학업·생활 종합 사정' },
  { id: 'promo', label: '진급 사정회', desc: '학년 진급 결정 사정' },
  { id: 'grad', label: '졸업 사정회', desc: '졸업 결정·수상 종합 사정' },
]

export const councilTitle = (id: string): string => {
  const t = COUNCIL_TYPES.find((c) => c.id === id)
  return t ? t.label.replace(' 사정회', '') + '사정안' : '사정안'
}

export const enrollmentFields = (): SectionField[] => [
  { key: 'startCount', label: '학기초 재적', type: 'number', value: '' },
  { key: 'transferIn', label: '전입 학생수', type: 'number', value: '' },
  { key: 'reEnter', label: '재취학 학생수', type: 'number', value: '' },
  { key: 'transferOut', label: '전출 학생수', type: 'number', value: '' },
  { key: 'defer', label: '유예 학생수', type: 'number', value: '' },
  { key: 'exempt', label: '면제 학생수', type: 'number', value: '' },
  { key: 'currentCount', label: '현재 재적', type: 'number', value: '' },
  { key: 'absent13', label: '1/3이상 결석자', type: 'number', value: '' },
  { key: 'targetCount', label: '사정 학생수', type: 'number', value: '' },
]

export const SUBJECTS_MIDDLE = ['국어', '수학', '사회', '역사', '과학', '기술·가정', '체육', '음악', '미술', '영어', '한문', '도덕', '정보', '진로', '보건', '환경', '중국어', '일본어', '문예', '독서']
export const SUBJECTS_HIGH = ['국어', '도덕', '사회', '역사', '수학', '과학', '기술·가정', '체육', '음악', '미술', '영어', '한문', '정보', '진로', '보건', '환경', '중국어', '일본어']

export const makeSection = (kind: SectionKind, level = '중학교'): Section => {
  const base: Section = { id: uid('sec'), title: '', kind, variant: 'col', desc: '', showDesc: true }
  switch (kind) {
    case 'enrollment':
      return { ...base, title: '학적사항', tableLabel: '재적변동 사항', fields: enrollmentFields() }
    case 'subjects':
      return {
        ...base,
        title: '교과 학습 현황',
        subjects: (level === '고등학교' ? SUBJECTS_HIGH : SUBJECTS_MIDDLE).map((name) => ({ name, avg: '' })),
        classAvg: '',
      }
    case 'awardList':
      return { ...base, title: '제수상(행동발달)', variant: 'single', desc: '행동발달상', columns: ['연번', '수상명', '대상 학생'], rows: [['', '', '']] }
    case 'table':
      return { ...base, title: '표', hasSeq: true, columns: ['연번', '항목', '내용'], rows: [['', '', '']] }
    case 'textarea':
      return { ...base, title: '종합 의견', text: '' }
    default:
      return base
  }
}

export const SECTION_KINDS: { kind: SectionKind; label: string }[] = [
  { kind: 'enrollment', label: '학적사항(재적변동)' },
  { kind: 'subjects', label: '교과 학습 현황(평균)' },
  { kind: 'awardList', label: '제수상/명단(표)' },
  { kind: 'table', label: '자유 표' },
  { kind: 'textarea', label: '서술(종합의견)' },
]

export interface Template {
  id: string
  name: string
  description: string
  level: string
  council: string
  make: () => Section[]
}

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'builtin_sem1_basic',
    name: '1학기 사정안(기본)',
    description: '🎁 기본 제공 — 중학교, 학적·교과평균·행동발달 3개 섹션',
    level: '중학교',
    council: 'sem1',
    make: () => [makeSection('enrollment'), makeSection('subjects'), makeSection('awardList')],
  },
  {
    id: 'builtin_grad',
    name: '졸업 사정안(3학년)',
    description: '🎁 기본 제공 — 학적·2/3미달·교과우수·출결·행동발달·특별활동',
    level: '중학교',
    council: 'grad',
    make: () => {
      const s1 = makeSection('enrollment')
      const s2: Section = { ...makeSection('table'), title: '2/3 이상 미이수(미달)자', columns: ['연번', '학생명', '미달 교과', '비고'], rows: [['', '', '', '']] }
      const s3: Section = { ...makeSection('table'), title: '교과 학습 우수자', columns: ['연번', '학생명', '교과', '성적'], rows: [['', '', '', '']] }
      const s4: Section = { ...makeSection('table'), title: '출결 상황 특이자', columns: ['연번', '학생명', '결석', '지각', '비고'], rows: [['', '', '', '', '']] }
      const s5 = makeSection('awardList')
      const s6: Section = { ...makeSection('table'), title: '특별활동(수상)', columns: ['연번', '학생명', '활동/수상', '비고'], rows: [['', '', '', '']] }
      return [s1, s2, s3, s4, s5, s6]
    },
  },
  {
    id: 'builtin_blank',
    name: '빈 사정안',
    description: '섹션을 직접 추가해 구성합니다.',
    level: '중학교',
    council: 'sem1',
    make: () => [],
  },
]

export const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']
export const sectionNumber = (style: string, i: number): string => (style === 'roman' ? ROMAN[i] || String(i + 1) : `${i + 1}`)

export function defaultState(): AssessmentState {
  return {
    meta: { school: '', year: '2026', grade: '3', className: '', targetCount: '', level: '중학교' },
    doc: {
      title: '졸업사정안',
      council: 'grad',
      note: '',
      numberStyle: 'roman',
      sections: BUILTIN_TEMPLATES[1].make(),
    },
  }
}

/** 저장 데이터를 기본값과 병합. */
export function mergeState(v: Partial<AssessmentState> | undefined): AssessmentState {
  const d = defaultState()
  if (!v) return d
  return {
    meta: { ...d.meta, ...(v.meta ?? {}) },
    doc: { ...d.doc, ...(v.doc ?? {}) },
  }
}

/** 배포용: 섹션 값만 비우고 구조 유지. */
export function clearSectionValues(sec: Section): Section {
  switch (sec.kind) {
    case 'enrollment':
      return { ...sec, fields: (sec.fields ?? []).map((f) => ({ ...f, value: '' })) }
    case 'subjects':
      return { ...sec, subjects: (sec.subjects ?? []).map((s) => ({ ...s, avg: '' })), classAvg: '' }
    case 'awardList':
    case 'table':
      return { ...sec, rows: (sec.rows ?? []).map((r) => r.map(() => '')) }
    case 'textarea':
      return { ...sec, text: '' }
    default:
      return sec
  }
}

// ── 파일 입출력 (Electron IPC) ──────────────────────────────────────────────
const sanitize = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_')

/** 사정안 JSON 저장(.rsam.json). */
export async function saveDoc(st: AssessmentState): Promise<boolean> {
  const bytes = new TextEncoder().encode(JSON.stringify(st, null, 2))
  const name = sanitize(`${st.meta.className || st.doc.title || '사정안'}.rsam.json`)
  return window.electron.saveFileDialog(name, Array.from(bytes))
}

/** 사정안/배포 파일 불러오기. rsam-class 면 meta/doc 만 반영. */
export async function pickAndLoadDoc(): Promise<AssessmentState | null> {
  const path = await window.electron.openFileDialog([{ name: '사정안 파일', extensions: ['json', 'rsam-class'] }])
  if (!path) return null
  const bytes = await window.electron.readFile(path)
  const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)))
  if (obj && obj.type === 'rsam-class') {
    return mergeState({ meta: obj.meta, doc: obj.doc })
  }
  return mergeState(obj)
}

/** 단일 반 배포 파일(.rsam-class) 저장. */
export async function saveClassFile(payload: RsamClassFile, fileName: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2))
  return window.electron.saveFileDialog(sanitize(fileName), Array.from(bytes))
}

/** 여러 반 배포 파일을 한 폴더에 일괄 저장. 저장된 개수 반환. */
export async function saveAllClassFiles(files: { name: string; payload: RsamClassFile }[]): Promise<number> {
  const out = files.map((f) => ({
    name: sanitize(f.name),
    bytes: Array.from(new TextEncoder().encode(JSON.stringify(f.payload, null, 2))),
  }))
  return window.electron.saveFilesToDir(out)
}

/** 제출된 .rsam-class 파일들을 다중 선택해 불러오기(반 순 정렬). */
export async function pickAndLoadCollected(): Promise<RsamClassFile[]> {
  const paths = await window.electron.openFilesDialog([{ name: '제출 파일', extensions: ['rsam-class', 'json'] }])
  const valid: RsamClassFile[] = []
  for (const p of paths) {
    try {
      const bytes = await window.electron.readFile(p)
      const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)))
      if (obj && obj.type === 'rsam-class') valid.push({ ...obj, _fileName: p.split(/[\\/]/).pop() })
    } catch { /* skip invalid */ }
  }
  valid.sort((a, b) => {
    const na = Number((a.meta?.className || '0').replace(/[^0-9]/g, ''))
    const nb = Number((b.meta?.className || '0').replace(/[^0-9]/g, ''))
    return na - nb
  })
  return valid
}

// ── 인쇄 (미리보기 .doc 만 독립 HTML 로 iframe 인쇄) ────────────────────────
const PRINT_DOC_CSS = `
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#111;}
.doc{background:#fff;color:#111;width:210mm;min-height:auto;padding:20mm 18mm;}
.doc h1{text-align:center;font-size:20pt;margin:0 0 4px;}
.doc .docmeta{text-align:center;color:#444;font-size:10pt;margin-bottom:18px;}
.doc section{margin-bottom:16px;page-break-inside:avoid;}
.doc section h2{font-size:12pt;border-bottom:2px solid #222;padding-bottom:3px;margin:0 0 8px;}
.doc .desc{font-size:9pt;color:#555;margin:0 0 6px;}
.doc table{border-collapse:collapse;width:100%;table-layout:fixed;}
.doc th,.doc td{border:1px solid #555;padding:4px 6px;font-size:9.5pt;text-align:center;word-break:break-word;}
.doc th{background:#eef;}
.doc td.lab{background:#f4f6fb;font-weight:600;}
.doc .note{white-space:pre-wrap;font-size:10pt;min-height:40px;}
@page{size:A4;margin:0;}
`

/** 전달된 .doc 엘리먼트의 HTML 을 숨김 iframe 에서 인쇄(앱 전체 창 인쇄 방지). */
export function printDoc(docHtml: string): void {
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>${PRINT_DOC_CSS}</style></head><body>${docHtml}</body></html>`
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

  const cleanup = () => setTimeout(() => {
    try { document.body.removeChild(iframe) } catch { /* noop */ }
  }, 500)
  iframe.contentWindow!.onafterprint = cleanup
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch { /* noop */ }
    cleanup()
  }, 300)
}
