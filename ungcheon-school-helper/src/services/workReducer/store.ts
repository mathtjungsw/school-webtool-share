// 업무경감 데이터 로드/저장 (electron-store)
import { WR_KEYS, type WRData, type Student, type Teacher, type Lesson, emptyWRData } from './types'

export async function loadWRData(): Promise<WRData> {
  const e = window.electron
  if (!e) return emptyWRData()
  const [school, students, teachers, timetable, sets] = await Promise.all([
    e.configGet(WR_KEYS.school),
    e.configGet(WR_KEYS.students),
    e.configGet(WR_KEYS.teachers),
    e.configGet(WR_KEYS.timetable),
    e.configGet(WR_KEYS.sets),
  ])
  return {
    school: (school as string) ?? '',
    students: (students as Student[]) ?? [],
    teachers: (teachers as Teacher[]) ?? [],
    timetable: (timetable as Lesson[]) ?? [],
    sets: (sets as string[]) ?? [],
  }
}

export async function saveStudents(v: Student[]) { await window.electron?.configSet(WR_KEYS.students, v) }
export async function saveTeachers(v: Teacher[]) { await window.electron?.configSet(WR_KEYS.teachers, v) }
export async function saveTimetable(v: Lesson[]) { await window.electron?.configSet(WR_KEYS.timetable, v) }
export async function saveSets(v: string[]) { await window.electron?.configSet(WR_KEYS.sets, v) }
export async function saveSchool(v: string) { await window.electron?.configSet(WR_KEYS.school, v) }
