export interface UngcheonPeriod {
  period: string
  start: string
  end: string
}

export const UNGCHEON_PERIOD_PLAN: UngcheonPeriod[] = [
  { period: '1', start: '08:40', end: '09:30' },
  { period: '2', start: '09:40', end: '10:30' },
  { period: '3', start: '10:40', end: '11:30' },
  { period: '4', start: '11:40', end: '12:30' },
  { period: '5', start: '13:30', end: '14:20' },
  { period: '6', start: '14:30', end: '15:20' },
  { period: '7', start: '15:40', end: '16:30' },
  { period: '8', start: '16:40', end: '17:30' },
]

export const UNGCHEON_LUNCH = {
  after: 4,
  start: '12:30',
  end: '13:30',
} as const

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export const UNGCHEON_PERIOD_RANGES: [number, number, string][] =
  UNGCHEON_PERIOD_PLAN.map(item => [
    toMinutes(item.start),
    toMinutes(item.end),
    item.period,
  ])
