import type { MealInfo, ScheduleEvent, TimetableEntry, SchoolInfo, ClassEntry, DeptEntry } from '../types'

const BASE_URL = 'https://open.neis.go.kr/hub'
export const NEIS_API_KEY = ((import.meta.env.VITE_NEIS_API_KEY as string) || '').trim()

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function monthRange(year: number, month: number) {
  const from = `${year}${String(month).padStart(2, '0')}01`
  const to = `${year}${String(month).padStart(2, '0')}${new Date(year, month, 0).getDate()}`
  return { from, to }
}

async function fetchNeis(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}/${endpoint}`)
  url.searchParams.set('Type', 'json')
  url.searchParams.set('pSize', '200')
  for (const [k, v] of Object.entries(params)) {
    const value = v.trim()
    if (value) url.searchParams.set(k, value)
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`NEIS 서버 응답 오류 (${res.status})`)
  const json = await res.json()
  const topResult = json.RESULT
  if (topResult?.CODE && topResult.CODE !== 'INFO-000' && topResult.CODE !== 'INFO-200') {
    throw new Error(topResult.MESSAGE || `NEIS API 오류 (${topResult.CODE})`)
  }
  const head = json[endpoint]?.[0]?.head
  const result = head?.find((entry: { RESULT?: { CODE?: string; MESSAGE?: string } }) => entry.RESULT)?.RESULT
  if (result?.CODE === 'INFO-200') return null
  if (result?.CODE && result.CODE !== 'INFO-000') {
    throw new Error(result.MESSAGE || `NEIS API 오류 (${result.CODE})`)
  }
  return json[endpoint]?.[1]?.row ?? null
}

export async function searchSchool(apiKey: string, name: string): Promise<SchoolInfo[]> {
  const rows = await fetchNeis('schoolInfo', {
    KEY: apiKey,
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
  apiKey: string,
  officeCode: string,
  schoolCode: string,
  date?: Date
): Promise<MealInfo[]> {
  const d = fmt(date ?? new Date())
  const rows = await fetchNeis('mealServiceDietInfo', {
    KEY: apiKey,
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
  apiKey: string,
  officeCode: string,
  schoolCode: string,
  year: number,
  month: number
): Promise<ScheduleEvent[]> {
  const { from, to } = monthRange(year, month)
  const rows = await fetchNeis('SchoolSchedule', {
    KEY: apiKey,
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
  apiKey: string,
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
    KEY: apiKey,
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
  apiKey: string,
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
    KEY: apiKey,
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
  apiKey: string,
  officeCode: string,
  schoolCode: string
): Promise<SchoolInfo | null> {
  const rows = await fetchNeis('schoolInfo', {
    KEY: apiKey,
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
  apiKey: string,
  officeCode: string,
  schoolCode: string
): Promise<ClassEntry[]> {
  const year = new Date().getFullYear().toString()
  const rows = await fetchNeis('classInfo', {
    KEY: apiKey,
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
  apiKey: string,
  officeCode: string,
  schoolCode: string
): Promise<DeptEntry[]> {
  const year = new Date().getFullYear().toString()
  const rows = await fetchNeis('schoolMajorinfo', {
    KEY: apiKey,
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
