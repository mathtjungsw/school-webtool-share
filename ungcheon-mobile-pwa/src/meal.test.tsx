import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MealPanel } from './App'

describe('오늘 급식 카드', () => {
  it('식사 종류, 메뉴와 열량을 표시한다', () => {
    const view = render(<MealPanel meals={[{ date: '2026-08-24', mealType: '중식', dishNames: ['현미밥', '미역국'], calories: '812 Kcal' }]} />)
    expect(screen.getByRole('heading', { name: '오늘 급식' })).toBeInTheDocument()
    expect(screen.getByText('현미밥')).toBeInTheDocument()
    expect(screen.getByText('812 Kcal')).toBeInTheDocument()
    view.unmount()
  })

  it('선택한 날짜의 급식과 빈 상태를 구분한다', () => {
    const view = render(<MealPanel isToday={false} meals={[{ date: '2026-08-25', mealType: '중식', dishNames: ['보리밥'], calories: '' }]} />)
    expect(screen.getByRole('heading', { name: '선택한 날의 급식' })).toBeInTheDocument()
    expect(screen.getByText('보리밥')).toBeInTheDocument()
    view.rerender(<MealPanel isToday={false} meals={[]} />)
    expect(screen.getByText('선택한 날짜에 공유된 급식 정보가 없습니다.')).toBeInTheDocument()
    view.unmount()
  })

  it('서버 순서와 관계없이 중식을 석식 위에 표시한다', () => {
    render(<MealPanel meals={[
      { date: '2026-09-03', mealType: '석식', dishNames: ['저녁밥'], calories: '' },
      { date: '2026-09-03', mealType: '중식', dishNames: ['점심밥'], calories: '' },
    ]} />)
    const lunch = screen.getByText('중식')
    const dinner = screen.getByText('석식')
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
