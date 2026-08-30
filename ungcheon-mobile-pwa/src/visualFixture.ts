import type { DashboardPayload } from './types'

export const VISUAL_NAME = '홍길동'
export function visualFixture(today: string): DashboardPayload {
  const dayIndex = Math.max(0, Math.min(4, new Date(`${today}T12:00:00`).getDay() - 1))
  const slots = Array.from({ length: 35 }, () => ({ value: '', locked: false }))
  slots[dayIndex * 7] = { value: '1-2\n국어', locked: false }
  slots[dayIndex * 7 + 2] = { value: '2-4\n문학', locked: false }
  slots[dayIndex * 7 + 4] = { value: '3-1\n독서', locked: false }
  const tomorrowValue = new Date(`${today}T12:00:00+09:00`)
  tomorrowValue.setUTCDate(tomorrowValue.getUTCDate() + 1)
  const tomorrow = tomorrowValue.toISOString().slice(0, 10)
  const meals = [
    { date: today, mealType: '중식', dishNames: ['현미밥', '쇠고기미역국', '닭갈비', '배추김치', '과일'], calories: '812 Kcal' },
    { date: tomorrow, mealType: '중식', dishNames: ['보리밥', '된장국', '돼지불고기', '깍두기'], calories: '798 Kcal' },
  ]
  return {
    timetable: { version: 1, title: '2026학년도 2학기 주간시간표', uploadedAt: new Date().toISOString(), teachers: [{ name: VISUAL_NAME, label: VISUAL_NAME, load: '국어', slots }] },
    committees: { events: [{ id: 'demo-committee', committeeName: '교육과정위원회', title: '2학기 교육과정 협의회', date: today, startTime: '15:40', endTime: '16:20', location: '회의실', memberNames: [VISUAL_NAME] }] },
    changes: [],
    bundle: { teacherTimetable: null, committeeEvents: [], timetableChanges: [], fetchedAt: new Date().toISOString(), contractVersion: 3, meals, todayMeals: meals.filter(meal => meal.date === today), events: [{ date: today, title: '교직원 협의회 및 부서별 전달사항', source: 'weekly', label: '교무기획부' }, { date: today, title: '동아리 활동(5·6교시)', source: 'creative', label: '창체' }, { date: today, title: '등교지도 · 정문', source: 'gateDuty', label: '등교지도', time: '08:15~08:25' }] },
    cachedAt: new Date().toISOString(),
  }
}
