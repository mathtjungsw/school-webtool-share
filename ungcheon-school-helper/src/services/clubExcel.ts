import * as XLSX from 'xlsx'
import type { Club, ClubStudent } from '../types/club'

function makeId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

// 학생 엑셀 가져오기
// 헤더: 학년, 반, 번호, 이름  (순서 무관, 컬럼명으로 찾음)
export function importStudentsXlsx(buffer: ArrayBuffer): ClubStudent[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' })

  const students: ClubStudent[] = []
  for (const row of rows) {
    const grade = Number(row['학년'] ?? row['grade'] ?? 0)
    const classNum = String(row['반'] ?? row['class'] ?? row['학급'] ?? '')
    const number = Number(row['번호'] ?? row['no'] ?? row['번'] ?? 0)
    const name = String(row['이름'] ?? row['성명'] ?? row['name'] ?? '').trim()
    if (!name || !grade) continue
    students.push({
      id: makeId(),
      grade,
      classNum: classNum || '1',
      number,
      name,
      prefs: [],
      ts: null,
      assignedClub: null,
      isExtra: false,
    })
  }
  return students
}

const studentOrder = (a: ClubStudent, b: ClubStudent) =>
  a.grade - b.grade || Number(a.classNum) - Number(b.classNum) || a.number - b.number

const wbToBytes = (wb: XLSX.WorkBook): number[] =>
  Array.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array)

const safeSheetName = (name: string, used: Set<string>): string => {
  // 엑셀 시트명 제약: 31자, 특수문자 \ / ? * [ ] : 제거, 중복 방지
  let base = (name || '시트').replace(/[\\/?*[\]:]/g, '').slice(0, 28) || '시트'
  let n = base
  let i = 2
  while (used.has(n)) { n = `${base.slice(0, 25)}_${i}`; i++ }
  used.add(n)
  return n
}

// 1) 전체 배정 명렬 (학번순 1개 시트)
export function exportRosterXlsx(clubs: Club[], students: ClubStudent[]): number[] {
  const wb = XLSX.utils.book_new()
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))
  const rows: (string | number)[][] = [
    ['연번', '학년', '반', '번호', '이름', '배정 동아리', '지도교사', '1희망', '2희망', '3희망', '비고'],
  ]
  const sorted = [...students].sort(studentOrder)
  sorted.forEach((s, i) => {
    const club = s.assignedClub ? clubMap[s.assignedClub] : null
    rows.push([
      i + 1, s.grade, s.classNum, s.number, s.name,
      club?.name ?? '미배정', club?.instructor ?? '',
      s.prefs[0] ? (clubMap[s.prefs[0]]?.name ?? '') : '',
      s.prefs[1] ? (clubMap[s.prefs[1]]?.name ?? '') : '',
      s.prefs[2] ? (clubMap[s.prefs[2]]?.name ?? '') : '',
      s.isExtra ? '추가배정' : '',
    ])
  })
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, ws, '전체 배정 명렬')
  return wbToBytes(wb)
}

// 2) 동아리별 명렬 (동아리마다 시트)
export function exportByClubXlsx(clubs: Club[], students: ClubStudent[]): number[] {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const c of clubs) {
    const members = students.filter(s => s.assignedClub === c.id).sort(studentOrder)
    const rows: (string | number)[][] = [
      [`${c.name}  (지도교사: ${c.instructor || '-'} / 장소: ${c.location || '-'} / 정원 ${c.capacity}명 / 배정 ${members.length}명)`],
      ['연번', '학년', '반', '번호', '이름', '비고'],
    ]
    members.forEach((s, i) => rows.push([i + 1, s.grade, s.classNum, s.number, s.name, s.isExtra ? '추가' : '']))
    if (!members.length) rows.push(['', '', '', '', '배정 인원 없음', ''])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 6 }, { wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }, { wch: 8 }]
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(c.name, used))
  }
  if (!clubs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['동아리 없음']]), '없음')
  return wbToBytes(wb)
}

// 3) 학급별 배정표 (학년·반마다 시트)
export function exportByClassXlsx(clubs: Club[], students: ClubStudent[]): number[] {
  const wb = XLSX.utils.book_new()
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))
  const used = new Set<string>()
  const grades = [...new Set(students.map(s => s.grade))].sort((a, b) => a - b)
  for (const g of grades) {
    const classes = [...new Set(students.filter(s => s.grade === g).map(s => s.classNum))].sort((a, b) => Number(a) - Number(b))
    for (const cls of classes) {
      const members = students.filter(s => s.grade === g && s.classNum === cls).sort((a, b) => a.number - b.number)
      if (!members.length) continue
      const rows: (string | number)[][] = [
        [`${g}학년 ${cls}반 동아리 배정표`],
        ['번호', '이름', '배정 동아리', '지도교사', '비고'],
      ]
      members.forEach(s => {
        const club = s.assignedClub ? clubMap[s.assignedClub] : null
        rows.push([s.number, s.name, club?.name ?? '미배정', club?.instructor ?? '', s.isExtra ? '추가' : ''])
      })
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 8 }]
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`${g}-${cls}`, used))
    }
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['데이터 없음']]), '없음')
  return wbToBytes(wb)
}

// 결과 엑셀 내보내기 (전체 통합: 학생별 + 동아리별 + 통계)
export function exportResultXlsx(clubs: Club[], students: ClubStudent[]): number[] {
  const wb = XLSX.utils.book_new()
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))

  // 시트 1: 학생별 결과
  const s1Rows: (string | number)[][] = [
    ['연번', '학년', '반', '번호', '이름', '배정 동아리', '지도교사', '1희망', '2희망', '3희망', '비고'],
  ]
  const sorted = [...students].sort(
    (a, b) => a.grade - b.grade || Number(a.classNum) - Number(b.classNum) || a.number - b.number
  )
  sorted.forEach((s, i) => {
    const club = s.assignedClub ? clubMap[s.assignedClub] : null
    s1Rows.push([
      i + 1,
      s.grade,
      s.classNum,
      s.number,
      s.name,
      club?.name ?? '미배정',
      club?.instructor ?? '',
      s.prefs[0] ? (clubMap[s.prefs[0]]?.name ?? '') : '',
      s.prefs[1] ? (clubMap[s.prefs[1]]?.name ?? '') : '',
      s.prefs[2] ? (clubMap[s.prefs[2]]?.name ?? '') : '',
      s.isExtra ? '추가배정' : '',
    ])
  })
  const ws1 = XLSX.utils.aoa_to_sheet(s1Rows)
  ws1['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, ws1, '학생별 결과')

  // 시트 2: 동아리별 명단
  const s2Rows: (string | number)[][] = [
    ['동아리명', '지도교사', '장소', '정원', '배정인원', '학년', '반', '번호', '이름'],
  ]
  for (const c of clubs) {
    const members = sorted.filter(s => s.assignedClub === c.id)
    if (members.length === 0) {
      s2Rows.push([c.name, c.instructor, c.location, c.capacity, 0, '', '', '', ''])
    } else {
      members.forEach((s, i) => {
        s2Rows.push([
          i === 0 ? c.name : '',
          i === 0 ? c.instructor : '',
          i === 0 ? c.location : '',
          i === 0 ? c.capacity : '',
          i === 0 ? members.length : '',
          s.grade, s.classNum, s.number, s.name,
        ])
      })
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows)
  ws2['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 5 }, { wch: 7 }, { wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, '동아리별 명단')

  // 시트 3: 배정 통계
  const s3Rows: (string | number)[][] = [
    ['동아리명', '지도교사', '장소', '정원', '배정인원', '1희망 배정', '충원율(%)'],
  ]
  for (const c of clubs) {
    const members = students.filter(s => s.assignedClub === c.id)
    const wish1 = members.filter(s => s.prefs[0] === c.id).length
    s3Rows.push([
      c.name, c.instructor, c.location, c.capacity, members.length, wish1,
      c.capacity > 0 ? Math.round((members.length / c.capacity) * 100) : 0,
    ])
  }
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows)
  ws3['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 5 }, { wch: 7 }, { wch: 9 }, { wch: 9 }]
  XLSX.utils.book_append_sheet(wb, ws3, '통계')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
  return Array.from(out)
}

// 동아리 일괄 입력 엑셀 템플릿 생성
export function exportClubTemplate(): number[] {
  const wb = XLSX.utils.book_new()
  const rows = [
    ['동아리명', '지도교사', '장소', '정원', '대상학년(예:1,2,3)'],
    ['밴드부', '김선생', '음악실', 20, '1,2,3'],
    ['사진부', '이선생', '미술실', 15, '1,2'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 5 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws, '동아리목록')
  return Array.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array)
}

// 동아리 일괄 입력 엑셀 불러오기
export function importClubsXlsx(buffer: ArrayBuffer): Omit<Club, 'id'>[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' })
  return rows
    .map(r => ({
      name: String(r['동아리명'] ?? r['이름'] ?? r['name'] ?? '').trim(),
      instructor: String(r['지도교사'] ?? r['교사'] ?? '').trim(),
      location: String(r['장소'] ?? r['room'] ?? '').trim(),
      capacity: Number(r['정원'] ?? r['capacity'] ?? 0),
      targetGrades: String(r['대상학년'] ?? '1,2,3')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => n > 0),
    }))
    .filter(c => c.name)
}

// 학생 일괄 입력 엑셀 템플릿
export function exportStudentTemplate(): number[] {
  const wb = XLSX.utils.book_new()
  const rows = [
    ['학년', '반', '번호', '이름'],
    [1, 1, 1, '홍길동'],
    [1, 1, 2, '김철수'],
    [1, 2, 1, '이영희'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws, '학생명렬')
  return Array.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array)
}
