import fs from 'node:fs'
import { parseNeisVolunteerWorkbook } from '../src/services/volunteerWork'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const inputPath = process.argv[2]
if (!inputPath) throw new Error('사용법: tsx scripts/verify-neis-volunteer-parser.ts <나이스.xlsx>')

const bytes = Array.from(fs.readFileSync(inputPath))
const records = parseNeisVolunteerWorkbook(bytes)
const students = new Map<string, string>()
records.forEach(record => students.set(record.studentId, record.name))

assert(records.length > 0, '봉사활동 기록을 읽지 못했습니다.')
assert([...students.keys()].every(studentId => /^[1-3]\d{3}$/.test(studentId)), '4자리 학번이 아닌 값이 있습니다.')
assert(students.get('1101') === '강보경', '1학년 1반 1번을 1101로 만들지 못했습니다.')
assert(students.get('1110') === '박찬주', '1학년 1반 10번을 1110으로 만들지 못했습니다.')
assert(students.get('1131') === '조유성', '1학년 1반 31번을 1131로 만들지 못했습니다.')

console.log(`PASS 실제 나이스 봉사활동 파일: ${students.size}명 · ${records.length}개 기록 · ${[...students.keys()].slice(0, 3).join(', ')} … ${[...students.keys()].at(-1)}`)
