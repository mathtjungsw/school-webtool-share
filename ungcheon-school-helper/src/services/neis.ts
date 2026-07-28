import type { MealInfo, ScheduleEvent, TimetableEntry, SchoolInfo, ClassEntry, DeptEntry } from '../types'
import { hubRequest } from './schoolHub'

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function monthRange(year: number, month: number) {
  const from = `${year}${String(month).padStart(2, '0')}01`
  const to = `${year}${String(month).padStart(2, '0')}${new Date(year, month, 0).getDate()}`
  return { from, to }
}

async function fetchNeis(endpoint: string, params: Record<string, string>) {
  const safeParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => [key, value.trim()]),
  )
  const rows = await hubRequest<Record<string, string>[]>({
    action: 'neisQuery',
    endpoint,
    params: safeParams,
  })
  return rows.length ? rows : null
}

export async function searchSchool(name: string): Promise<SchoolInfo[]> {
  const rows = await fetchNeis('schoolInfo', {
    SCHUL_NM: name,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    schoolName: r.SCHUL_NM,
    officeName: r.ATPT_OFCDC_SC_NM,
    officeCode: r.ATPT_OFCDC_SC_CODE,
    schoolCode: r.SD_SCHUL_CODE,
    schoolType: r.SCHUL_KND_SC_NM,
    address: r.ORG_RDNMA,
    phone: r.ORG_TELNO,
  }))
}

export async function getMeal(
  officeCode: string,
  schoolCode: string,
  date?: Date
): Promise<MealInfo[]> {
  const d = fmt(date ?? new Date())
  const rows = await fetchNeis('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    MLSV_YMD: d,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    date: r.MLSV_YMD,
    mealType: r.MMEAL_SC_NM,
    dishNames: r.DDISH_NM?.split('<br/>').map((s: string) => s.replace(/\s*\([\d., ]+\)/g, '').trim()) ?? [],
    calories: r.CAL_INFO,
    ntrInfo: r.NTR_INFO,
  }))
}

export async function getSchedule(
  officeCode: string,
  schoolCode: string,
  year: number,
  month: number
): Promise<ScheduleEvent[]> {
  const { from, to } = monthRange(year, month)
  const rows = await fetchNeis('SchoolSchedule', {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AA_FROM_YMD: from,
    AA_TO_YMD: to,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    date: r.AA_YMD,
    eventName: r.EVENT_NM,
    eventLevel: r.EVENT_CNTNT,
  }))
}

function getEndpoint(schoolType: string) {
  const map: Record<string, string> = {
    '고등학교': 'hisTimetable',
    '중학교': 'misTimetable',
    '초등학교': 'elsTimetable',
    '특수학교': 'spsTimetable',
  }
  return map[schoolType] ?? 'hisTimetable'
}

export async function getTimetable(
  officeCode: string,
  schoolCode: string,
  schoolType: string,
  grade: string,
  classNm: string,
  date?: Date
): Promise<TimetableEntry[]> {
  const d = fmt(date ?? new Date())
  const ep = getEndpoint(schoolType)
  const rows = await fetchNeis(ep, {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AY: d.slice(0, 4),
    SEM: Number(d.slice(4, 6)) <= 7 ? '1' : '2',
    ALL_TI_YMD: d,
    GRADE: grade,
    CLASS_NM: classNm,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    date: r.ALL_TI_YMD ?? d,
    period: Number(r.PERIO),
    subject: r.ITRT_CNTNT,
    teacher: r.TCHR_NM ?? '',
    classroom: r.CLRM_NM ?? '',
  }))
}

export async function getTimetableRange(
  officeCode: string,
  schoolCode: string,
  schoolType: string,
  grade: string,
  classNm: string,
  fromYmd: string,
  toYmd: string
): Promise<TimetableEntry[]> {
  const ep = getEndpoint(schoolType)
  const rows = await fetchNeis(ep, {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AY: fromYmd.slice(0, 4),
    SEM: Number(fromYmd.slice(4, 6)) <= 7 ? '1' : '2',
    TI_FROM_YMD: fromYmd,
    TI_TO_YMD: toYmd,
    GRADE: grade,
    CLASS_NM: classNm,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    date: r.ALL_TI_YMD,
    grade: r.GRADE,
    classNm: r.CLASS_NM,
    period: Number(r.PERIO),
    subject: r.ITRT_CNTNT,
    teacher: r.TCHR_NM ?? '',
    classroom: r.CLRM_NM ?? '',
  }))
}

export async function getSchoolDetail(
  officeCode: string,
  schoolCode: string
): Promise<SchoolInfo | null> {
  const rows = await fetchNeis('schoolInfo', {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
  })
  if (!rows || !rows[0]) return null
  const r = rows[0]
  return {
    schoolName: r.SCHUL_NM,
    officeName: r.ATPT_OFCDC_SC_NM,
    officeCode: r.ATPT_OFCDC_SC_CODE,
    schoolCode: r.SD_SCHUL_CODE,
    schoolType: r.SCHUL_KND_SC_NM,
    address: r.ORG_RDNMA,
    phone: r.ORG_TELNO,
    fax: r.ORG_FAXNO || undefined,
    website: r.HMPG_ADRES || undefined,
    region: r.LCTN_SC_NM || undefined,
    zipcode: r.ORG_RDNZC || undefined,
    coedu: r.COEDU_SC_NM || undefined,
    founded: r.FOND_YMD || undefined,
    foundType: r.FOND_SC_NM || undefined,
  }
}

export async function getClassInfo(
  officeCode: string,
  schoolCode: string
): Promise<ClassEntry[]> {
  const year = new Date().getFullYear().toString()
  const rows = await fetchNeis('classInfo', {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AY: year,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    grade: r.GRADE,
    classNm: r.CLASS_NM,
    dept: r.DDDEP_NM ?? '',
  }))
}

export async function getDeptInfo(
  officeCode: string,
  schoolCode: string
): Promise<DeptEntry[]> {
  const year = new Date().getFullYear().toString()
  const rows = await fetchNeis('schoolMajorinfo', {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AY: year,
  })
  if (!rows) return []
  return rows.map((r: Record<string, string>) => ({
    name: r.DDDEP_NM ?? '',
    series: r.ORD_SC_NM ?? '',
  }))
}
