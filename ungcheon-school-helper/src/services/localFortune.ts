const OPENINGS = [
  '익숙한 흐름 속에서', '작은 변화에 귀 기울이면', '차분히 순서를 정하면', '따뜻한 인사를 건네면',
  '잠시 호흡을 고르면', '동료의 한마디를 새겨보면', '오늘의 리듬을 믿으면', '가벼운 마음으로 시작하면',
  '지금 할 수 있는 일에 집중하면', '평소보다 한 걸음 여유를 두면',
]
const MOMENTS = [
  '반가운 실마리가', '기분 좋은 대화가', '작은 성취가', '새로운 아이디어가', '뜻밖의 여유가',
  '든든한 협력이', '편안한 선택이', '산뜻한 전환점이', '유쾌한 발견이', '고마운 순간이',
]
const ENDINGS = [
  '하루를 부드럽게 이어 줍니다.', '생각보다 가까운 곳에서 찾아옵니다.', '다음 일을 가볍게 만들어 줍니다.',
  '오늘의 좋은 기억으로 남습니다.', '천천히 제 모습을 드러냅니다.', '마음을 한결 가볍게 해 줍니다.',
  '알맞은 때에 힘을 보태 줍니다.', '평온한 흐름을 만들어 줍니다.', '작지만 분명한 보람이 됩니다.', '자연스럽게 좋은 방향으로 이어집니다.',
]

const COLORS = [
  ['햇살 노랑', '#facc15'], ['하늘 파랑', '#38bdf8'], ['민트 초록', '#34d399'], ['라벤더', '#a78bfa'],
  ['살구빛', '#fb923c'], ['장미 분홍', '#fb7185'], ['바다 청록', '#2dd4bf'], ['크림 베이지', '#e7d7b5'],
  ['코발트', '#3b82f6'], ['연두빛', '#84cc16'],
] as const

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function buildFortunePhrases() {
  return OPENINGS.flatMap(opening => MOMENTS.flatMap(moment => ENDINGS.map(ending => `${opening} ${moment} ${ending}`)))
}

export function getLocalDailyFortune(teacherName: string, date: string) {
  const seed = hash(`${teacherName.trim() || '웅천고'}:${date}`)
  const phrases = buildFortunePhrases()
  const color = COLORS[Math.floor(seed / 7) % COLORS.length]
  return { phrase: phrases[seed % phrases.length], colorName: color[0], colorHex: color[1], luckyNumber: seed % 9 + 1 }
}
