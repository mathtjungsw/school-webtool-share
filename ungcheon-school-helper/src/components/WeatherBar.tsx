import { type WeatherData } from './useWeather'

function pmGrade(pm: number, type: 'pm10' | 'pm2_5') {
  if (pm < 0) return { text: '-', color: 'text-slate-500' }
  const [g, b, vb] = type === 'pm10' ? [30, 80, 150] : [15, 35, 75]
  if (pm <= g)  return { text: '좋음',     color: 'text-sky-400' }
  if (pm <= b)  return { text: '보통',     color: 'text-emerald-400' }
  if (pm <= vb) return { text: '나쁨',     color: 'text-amber-400' }
  return          { text: '매우나쁨', color: 'text-red-400' }
}

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return '오늘'
  if (index === 1) return '내일'
  const d = new Date(dateStr)
  return ['일','월','화','수','목','금','토'][d.getDay()]
}

// ─── 오늘 날씨 뷰 (data 존재 가정) ───────────────────────────────────
export function WeatherTodayView({ data, displayName, label }: {
  data: WeatherData
  displayName: string
  label?: string
}) {
  const pm10Grade  = pmGrade(data.pm10, 'pm10')
  const pm2_5Grade = pmGrade(data.pm2_5, 'pm2_5')

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl leading-none">{data.emoji}</span>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-white">{data.temp}°</span>
            <span className="text-xs text-slate-300">{data.weatherDesc}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
            {label && <span className="text-sky-400 font-medium">{label}</span>}
            {label && <span className="text-white/20">·</span>}
            <span>{displayName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-1 flex-wrap">
        <span>
          <span className="text-red-400 font-medium">↑{data.maxTemp}°</span>
          {' '}
          <span className="text-blue-400 font-medium">↓{data.minTemp}°</span>
        </span>
        <span className="text-white/15">|</span>
        <span>습도 <span className="text-slate-300">{data.humidity}%</span></span>
        <span className="text-white/15">|</span>
        <span>풍속 <span className="text-slate-300">{data.wind}m/s</span></span>
      </div>

      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-slate-500">미세</span>
        <span className={pm10Grade.color}>
          {data.pm10 >= 0 ? `${data.pm10}㎍` : '-'} {pm10Grade.text}
        </span>
        <span className="text-white/15">|</span>
        <span className="text-slate-500">초미세</span>
        <span className={pm2_5Grade.color}>
          {data.pm2_5 >= 0 ? `${data.pm2_5}㎍` : '-'} {pm2_5Grade.text}
        </span>
      </div>
    </div>
  )
}

// ─── 이후 기간(주간) 예보 뷰 (data 존재 가정) ────────────────────────
export function WeatherForecastView({ data }: { data: WeatherData }) {
  if (data.weekly.length === 0) {
    return <p className="text-center text-slate-500 text-xs py-4">예보 정보가 없습니다.</p>
  }
  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex gap-1 min-w-max">
        {data.weekly.map((day, i) => (
          <div
            key={day.date}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg min-w-[44px] ${i === 0 ? 'bg-white/5' : ''}`}
          >
            <span className={`text-[10px] font-semibold ${i === 0 ? 'text-sky-400' : 'text-slate-400'}`}>
              {dayLabel(day.date, i)}
            </span>
            <span className="text-lg leading-none">{day.emoji}</span>
            <span className="text-[10px] text-slate-400 text-center leading-snug">{day.weatherDesc}</span>
            <span className="text-[10px] text-red-400 font-medium">↑{day.maxTemp}°</span>
            <span className="text-[10px] text-blue-400 font-medium">↓{day.minTemp}°</span>
          </div>
        ))}
      </div>
    </div>
  )
}
