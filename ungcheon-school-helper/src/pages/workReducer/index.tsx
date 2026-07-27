// 업무경감 도우미 — 메인 (탭 라우팅)
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand2, Database, CalendarDays, Users, FileText } from 'lucide-react'
import clsx from 'clsx'
import { type WRData, emptyWRData } from '../../services/workReducer/types'
import { loadWRData } from '../../services/workReducer/store'
import { PrintStyles } from './shared'
import DataTab from './DataTab'
import TimetableTab from './TimetableTab'
import RosterTab from './RosterTab'
import FormsTab from './FormsTab'

type Tab = 'data' | 'timetable' | 'roster' | 'forms'
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'data', label: '데이터', icon: Database },
  { id: 'timetable', label: '시간표 도구', icon: CalendarDays },
  { id: 'roster', label: '명렬표 출력', icon: Users },
  { id: 'forms', label: '공식 양식', icon: FileText },
]

export default function WorkReducerPage() {
  const [tab, setTab] = useState<Tab>('data')
  const [data, setData] = useState<WRData>(emptyWRData())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadWRData().then((d) => {
      setData(d)
      setLoaded(true)
    })
  }, [])

  const update = (patch: Partial<WRData>) => setData((d) => ({ ...d, ...patch }))

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-slate-500 text-sm">불러오는 중…</div>
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5">
        <h1 className="page-title flex items-center gap-2"><Wand2 size={20} className="text-emerald-400" />업무경감 도우미</h1>
        <p className="page-subtitle">명렬표·시간표를 가져와 개인시간표·공강 찾기·수업변경(세트수업 동시교체)·명렬표 출력을 자동화합니다</p>
        <p className="text-[11px] text-slate-500 mt-1">원본 양식 「업무경감양식모음」 제작: <span className="text-slate-400 font-medium">구두방장선생님</span> · 본 기능은 해당 양식을 앱으로 재구현한 것입니다.</p>
      </div>

      <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-5 max-w-xl">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center',
                tab === t.id ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'data' && <DataTab data={data} update={update} />}
          {tab === 'timetable' && <TimetableTab data={data} update={update} />}
          {tab === 'roster' && <RosterTab data={data} />}
          {tab === 'forms' && <FormsTab data={data} />}
        </motion.div>
      </AnimatePresence>

      <PrintStyles />
    </div>
  )
}
