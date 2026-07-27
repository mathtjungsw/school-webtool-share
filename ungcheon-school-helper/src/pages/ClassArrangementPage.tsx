import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Upload, Download, RotateCcw, Trash2,
  FileSpreadsheet, ArrowLeftRight, History, Wand2, X,
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

interface Student {
  id: string
  name: string
  studentId: string
  gender?: string
  score?: number
  birth?: string       // 생년월일 YYYYMMDD 또는 YYYY-MM-DD
  prevClass?: string
  classNum: number
  achievement?: 'low' | 'normal'
  disease?: string     // 특이질환
  special?: boolean
  specialClass?: number // 특수학생 배치반 직접지정
  guidance?: boolean
  groupId?: string
  groupMode?: 'separate' | 'together'
  transfer?: boolean
}

type AllocMode = 'random' | 'balanced' | 'zigzag' | 'zigzag_birth' | 'comprehensive'

type HistoryEntry =
  | { type: 'swap'; a: { classNum: number; studentId: string; name: string }; b: { classNum: number; studentId: string; name: string } }
  | { type: 'move'; student: { classNum: number; studentId: string; name: string }; toClass: number }
  | { type: 'alloc'; label: string; snapshot: Student[] }

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─────────────────────────────────────────────
// Excel 파싱
// ─────────────────────────────────────────────

function parseClassExcel(buf: ArrayBuffer): Student[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true })
  const students: Student[] = []

  for (const row of rows) {
    const name =
      String(row['이름'] ?? row['성명'] ?? row['학생명'] ?? '').trim()
    if (!name) continue

    const rawClass = row['반'] ?? row['학급'] ?? row['현재반'] ?? row['Class'] ?? 1
    const classNum = parseInt(String(rawClass)) || 1
    const studentId = String(row['번호'] ?? row['학번'] ?? '').trim()
    const gender = row['성별'] ? String(row['성별']).trim() : undefined

    const scoreRaw = row['기준성적'] ?? row['성적'] ?? row['점수']
    const score = scoreRaw !== undefined ? parseFloat(String(scoreRaw)) : undefined

    const prevClassRaw = row['이전반'] ?? row['이전학적반'] ?? row['前반']
    const prevClass = prevClassRaw !== undefined ? String(prevClassRaw).trim() : undefined

    // 학업성취도
    const achRaw = row['학업성취도'] ?? row['성취도']
    let achievement: Student['achievement'] = undefined
    if (achRaw !== undefined) {
      const v = String(achRaw).trim()
      achievement = (v === '부진' || v === '기초학력부진' || v.toLowerCase() === 'low') ? 'low' : 'normal'
    }

    // 특수학생
    const specialRaw = row['특수'] ?? row['특수학생']
    const special = specialRaw !== undefined && String(specialRaw).trim() !== '' ? true : undefined

    // 생활지도
    const guidanceRaw = row['생활지도'] ?? row['지도대상']
    const guidance = guidanceRaw !== undefined && String(guidanceRaw).trim() !== '' ? true : undefined

    // 그룹
    const groupIdRaw = row['그룹'] ?? row['쌍생아그룹'] ?? row['groupId']
    const groupId = groupIdRaw !== undefined ? String(groupIdRaw).trim() || undefined : undefined

    const groupModeRaw = row['그룹방식'] ?? row['groupMode']
    let groupMode: Student['groupMode'] = undefined
    if (groupModeRaw !== undefined) {
      const v = String(groupModeRaw).trim()
      groupMode = v === '분리' ? 'separate' : v === '동반' ? 'together' : undefined
    }

    // 전출예정
    const transferRaw = row['전출예정'] ?? row['전출']
    const transfer = transferRaw !== undefined && String(transferRaw).trim() !== '' ? true : undefined

    // 생년월일
    const birthRaw = row['생년월일'] ?? row['생일'] ?? row['birth']
    let birth: string | undefined
    if (birthRaw !== undefined) {
      const bStr = String(birthRaw).trim().replace(/[.\-\/]/g, '')
      birth = bStr || undefined
    }

    // 특이질환
    const diseaseRaw = row['특이질환'] ?? row['질환'] ?? row['disease']
    const disease = diseaseRaw !== undefined ? String(diseaseRaw).trim() || undefined : undefined

    // 특수학생 배치반 직접지정
    const specialClassRaw = row['배치반'] ?? row['특수배치반'] ?? row['specialClass']
    const specialClass = specialClassRaw !== undefined ? parseInt(String(specialClassRaw)) || undefined : undefined

    students.push({
      id: makeId(), name, studentId, gender, score, birth, prevClass, classNum,
      achievement, disease, special, specialClass, guidance, groupId, groupMode, transfer,
    })
  }

  return students
}

// ─────────────────────────────────────────────
// 자동배치 알고리즘
// ─────────────────────────────────────────────

function allocateStudents(
  students: Student[],
  numClasses: number,
  mode: AllocMode,
): Student[] {
  if (numClasses < 1) return students

  // 전출예정 분리
  const transfers = students.filter(s => s.transfer)
  const active = students.filter(s => !s.transfer)

  // 그룹별로 묶기
  const groupMap = new Map<string, Student[]>()
  for (const s of active) {
    if (s.groupId) {
      const arr = groupMap.get(s.groupId) ?? []
      arr.push(s)
      groupMap.set(s.groupId, arr)
    }
  }

  // 반별 버킷 초기화
  const buckets: Student[][] = Array.from({ length: numClasses }, () => [])

  // 배정 헬퍼: 특정 학생을 특정 반에 배정
  const assign = (student: Student, classIdx: number) => {
    buckets[classIdx].push({ ...student, classNum: classIdx + 1 })
  }

  // together 그룹: 가장 적은 반에 몰아 넣기
  const togetherGroupIds = new Set<string>()
  for (const [gid, members] of groupMap.entries()) {
    if (members[0].groupMode === 'together') {
      togetherGroupIds.add(gid)
      const targetIdx = buckets.reduce((minI, b, i) => b.length < buckets[minI].length ? i : minI, 0)
      for (const m of members) assign(m, targetIdx)
    }
  }

  // 나머지 학생 (together 그룹 + 이미 배정된 학생 제외)
  const assignedIds = new Set(buckets.flat().map(s => s.id))
  const remaining = active.filter(s => !assignedIds.has(s.id))

  // separate 그룹: 모드 적용 후 같은 그룹을 서로 다른 반으로 분산
  // → 배치 후에 후처리로 처리

  let ordered: Student[]

  if (mode === 'random') {
    ordered = fisherYates(remaining)
  } else if (mode === 'balanced') {
    // 기초학력부진 먼저 각 반에 1명씩 배정
    const lowStudents = fisherYates(remaining.filter(s => s.achievement === 'low'))
    const others = fisherYates(remaining.filter(s => s.achievement !== 'low'))
    ordered = []
    // low 학생: 반 순서대로 1명씩
    for (let i = 0; i < lowStudents.length; i++) {
      const idx = i % numClasses
      assign(lowStudents[i], idx)
    }
    // 나머지: 성별 균형 맞춰 배치
    const males = others.filter(s => s.gender === '남' || s.gender === 'M' || s.gender === '남자')
    const females = others.filter(s => s.gender === '여' || s.gender === 'F' || s.gender === '여자')
    const genderless = others.filter(s => !['남','M','남자','여','F','여자'].includes(s.gender ?? ''))

    const interleaved: Student[] = []
    const maxLen = Math.max(males.length, females.length)
    for (let i = 0; i < maxLen; i++) {
      if (i < males.length) interleaved.push(males[i])
      if (i < females.length) interleaved.push(females[i])
    }
    interleaved.push(...genderless)
    ordered = interleaved
  } else if (mode === 'zigzag_birth') {
    // ㄹ자 배치(생년월일순): 생년월일 오름차순 정렬 후 뱀 순서
    ordered = [...remaining].sort((a, b) => (a.birth ?? '99999999').localeCompare(b.birth ?? '99999999'))
  } else if (mode === 'comprehensive') {
    // 종합 고려 배치 — 별도 처리
    ordered = []
  } else {
    // zigzag: score 내림차순 정렬 후 뱀 순서
    ordered = [...remaining].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }

  if (mode === 'comprehensive') {
    // ① 특수학생: specialClass 지정 시 해당 반, 없으면 가장 작은 반
    const specials = remaining.filter(s => s.special)
    const nonSpecials = remaining.filter(s => !s.special)
    for (const s of specials) {
      if (s.specialClass && s.specialClass >= 1 && s.specialClass <= numClasses) {
        assign(s, s.specialClass - 1)
      } else {
        const minIdx = buckets.reduce((mi, b, i) => b.length < buckets[mi].length ? i : mi, 0)
        assign(s, minIdx)
      }
    }
    // ② 기초학력부진: 반별 1명씩 라운드로빈 균등배분
    const lowStudents = fisherYates(nonSpecials.filter(s => s.achievement === 'low'))
    for (let i = 0; i < lowStudents.length; i++) assign(lowStudents[i], i % numClasses)
    // ③ 생활지도: 생활지도 인원 적은 반 우선 배치
    const guidanceStudents = fisherYates(nonSpecials.filter(s => s.guidance && s.achievement !== 'low'))
    for (const s of guidanceStudents) {
      const minIdx = buckets.reduce((mi, b, i) => {
        const gCnt = b.filter(x => x.guidance).length
        const miCnt = buckets[mi].filter(x => x.guidance).length
        return gCnt < miCnt ? i : mi
      }, 0)
      assign(s, minIdx)
    }
    // ④ 나머지: 성별 균형 (남녀 교대) 후 각 반 라운드로빈
    const rest = fisherYates(nonSpecials.filter(s => s.achievement !== 'low' && !s.guidance))
    const males = rest.filter(s => ['남','M','남자'].includes(s.gender ?? ''))
    const females = rest.filter(s => ['여','F','여자'].includes(s.gender ?? ''))
    const genderless = rest.filter(s => !['남','M','남자','여','F','여자'].includes(s.gender ?? ''))
    const interleaved: Student[] = []
    const maxG = Math.max(males.length, females.length)
    for (let i = 0; i < maxG; i++) {
      if (i < males.length) interleaved.push(males[i])
      if (i < females.length) interleaved.push(females[i])
    }
    interleaved.push(...genderless)
    for (let i = 0; i < interleaved.length; i++) assign(interleaved[i], i % numClasses)
  } else if (mode === 'balanced') {
    // balanced: ordered는 already assigned via assign() above, 나머지는 아래에서 처리
    for (let i = 0; i < ordered.length; i++) {
      const idx = i % numClasses
      assign(ordered[i], idx)
    }
  } else if (mode === 'zigzag' || mode === 'zigzag_birth') {
    // 뱀 순서 배정
    let dir = 1
    let classIdx = 0
    for (const s of ordered) {
      assign(s, classIdx)
      classIdx += dir
      if (classIdx >= numClasses) { classIdx = numClasses - 1; dir = -1 }
      else if (classIdx < 0) { classIdx = 0; dir = 1 }
    }
  } else {
    // random
    for (let i = 0; i < ordered.length; i++) {
      const idx = i % numClasses
      assign(ordered[i], idx)
    }
  }

  // separate 그룹 후처리: 같은 그룹의 학생이 같은 반에 있으면 다른 반으로 이동
  for (const [gid, members] of groupMap.entries()) {
    if (members[0].groupMode !== 'separate') continue
    // buckets 기준으로 같은 그룹 학생 찾기
    const placed = buckets.flat().filter(s => s.groupId === gid)
    const usedClasses = new Set<number>()
    for (const p of placed) {
      if (usedClasses.has(p.classNum)) {
        // 충돌 → 이 학생을 가장 작은 반 중 미사용 반으로 이동
        const unusedIdx = buckets.findIndex((_, i) => !usedClasses.has(i + 1))
        if (unusedIdx >= 0) {
          const bucketIdx = p.classNum - 1
          const studentIdx = buckets[bucketIdx].findIndex(s => s.id === p.id)
          if (studentIdx >= 0) {
            const moved = { ...buckets[bucketIdx][studentIdx], classNum: unusedIdx + 1 }
            buckets[bucketIdx].splice(studentIdx, 1)
            buckets[unusedIdx].push(moved)
            usedClasses.add(unusedIdx + 1)
          }
        }
      } else {
        usedClasses.add(p.classNum)
      }
    }
  }

  // 전출예정 학생은 각 반 마지막에 배정
  for (let i = 0; i < transfers.length; i++) {
    const idx = i % numClasses
    buckets[idx].push({ ...transfers[i], classNum: idx + 1 })
  }

  return buckets.flat()
}

// ─────────────────────────────────────────────
// 통계 계산
// ─────────────────────────────────────────────

interface ClassStat {
  classNum: number
  total: number
  male: number
  female: number
  low: number
  special: number
  guidance: number
}

function calcStats(students: Student[], classNums: number[]): ClassStat[] {
  return classNums.map(cn => {
    const cs = students.filter(s => s.classNum === cn)
    return {
      classNum: cn,
      total: cs.length,
      male: cs.filter(s => s.gender === '남' || s.gender === 'M' || s.gender === '남자').length,
      female: cs.filter(s => s.gender === '여' || s.gender === 'F' || s.gender === '여자').length,
      low: cs.filter(s => s.achievement === 'low').length,
      special: cs.filter(s => s.special).length,
      guidance: cs.filter(s => s.guidance).length,
    }
  })
}

// ─────────────────────────────────────────────
// AutoAllocModal 컴포넌트
// ─────────────────────────────────────────────

interface AutoAllocModalProps {
  onClose: () => void
  onApply: (numClasses: number, mode: AllocMode) => void
  currentClassCount: number
}

function AutoAllocModal({ onClose, onApply, currentClassCount }: AutoAllocModalProps) {
  const [mode, setMode] = useState<AllocMode>('balanced')
  const [numClasses, setNumClasses] = useState(currentClassCount || 5)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="bg-surface-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5"
      >
        {/* 제목 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-emerald-400" />
            <h2 className="text-sm font-bold text-white">자동 배치</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* 목표 반 수 */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">목표 반 수</label>
          <input
            type="number"
            min={1}
            max={30}
            value={numClasses}
            onChange={e => setNumClasses(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
            className="w-full bg-surface-800 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* 배치 방식 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-400">배치 방식</label>
          <div className="space-y-2">
            {(
              [
                { value: 'comprehensive', label: '종합 고려 배치 ★ 권장',      desc: '특수→기초학력부진→생활지도→일반 순서로 균등하게 배분합니다.' },
                { value: 'random',        label: '무작위 배치',                desc: '완전 무작위로 섞어 배정합니다.' },
                { value: 'balanced',      label: '균등 배치 (성별 + 성취도)',   desc: '기초학력부진 학생과 성별을 각 반에 균등하게 배분합니다.' },
                { value: 'zigzag',        label: 'ㄹ자 배치 (성적순)',           desc: '성적 내림차순으로 뱀 패턴으로 배정합니다.' },
                { value: 'zigzag_birth',  label: 'ㄹ자 배치 (생년월일순)',       desc: '생년월일 오름차순으로 뱀 패턴으로 배정합니다.' },
              ] as { value: AllocMode; label: string; desc: string }[]
            ).map(opt => (
              <label
                key={opt.value}
                className={clsx(
                  'flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all',
                  mode === opt.value
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-white/5 bg-surface-800 hover:border-white/10',
                )}
              >
                <input
                  type="radio"
                  name="allocMode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => setMode(opt.value)}
                  className="mt-0.5 accent-emerald-500"
                />
                <div>
                  <div className="text-xs font-medium text-white">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 실행 버튼 */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => { onApply(numClasses, mode); onClose() }}
            className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Wand2 size={12} /> 배치 실행
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 학생 카드 배지
// ─────────────────────────────────────────────

function StudentBadges({ student }: { student: Student }) {
  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {student.achievement === 'low' && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/20">L</span>
      )}
      {student.special && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/20">
          특{student.specialClass ? `→${student.specialClass}반` : ''}
        </span>
      )}
      {student.guidance && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/20">지</span>
      )}
      {student.disease && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/20" title={student.disease}>질환</span>
      )}
      {student.transfer && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-slate-500/30 text-slate-400 border border-slate-500/20">전출</span>
      )}
      {student.groupId && (
        <span className="inline-flex items-center px-1 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">{student.groupId}</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────

export default function ClassArrangementPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ type: 'student'; id: string } | { type: 'class'; classNum: number } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  const [highlightPrevClass, setHighlightPrevClass] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [showAutoAllocModal, setShowAutoAllocModal] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const classNums = Array.from(new Set(students.map(s => s.classNum))).sort((a, b) => a - b)
  const stats = calcStats(students, classNums)

  // ── Excel 양식 다운로드 ──────────────────────

  const downloadTemplate = () => {
    const header = [['반', '이름', '번호', '성별', '생년월일', '기준성적', '이전반', '학업성취도', '특수', '배치반', '생활지도', '특이질환', '그룹', '그룹방식', '전출예정']]
    const guide = [['예: 1', '홍길동', '1', '남', '20060301', '85.5', '3', '(부진/정상)', 'O', '2', 'O', '(질환명)', 'A', '(분리/동반)', 'O']]
    const ws = XLSX.utils.aoa_to_sheet([...header, ...guide])
    ws['!cols'] = [5, 10, 6, 5, 10, 8, 8, 10, 5, 6, 8, 10, 6, 8, 8].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '반편성')
    XLSX.writeFile(wb, '반편성조정_양식.xlsx')
    showToast('양식 다운로드 완료!')
  }

  // ── Excel 가져오기 ──────────────────────────

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const imported = parseClassExcel(ev.target?.result as ArrayBuffer)
        if (imported.length === 0) { showToast('가져올 데이터가 없습니다. 필수 열: 이름, 반'); return }
        setStudents(imported)
        setHistory([])
        setMarkedIds(new Set())
        showToast(`${imported.length}명 가져오기 완료!`)
      } catch (e) {
        showToast((e as Error).message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── Excel 내보내기 ──────────────────────────

  const exportExcel = () => {
    if (students.length === 0) { showToast('내보낼 데이터가 없습니다.'); return }
    const sorted = [...students].sort((a, b) => a.classNum - b.classNum || a.name.localeCompare(b.name))
    const rows = sorted.map((s, i) => ({
      번호: i + 1,
      반: s.classNum,
      이름: s.name,
      학번: s.studentId,
      성별: s.gender ?? '',
      생년월일: s.birth ?? '',
      기준성적: s.score ?? '',
      이전반: s.prevClass ?? '',
      학업성취도: s.achievement === 'low' ? '부진' : s.achievement === 'normal' ? '정상' : '',
      특수: s.special ? 'O' : '',
      배치반: s.specialClass ?? '',
      생활지도: s.guidance ? 'O' : '',
      특이질환: s.disease ?? '',
      그룹ID: s.groupId ?? '',
      그룹방식: s.groupMode === 'separate' ? '분리' : s.groupMode === 'together' ? '동반' : '',
      전출예정: s.transfer ? 'O' : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [5, 5, 10, 10, 5, 8, 8, 10, 5, 8, 8, 8, 8].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '반편성결과')
    XLSX.writeFile(wb, `반편성_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`)
    showToast('Excel 내보내기 완료!')
  }

  // ── 드래그 앤 드롭 ──────────────────────────

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  const onDragOver = (e: React.DragEvent, target: typeof dropTarget) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  const onDragLeave = () => setDropTarget(null)

  const onDrop = (e: React.DragEvent, target: typeof dropTarget) => {
    e.preventDefault()
    setDropTarget(null)
    if (!draggingId || !target) { setDraggingId(null); return }

    const dragging = students.find(s => s.id === draggingId)
    if (!dragging) { setDraggingId(null); return }

    if (target.type === 'student' && target.id !== draggingId) {
      const other = students.find(s => s.id === target.id)
      if (!other) { setDraggingId(null); return }

      const entry: HistoryEntry = {
        type: 'swap',
        a: { classNum: dragging.classNum, studentId: dragging.id, name: dragging.name },
        b: { classNum: other.classNum, studentId: other.id, name: other.name },
      }
      setStudents(prev => prev.map(s => {
        if (s.id === dragging.id) return { ...s, classNum: other.classNum }
        if (s.id === other.id)    return { ...s, classNum: dragging.classNum }
        return s
      }))
      setHistory(prev => [entry, ...prev])
    } else if (target.type === 'class' && target.classNum !== dragging.classNum) {
      const entry: HistoryEntry = {
        type: 'move',
        student: { classNum: dragging.classNum, studentId: dragging.id, name: dragging.name },
        toClass: target.classNum,
      }
      setStudents(prev => prev.map(s => s.id === dragging.id ? { ...s, classNum: target.classNum } : s))
      setHistory(prev => [entry, ...prev])
    }

    setDraggingId(null)
  }

  // ── 되돌리기 ───────────────────────────────

  const undo = () => {
    if (history.length === 0) return
    const [last, ...rest] = history
    if (last.type === 'swap') {
      setStudents(prev => prev.map(s => {
        if (s.id === last.a.studentId) return { ...s, classNum: last.a.classNum }
        if (s.id === last.b.studentId) return { ...s, classNum: last.b.classNum }
        return s
      }))
    } else if (last.type === 'move') {
      setStudents(prev => prev.map(s =>
        s.id === last.student.studentId ? { ...s, classNum: last.student.classNum } : s
      ))
    } else if (last.type === 'alloc') {
      setStudents(last.snapshot)
    }
    setHistory(rest)
  }

  // ── 요주의 토글 ────────────────────────────

  const toggleMark = (id: string) => {
    setMarkedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // ── 자동배치 적용 ──────────────────────────

  const applyAutoAlloc = (numClasses: number, mode: AllocMode) => {
    const snapshot = students // 되돌리기용 스냅샷
    const result = allocateStudents(students, numClasses, mode)
    const modeLabel = mode === 'random' ? '무작위' : mode === 'balanced' ? '균등' : mode === 'zigzag' ? 'ㄹ자(성적)' : mode === 'zigzag_birth' ? 'ㄹ자(생년월일)' : '종합고려'
    const entry: HistoryEntry = {
      type: 'alloc',
      label: `자동배치(${modeLabel}, ${numClasses}반)`,
      snapshot,
    }
    setStudents(result)
    setHistory(prev => [entry, ...prev])
    showToast(`자동배치 완료: ${result.length}명 → ${numClasses}개 반`)
  }

  const prevClasses = Array.from(new Set(students.map(s => s.prevClass).filter(Boolean) as string[])).sort()

  // 동명이인 감지
  const nameCounts = students.reduce<Record<string, number>>((acc, s) => {
    acc[s.name] = (acc[s.name] ?? 0) + 1
    return acc
  }, {})
  const duplicateNames = new Set(Object.keys(nameCounts).filter(n => nameCounts[n] > 1))

  // ──────────────────────────────────────────
  // 렌더
  // ──────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Users size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">반편성 조정</h1>
            <p className="text-xs text-slate-500 mt-0.5">학생 카드를 드래그하여 반을 교환하거나 이동합니다 (더블클릭: 요주의 표시)</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {prevClasses.length > 0 && (
              <select
                value={highlightPrevClass ?? ''}
                onChange={e => setHighlightPrevClass(e.target.value || null)}
                className="bg-surface-800 border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">이전 반 하이라이트 없음</option>
                {prevClasses.map(c => <option key={c} value={c}>{c}반 출신 강조</option>)}
              </select>
            )}
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors"
            >
              <Download size={13} /> 양식
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors"
            >
              <Upload size={13} /> 가져오기
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" />
            <button
              onClick={exportExcel}
              disabled={students.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-40"
            >
              <Download size={13} /> 내보내기
            </button>
            <button
              onClick={() => setShowAutoAllocModal(true)}
              disabled={students.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg transition-colors disabled:opacity-40 font-medium"
            >
              <Wand2 size={13} /> 자동배치
            </button>
            <button
              onClick={undo}
              disabled={history.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-40"
            >
              <RotateCcw size={13} /> 되돌리기
            </button>
            <button
              onClick={() => setShowHistory(v => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                showHistory ? 'bg-violet-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-slate-300',
              )}
            >
              <History size={13} /> 기록 ({history.length})
            </button>
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        /* ── 빈 상태 ── */
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-slate-600">
          <FileSpreadsheet size={40} className="opacity-30" />
          <div className="text-center space-y-1">
            <p className="text-sm">Excel 파일을 가져오세요</p>
            <p className="text-xs text-slate-700">
              필수 열: 반, 이름 | 선택 열: 번호, 성별, 생년월일, 기준성적, 이전반,<br />
              학업성취도, 특수, 배치반, 생활지도, 특이질환, 그룹, 그룹방식, 전출예정
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl transition-colors"
          >
            <Upload size={15} /> Excel 가져오기
          </button>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* ── 통계 패널 ── */}
          {showStats && stats.length > 0 && (
            <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-400">반별 통계</span>
                <button
                  onClick={() => setShowStats(false)}
                  className="text-slate-700 hover:text-slate-400 transition-colors ml-auto"
                >
                  <X size={11} />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {stats.map(st => (
                  <div
                    key={st.classNum}
                    className="flex-shrink-0 bg-surface-800/60 border border-white/5 rounded-xl px-3 py-2 min-w-[90px]"
                  >
                    <div className="text-[11px] font-bold text-white mb-1">{st.classNum}반</div>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">전체</span>
                        <span className="text-[10px] font-medium text-white">{st.total}명</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">남/녀</span>
                        <span className="text-[10px] text-slate-300">{st.male}/{st.female}</span>
                      </div>
                      {st.low > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-yellow-600">부진</span>
                          <span className="text-[10px] text-yellow-400">{st.low}</span>
                        </div>
                      )}
                      {st.special > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-blue-600">특수</span>
                          <span className="text-[10px] text-blue-400">{st.special}</span>
                        </div>
                      )}
                      {st.guidance > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-orange-600">생활지도</span>
                          <span className="text-[10px] text-orange-400">{st.guidance}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showStats && (
            <button
              onClick={() => setShowStats(true)}
              className="flex-shrink-0 mx-4 mt-2 text-[10px] text-slate-600 hover:text-slate-400 transition-colors text-left"
            >
              ▼ 통계 보기
            </button>
          )}

          <div className="flex flex-1 overflow-hidden">
            {/* ── 반 컬럼 ── */}
            <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
              <div className="flex gap-3 min-w-max">
                {classNums.map(cn => {
                  const classStudents = students.filter(s => s.classNum === cn)
                  const isDropTarget = dropTarget?.type === 'class' && dropTarget.classNum === cn
                  return (
                    <div
                      key={cn}
                      className={clsx(
                        'w-36 flex-shrink-0 rounded-xl border transition-all',
                        isDropTarget
                          ? 'border-emerald-400/60 bg-emerald-400/5'
                          : 'border-white/5 bg-surface-800/40',
                      )}
                      onDragOver={e => onDragOver(e, { type: 'class', classNum: cn })}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDrop(e, { type: 'class', classNum: cn })}
                    >
                      {/* 컬럼 헤더 */}
                      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{cn}반</span>
                        <span className="text-[10px] text-slate-600">{classStudents.length}명</span>
                      </div>

                      {/* 학생 카드 목록 */}
                      <div className="p-2 space-y-1 min-h-[80px]">
                        {classStudents.map(student => {
                          const isDragging = draggingId === student.id
                          const isDropOnStudent = dropTarget?.type === 'student' && dropTarget.id === student.id
                          const isMarked = markedIds.has(student.id)
                          const isHighlighted = highlightPrevClass && student.prevClass === highlightPrevClass
                          const isDuplicate = duplicateNames.has(student.name)
                          const hasBadge = student.achievement === 'low' || student.special || student.guidance || student.transfer || student.groupId || student.disease

                          return (
                            <div
                              key={student.id}
                              draggable
                              onDragStart={e => onDragStart(e, student.id)}
                              onDragEnd={() => setDraggingId(null)}
                              onDragOver={e => onDragOver(e, { type: 'student', id: student.id })}
                              onDragLeave={onDragLeave}
                              onDrop={e => onDrop(e, { type: 'student', id: student.id })}
                              onDoubleClick={() => toggleMark(student.id)}
                              className={clsx(
                                'px-2 py-1.5 rounded-lg text-xs cursor-grab active:cursor-grabbing select-none transition-all',
                                isDragging
                                  ? 'opacity-30 scale-95'
                                  : isDropOnStudent
                                  ? 'ring-2 ring-sky-400 bg-sky-500/20'
                                  : isMarked
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : isHighlighted
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                                  : 'bg-surface-700 text-slate-300 hover:bg-surface-600 border border-transparent',
                              )}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                {student.name}
                                {isDuplicate && (
                                  <span className="text-[9px] text-amber-400 font-normal">
                                    ({student.prevClass ? `${student.prevClass}반` : ''}{student.studentId ? `${student.studentId}번` : ''})
                                  </span>
                                )}
                              </div>
                              {!isDuplicate && (student.studentId || student.prevClass) && (
                                <div className="text-[10px] text-slate-600 truncate">
                                  {student.prevClass ? `(전)${student.prevClass}반` : student.studentId}
                                </div>
                              )}
                              {hasBadge && <StudentBadges student={student} />}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── 히스토리 패널 ── */}
            {showHistory && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l border-white/5 bg-surface-950 flex flex-col flex-shrink-0 overflow-hidden"
                style={{ width: 240 }}
              >
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">변경 기록</span>
                  <button
                    onClick={() => setHistory([])}
                    className="text-[10px] text-slate-600 hover:text-rose-400 transition-colors flex items-center gap-0.5"
                  >
                    <Trash2 size={10} /> 전체 삭제
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-700 text-center py-6">기록 없음</p>
                  ) : history.map((entry, i) => (
                    <div key={i} className="px-4 py-2 border-b border-white/5 last:border-0">
                      {entry.type === 'swap' ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <ArrowLeftRight size={10} className="text-sky-400" />
                            <span className="font-medium">교환</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {entry.a.name}({entry.a.classNum}반) ↔ {entry.b.name}({entry.b.classNum}반)
                          </p>
                        </div>
                      ) : entry.type === 'move' ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="text-emerald-400">→</span>
                            <span className="font-medium">이동</span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {entry.student.name}: {entry.student.classNum}반 → {entry.toClass}반
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Wand2 size={10} className="text-emerald-400" />
                            <span className="font-medium">자동배치</span>
                          </div>
                          <p className="text-[11px] text-slate-500">{entry.label}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* 하단 통계 바 */}
      {students.length > 0 && (
        <div className="px-6 py-2 border-t border-white/5 flex items-center gap-4 flex-shrink-0 bg-surface-950">
          <span className="text-xs text-slate-600">전체 {students.length}명</span>
          <span className="text-xs text-slate-600">{classNums.length}개 반</span>
          {markedIds.size > 0 && <span className="text-xs text-rose-400">요주의 {markedIds.size}명</span>}
          {highlightPrevClass && <span className="text-xs text-amber-400">{highlightPrevClass}반 출신 강조 중</span>}
          {students.filter(s => s.achievement === 'low').length > 0 && (
            <span className="text-xs text-yellow-600">
              기초학력부진 {students.filter(s => s.achievement === 'low').length}명
            </span>
          )}
          {students.filter(s => s.special).length > 0 && (
            <span className="text-xs text-blue-500">
              특수 {students.filter(s => s.special).length}명
            </span>
          )}
          {students.filter(s => s.transfer).length > 0 && (
            <span className="text-xs text-slate-500">
              전출예정 {students.filter(s => s.transfer).length}명
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-700">더블클릭: 요주의 표시 | 드래그: 교환/이동</span>
        </div>
      )}

      {/* 자동배치 모달 */}
      <AnimatePresence>
        {showAutoAllocModal && (
          <AutoAllocModal
            onClose={() => setShowAutoAllocModal(false)}
            onApply={applyAutoAlloc}
            currentClassCount={classNums.length || 5}
          />
        )}
      </AnimatePresence>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-700 text-white text-sm px-4 py-2 rounded-xl shadow-xl border border-white/10 z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
