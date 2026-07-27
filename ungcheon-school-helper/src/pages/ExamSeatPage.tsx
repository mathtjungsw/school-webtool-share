import { useState, useRef } from 'react'
import { Shuffle, Download, RefreshCw, Plus, Trash2, Settings2, Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import clsx from 'clsx'

interface Student {
  id: string
  name: string
  number: string
  subject?: string  // 선택과목 (고교)
  special: boolean
}

interface Classroom {
  id: string
  name: string
  rows: number
  cols: number
  seats: Student[][]
}

type SortType = 'number' | 'name' | 'random'

function makeStudent(number = '', name = '', subject = ''): Student {
  return { id: crypto.randomUUID(), number, name, subject, special: false }
}

function parseBulk(text: string): Student[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[\t,\s]+/)
      if (parts.length >= 2) return makeStudent(parts[0], parts.slice(1).join(' '))
      return makeStudent('', parts[0])
    })
}

function sortStudents(students: Student[], type: SortType): Student[] {
  const specials = students.filter(s => s.special)
  const normals  = students.filter(s => !s.special)
  let sorted: Student[]
  if (type === 'number') {
    sorted = [...normals].sort((a, b) => Number(a.number || 999) - Number(b.number || 999))
  } else if (type === 'name') {
    sorted = [...normals].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  } else {
    sorted = [...normals].sort(() => Math.random() - 0.5)
  }
  return [...specials, ...sorted]
}

function buildGrid(students: Student[], rows: number, cols: number): Student[][] {
  const grid: Student[][] = []
  let idx = 0
  for (let r = 0; r < rows; r++) {
    const row: Student[] = []
    for (let c = 0; c < cols; c++) {
      row.push(idx < students.length ? students[idx++] : { id: '', name: '', number: '', special: false })
    }
    grid.push(row)
  }
  return grid
}

// NEIS 학생편성현황 Excel 파싱 (수강생편성 → 학생편성현황)
function parseNeisExcel(file: File): Promise<Student[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][]

        // NEIS 학생편성현황 형식: 헤더를 찾아 번호·성명 열 위치 파악
        let numCol = -1, nameCol = -1, headerRow = -1

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map(c => String(c ?? ''))
          const numIdx = row.findIndex(c => c.includes('번호') || c === 'No' || c === 'NO')
          const nameIdx = row.findIndex(c => c.includes('성명') || c.includes('이름') || c === '학생명')
          if (numIdx >= 0 && nameIdx >= 0) {
            numCol = numIdx; nameCol = nameIdx; headerRow = i
            break
          }
        }

        // 헤더 못 찾으면 두 번째 행부터 데이터로 가정 (첫 행은 제목/메타 가능성)
        if (headerRow < 0) {
          numCol = 0; nameCol = 1; headerRow = 1
        }

        const students: Student[] = []
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[nameCol]) continue
          const name = String(row[nameCol]).trim()
          const num  = String(row[numCol] ?? '').trim()
          if (!name || name === '성명' || name === '이름') continue
          students.push(makeStudent(num, name))
        }
        resolve(students)
      } catch (err) {
        reject(new Error('Excel 파싱 실패: ' + (err instanceof Error ? err.message : String(err))))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

// Excel 다운로드
function downloadExcel(classrooms: Classroom[], title: string) {
  const wb = XLSX.utils.book_new()

  classrooms.forEach(room => {
    const data: (string | number)[][] = [
      [`${room.name} 좌석배치표 — ${title}`],
      [],
      ['', ...Array.from({ length: room.cols }, (_, i) => `${i + 1}열`), ''],
    ]

    // 교단 방향 행
    data.push(['← 교단 / 칠판', ...Array(room.cols).fill(''), ''])

    room.seats.forEach((row, ri) => {
      const rowData: string[] = [`${ri + 1}행`]
      row.forEach(seat => {
        rowData.push(seat.name ? `${seat.number ? seat.number + '번 ' : ''}${seat.name}` : '')
      })
      data.push(rowData)
    })

    data.push([])
    const occupied = room.seats.flat().filter(s => s.name).length
    data.push([`총 ${occupied}명`, ...Array(room.cols).fill(''), ''])

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 8 }, ...Array(room.cols).fill({ wch: 12 })]
    XLSX.utils.book_append_sheet(wb, ws, room.name.slice(0, 31))
  })

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `좌석배치_${title || '시험'}_${today}.xlsx`)
}

export default function ExamSeatPage() {
  const [students, setStudents] = useState<Student[]>([makeStudent('1', '홍길동'), makeStudent('2', '김철수')])
  const [rows, setRows] = useState(6)
  const [cols, setCols] = useState(5)
  const [roomCount, setRoomCount] = useState(1)
  const [sortType, setSortType] = useState<SortType>('number')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addStudent = () => setStudents(s => [...s, makeStudent(String(s.length + 1), '')])
  const removeStudent = (id: string) => setStudents(s => s.filter(x => x.id !== id))
  const updateStudent = (id: string, patch: Partial<Student>) =>
    setStudents(s => s.map(x => x.id === id ? { ...x, ...patch } : x))

  const applyBulk = () => {
    const parsed = parseBulk(bulkText)
    if (parsed.length) setStudents(parsed)
    setShowBulk(false); setBulkText('')
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadMsg('')
    try {
      const parsed = await parseNeisExcel(file)
      if (!parsed.length) throw new Error('학생 데이터를 찾을 수 없습니다.')
      setStudents(parsed)
      setUploadMsg(`✅ ${parsed.length}명 불러오기 완료`)
    } catch (err) {
      setUploadMsg(`❌ ${err instanceof Error ? err.message : '파싱 실패'}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const generate = () => {
    const sorted = sortStudents(students.filter(s => s.name), sortType)
    if (!sorted.length) return
    const effectiveRoomCount = Math.min(roomCount, sorted.length)
    const seatsPerRoom = Math.ceil(sorted.length / effectiveRoomCount)
    const rooms: Classroom[] = []

    for (let i = 0; i < effectiveRoomCount; i++) {
      const chunk = sorted.slice(i * seatsPerRoom, (i + 1) * seatsPerRoom)
      rooms.push({
        id: crypto.randomUUID(),
        name: effectiveRoomCount === 1 ? '시험실' : `시험실 ${i + 1}`,
        rows,
        cols,
        seats: buildGrid(chunk, rows, cols),
      })
    }
    setClassrooms(rooms)
  }

  const totalStudents = students.filter(s => s.name).length
  const seatsPerRoom = rows * cols

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="page-title">좌석배치</h1>
        <p className="page-subtitle">NEIS 학생편성현황 Excel 업로드 또는 직접 입력 후 시험실별 좌석표를 자동 생성합니다</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 좌측: 입력 */}
        <div className="col-span-2 space-y-4">
          {/* 시험 정보 */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-white text-sm">시험 정보</h3>
            <div>
              <label className="field-label">시험명</label>
              <input className="input" placeholder="예: 2025학년도 1학기 1차 지필평가"
                value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="field-label">행 수</label>
                <input type="number" min="1" max="20" className="input text-center"
                  value={rows} onChange={e => setRows(Number(e.target.value))} />
              </div>
              <div>
                <label className="field-label">열 수</label>
                <input type="number" min="1" max="15" className="input text-center"
                  value={cols} onChange={e => setCols(Number(e.target.value))} />
              </div>
              <div>
                <label className="field-label">시험실 수</label>
                <input type="number" min="1" max="20" className="input text-center"
                  value={roomCount} onChange={e => setRoomCount(Math.max(1, Number(e.target.value)))} />
              </div>
            </div>
            <div className="text-xs text-slate-500 bg-surface-900 rounded-lg px-3 py-2">
              시험실당 최대 {seatsPerRoom}석 · {totalStudents}명 → {roomCount}실 (실당 약 {Math.ceil(totalStudents / roomCount)}명)
            </div>
          </div>

          {/* NEIS Excel 업로드 */}
          <div className="card space-y-2">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileSpreadsheet size={14} className="text-emerald-400" />
              NEIS Excel 업로드
            </h3>
            <p className="text-xs text-slate-500">
              NEIS → 수강생편성 → 학생편성현황 Excel 파일을 업로드하면 학생 명단이 자동으로 불러와집니다.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              className="hidden"
              onChange={handleExcelUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-all text-sm"
            >
              <Upload size={14} />{uploading ? '처리 중...' : 'Excel 파일 선택'}
            </button>
            {uploadMsg && (
              <p className={clsx('text-xs', uploadMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400')}>
                {uploadMsg}
              </p>
            )}
          </div>

          {/* 정렬 + 학생 목록 */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">학생 명단 ({students.length}명)</h3>
              <div className="flex gap-1.5">
                <button onClick={() => setShowBulk(s => !s)}
                  className="btn-ghost text-xs flex items-center gap-1"><Settings2 size={12} />일괄입력</button>
                <button onClick={addStudent}
                  className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} />추가</button>
              </div>
            </div>

            <div className="mb-3">
              <label className="field-label">정렬 방식</label>
              <div className="flex gap-1.5">
                {([['number', '번호순'], ['name', '가나다순'], ['random', '랜덤']] as [SortType, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setSortType(v)}
                    className={clsx('flex-1 py-1.5 rounded-lg text-xs border transition-all',
                      sortType === v
                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                    )}>{l}</button>
                ))}
              </div>
            </div>

            {showBulk && (
              <div className="mb-3 space-y-2">
                <textarea
                  className="input w-full h-28 text-xs font-mono resize-none"
                  placeholder={'번호 이름 형식으로 줄바꿈 입력\n예:\n1 김민준\n2 이서연\n3 박지호'}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                />
                <button onClick={applyBulk} className="btn-primary w-full text-xs py-1.5">적용</button>
              </div>
            )}

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {students.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <input type="text" className="input w-12 text-center text-xs" placeholder="번호"
                    value={s.number} onChange={e => updateStudent(s.id, { number: e.target.value })} />
                  <input type="text" className="input flex-1 text-xs" placeholder="이름"
                    value={s.name} onChange={e => updateStudent(s.id, { name: e.target.value })} />
                  <label className="flex items-center gap-1 cursor-pointer" title="앞자리 우선 배치">
                    <input type="checkbox" checked={s.special}
                      onChange={e => updateStudent(s.id, { special: e.target.checked })}
                      className="w-3 h-3 rounded accent-amber-500" />
                    <span className="text-xs text-amber-400">앞</span>
                  </label>
                  <button onClick={() => removeStudent(s.id)}
                    className="text-red-400 hover:text-red-300 p-0.5"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={generate} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Shuffle size={14} />좌석 배치 생성
            </button>
            <button onClick={() => { setStudents([]); setClassrooms([]) }}
              className="btn-ghost p-2.5" title="초기화">
              <RefreshCw size={14} />
            </button>
          </div>

          {classrooms.length > 0 && (
            <button
              onClick={() => downloadExcel(classrooms, title)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 transition-all text-sm"
            >
              <Download size={14} />Excel 다운로드
            </button>
          )}
        </div>

        {/* 우측: 배치표 */}
        <div className="col-span-3 space-y-4">
          {classrooms.length === 0 ? (
            <div className="card h-64 flex items-center justify-center">
              <div className="text-center text-slate-500">
                <Shuffle size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">학생을 입력하고 좌석 배치 버튼을 누르세요</p>
                <p className="text-xs mt-1 text-slate-600">NEIS Excel 업로드 또는 직접 입력</p>
              </div>
            </div>
          ) : (
            classrooms.map(room => (
              <div key={room.id} className="card overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white text-sm">{room.name}</h3>
                  <span className="text-xs text-slate-500">
                    {room.seats.flat().filter(s => s.name).length}명 / {room.rows}행 {room.cols}열
                  </span>
                </div>
                <div className="text-center mb-2">
                  <div className="inline-block px-4 py-1 bg-surface-800 rounded text-xs text-slate-400 border border-white/10">
                    ▲ 교단 / 칠판 방향
                  </div>
                </div>
                <div className="space-y-1.5">
                  {room.seats.map((row, ri) => (
                    <div key={ri} className="flex gap-1.5">
                      {row.map((seat, ci) => (
                        <div key={ci} className={clsx(
                          'flex-1 rounded-lg border text-center py-2 px-1 min-w-0',
                          seat.name
                            ? seat.special
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                              : 'bg-surface-800 border-white/10 text-slate-200'
                            : 'bg-surface-900 border-white/5 opacity-30'
                        )}>
                          {seat.name ? (
                            <>
                              <p className="text-[10px] text-slate-500 leading-none">{seat.number}</p>
                              <p className="text-xs font-medium mt-0.5 truncate">{seat.name}</p>
                            </>
                          ) : (
                            <p className="text-xs text-slate-600">빈자리</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
