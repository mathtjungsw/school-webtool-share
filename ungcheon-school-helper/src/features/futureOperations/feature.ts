import type { FutureOperationsTab } from './types'

/**
 * 시험판 내부 기능 플래그입니다. 사이드바에는 연결하지 않으며, 정식 공개 시에만 true로 변경합니다.
 */
export const FEATURE_FUTURE_OPERATIONS = false

export const FUTURE_OPERATIONS_MENU = {
  id: 'future_operations',
  label: '학교 운영 확장 도구',
  description: '통합 알림, 예약, 일정 밀집도, 자료수합, 당번 배정, 인수인계를 관리합니다.',
  visible: FEATURE_FUTURE_OPERATIONS,
  defaultTab: 'notifications' as FutureOperationsTab,
  searchKeywords: ['통합 알림', '시설 예약', '기자재 예약', '수행평가', '자료수합', '당번', '인수인계'],
} as const
