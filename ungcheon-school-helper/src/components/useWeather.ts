import { useEffect, useState } from 'react'
import { WEATHER_COORDS, wmoToWeather, extractSigungu } from '../data/weatherCoords'

export interface DailyForecast {
  date: string
  emoji: string
  weatherDesc: string
  maxTemp: number
  minTemp: number
}

export interface WeatherData {
  temp: number
  maxTemp: number
  minTemp: number
  humidity: number
  wind: string
  emoji: string
  weatherDesc: string
  pm10: number
  pm2_5: number
  weekly: DailyForecast[]
}

// 날씨/대기질을 1회 fetch하는 공유 훅 (컴포넌트와 분리 → Fast Refresh 경계 보존)
export function useWeather(address?: string, locationName?: string) {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    let cancelled = false

    let key: string
    if (address) {
      key = extractSigungu(address)
    } else if (locationName) {
      key = WEATHER_COORDS[locationName] ? locationName : extractSigungu(locationName)
    } else {
      setLoading(false)
      return
    }

    const coords = WEATHER_COORDS[key]
    if (!coords) { setDisplayName(''); setData(null); setLoading(false); return }

    setDisplayName(key.includes('_') ? key.split('_')[1] : key)
    setLoading(true)

    const [lat, lon] = coords
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=Asia/Seoul` +
      `&forecast_days=7`

    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=pm10,pm2_5` +
      `&timezone=Asia/Seoul`

    const doFetch = (url: string): Promise<unknown> =>
      window.electron?.fetchWeather
        ? window.electron.fetchWeather(url)
        : fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })

    Promise.allSettled([doFetch(weatherUrl), doFetch(aqUrl)])
      .then(([weatherResult, aqResult]) => {
        if (cancelled) return
        if (weatherResult.status === 'rejected') { setData(null); return }
        const j = weatherResult.value as Record<string, unknown>
        const cur = j.current as Record<string, number> | undefined
        if (!cur) { setData(null); return }

        const daily = j.daily as {
          time: string[]
          weather_code: number[]
          temperature_2m_max: number[]
          temperature_2m_min: number[]
        } | undefined

        // M-1: non-null assertion 제거 — 옵셔널 체이닝으로 안전하게 접근
        const weekly: DailyForecast[] = (daily?.time ?? []).map((dateStr, i) => {
          const { emoji, label: weatherDesc } = wmoToWeather(daily?.weather_code?.[i] ?? 0)
          return {
            date: dateStr,
            emoji,
            weatherDesc,
            maxTemp: Math.round(daily?.temperature_2m_max?.[i] ?? 0),
            minTemp: Math.round(daily?.temperature_2m_min?.[i] ?? 0),
          }
        })

        const code = cur.weather_code ?? cur.weathercode ?? 0
        const aqValue = aqResult.status === 'fulfilled' ? aqResult.value : null
        const aq = (aqValue as Record<string, unknown> | null)?.current as Record<string, number> | undefined
        const { emoji, label: weatherDesc } = wmoToWeather(code)

        setData({
          temp:        Math.round(cur.temperature_2m ?? 0),
          maxTemp:     weekly[0]?.maxTemp ?? Math.round(cur.temperature_2m ?? 0),
          minTemp:     weekly[0]?.minTemp ?? Math.round(cur.temperature_2m ?? 0),
          humidity:    Math.round(cur.relative_humidity_2m ?? 0),
          wind:        (cur.wind_speed_10m ?? 0).toFixed(1),
          pm10:        Math.round(aq?.pm10 ?? -1),
          pm2_5:       Math.round(aq?.pm2_5 ?? -1),
          emoji,
          weatherDesc,
          weekly,
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [address, locationName])

  return { data, loading, displayName }
}
