import { useEffect, useState } from 'react'
import { getSchoolHubSourceStatus, type HubResource } from '../services/schoolHub'

const labels: Partial<Record<HubResource, string>> = { timetable: '교사 시간표', studentTimetable: '학생 시간표', studentRoster: '학생 명렬', staffRoster: '교직원 명렬', staffChecklists: '공유 업무', timetableChanges: '교체·대강', timetableOverrides: '일일 예외', committees: '위원회', sharedNeis: '공유 NEIS' }
const stamp = (value: number | null) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value) : '조회 기록 없음'
export default function SchoolDataStatus({ resources }: { resources: HubResource[] }) {
  const [, redraw] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => redraw(value => value + 1), 5000); return () => window.clearInterval(timer) }, [])
  const statuses = getSchoolHubSourceStatus(resources)
  const review = statuses.filter(item => item.state !== 'fresh').length
  return <details className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
    <summary className="cursor-pointer font-semibold">공유 자료 상태 · {review ? `이전 자료·미조회 ${review}개` : '자료 수신 정상'} · 출처별 보기</summary>
    <p className="my-2 text-[10px] text-slate-500">현재 화면이 사용하는 공유 자료의 확인·수신 시각입니다. 원본 작성 시각이나 시트 입력 완료를 의미하지 않습니다.</p>
    <ul className="grid gap-1 sm:grid-cols-2">{statuses.map(item => <li key={item.resource} className="rounded bg-slate-50 px-2 py-1"><b>{labels[item.resource] || item.resource}</b> · <span className={item.state === 'fresh' ? 'text-emerald-800' : 'text-amber-900'}>{item.state === 'fresh' ? '정상 수신' : item.state === 'cached' ? '이전 자료' : '미조회·확인 필요'}</span><br />확인 {stamp(item.checkedAt)} · 수신 {stamp(item.receivedAt)}{item.failedAt > (item.checkedAt || 0) && <span> · 마지막 조회 실패 {stamp(item.failedAt)}</span>}</li>)}</ul>
  </details>
}
