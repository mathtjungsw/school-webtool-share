import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calculator, RefreshCw, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'

// 교육부 고시 기준 수당 단가 (2024)
const ALLOWANCE_TYPES = [
  { key: 'gyobo', label: '교과보충수업 수당', unit: '시간', rate: 27000, desc: '방과 후 교과보충수업 시간당 (정교사 기준)' },
  { key: 'bangwa', label: '방과후학교 강사비', unit: '시간', rate: 22000, desc: '방과후학교 강사 시간당 기본 단가' },
  { key: 'dolbom', label: '돌봄전담사 수당', unit: '시간', rate: 14000, desc: '돌봄교실 추가 근무 시간당' },
  { key: 'damim', label: '담임수당', unit: '월', rate: 130000, desc: '담임교사 월 정액 수당' },
  { key: 'bojik', label: '보직교사수당', unit: '월', rate: 70000, desc: '부장교사 등 보직교사 월 정액' },
  { key: 'yahak', label: '야간자율학습 감독', unit: '시간', rate: 14000, desc: '야간자율학습 감독 시간당' },
  { key: 'siheom', label: '시험감독수당', unit: '회', rate: 25000, desc: '지필평가 감독 1회당' },
  { key: 'chulgang', label: '출강수당', unit: '시간', rate: 30000, desc: '타교 출강 시간당' },
  { key: 'yeongu', label: '연구비', unit: '월', rate: 60000, desc: '교원 연구비 월 정액' },
  { key: 'gisuk', label: '기숙사 지도 수당', unit: '일', rate: 30000, desc: '기숙사 야간 생활지도 1일당' },
  { key: 'custom', label: '직접 입력', unit: '건', rate: 0, desc: '단가를 직접 입력합니다' },
]

interface Row {
  id: string
  key: string
  label: string
  unit: string
  rate: number
  count: number
  months: number
}

function makeRow(): Row {
  const t = ALLOWANCE_TYPES[0]
  return { id: crypto.randomUUID(), key: t.key, label: t.label, unit: t.unit, rate: t.rate, count: 1, months: 1 }
}

export default function AllowancePage() {
  const [rows, setRows] = useState<Row[]>([makeRow()])
  const [result, setResult] = useState<null | { rows: Array<{ label: string; subtotal: number }>; total: number; net: number }>(null)
  const [taxRate, setTaxRate] = useState(3.3)

  const addRow = () => setRows(r => [...r, makeRow()])
  const removeRow = (id: string) => setRows(r => r.filter(x => x.id !== id))

  const updateType = (id: string, key: string) => {
    const t = ALLOWANCE_TYPES.find(x => x.key === key)!
    setRows(r => r.map(x => x.id === id ? { ...x, key, label: t.label, unit: t.unit, rate: t.rate } : x))
  }

  const update = (id: string, patch: Partial<Row>) =>
    setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))

  const calculate = () => {
    const calcRows = rows.map(r => ({
      label: r.label,
      subtotal: r.rate * r.count * (r.unit === '월' ? r.months : 1),
    }))
    const total = calcRows.reduce((s, r) => s + r.subtotal, 0)
    const net = Math.round(total * (1 - taxRate / 100))
    setResult({ rows: calcRows, total, net })
  }

  const reset = () => { setRows([makeRow()]); setResult(null) }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">교육활동 수당 계산기</h1>
        <p className="page-subtitle">교과보충·방과후·담임 등 각종 수당을 합산합니다 · 2024 교육부 고시 기준</p>
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
            <h3 className="font-semibold text-white">수당 항목</h3>
            <button onClick={addRow} className="btn-ghost flex items-center gap-1.5 text-xs">
              <Plus size={13} />항목 추가
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const typeDef = ALLOWANCE_TYPES.find(t => t.key === row.key)
              return (
                <div key={row.id} className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-5 text-center">{idx + 1}</span>
                    <select
                      className="input flex-1 text-sm"
                      value={row.key}
                      onChange={e => updateType(row.id, e.target.value)}
                    >
                      {ALLOWANCE_TYPES.map(t => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                      className="btn-ghost p-1.5 text-red-400 hover:text-red-300 disabled:opacity-20">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {typeDef && <p className="text-xs text-slate-500 pl-7">{typeDef.desc}</p>}

                  <div className="flex items-center gap-2 pl-7">
                    <div className="flex items-center gap-1.5 flex-1">
                      <label className="text-xs text-slate-500 whitespace-nowrap">단가(원)</label>
                      <input
                        type="number"
                        className="input text-sm flex-1"
                        value={row.rate}
                        onChange={e => update(row.id, { rate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-slate-500 whitespace-nowrap">
                        {row.unit === '월' ? '월수' : row.unit + ' 수'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input w-20 text-sm text-center"
                        value={row.unit === '월' ? row.months : row.count}
                        onChange={e => update(row.id, row.unit === '월'
                          ? { months: Number(e.target.value) }
                          : { count: Number(e.target.value) }
                        )}
                      />
                    </div>
                    <div className="text-right min-w-24">
                      <span className="text-xs text-slate-500">소계</span>
                      <p className="text-sm font-medium text-white">
                        {(row.rate * (row.unit === '월' ? row.months : row.count)).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-white mb-3">세금 설정</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">원천징수율</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                className="input w-24 text-center"
                value={taxRate}
                onChange={e => setTaxRate(Number(e.target.value))}
              />
              <span className="text-sm text-slate-400">%</span>
            </div>
            <div className="flex gap-2">
              {[3.3, 6.6, 8.8, 0].map(r => (
                <button
                  key={r}
                  onClick={() => setTaxRate(r)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs border transition-all',
                    taxRate === r
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                  )}
                >
                  {r === 0 ? '비과세' : `${r}%`}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">강사료·기타소득은 3.3%, 일반 급여 과세구간은 실제 세율 적용</p>
        </div>

        <div className="flex gap-3">
          <button onClick={calculate} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Calculator size={15} />수당 합산
          </button>
          <button onClick={reset} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={14} />초기화
          </button>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="card border-violet-500/30 space-y-3"
            >
              <h3 className="font-semibold text-white pb-3 border-b border-white/5">계산 결과</h3>

              <div className="space-y-1.5">
                {result.rows.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-400">{r.label}</span>
                    <span className="text-slate-200 font-medium">{r.subtotal.toLocaleString()}원</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">수당 합계</span>
                  <span className="text-white font-semibold text-lg">{result.total.toLocaleString()}원</span>
                </div>
                {taxRate > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">원천징수 ({taxRate}%)</span>
                      <span className="text-red-400">-{(result.total - result.net).toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">실수령액</span>
                      <span className="text-emerald-300 font-bold text-xl">{result.net.toLocaleString()}원</span>
                    </div>
                  </>
                )}
              </div>

              <p className="text-xs text-slate-600">
                ※ 본 계산기는 참고용입니다. 정확한 수당 지급은 소속 학교 행정실에 문의하세요.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
