import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calculator, RefreshCw, Info } from 'lucide-react'
import clsx from 'clsx'

// 2024년 기준 요율
const RATES = {
  pension:     { employee: 0.045,  employer: 0.045,  label: '국민연금' },
  health:      { employee: 0.03545, employer: 0.03545, label: '건강보험' },
  longterm:    { employee: 0,       employer: 0,       label: '장기요양보험' }, // 건강보험료의 12.95%
  employment:  { employee: 0.009,   employer: 0.009,  label: '고용보험' },
  industrial:  { employee: 0,       employer: 0.007,  label: '산재보험' },  // 교육서비스업 0.7%
}

interface Result {
  pension: { emp: number; er: number }
  health: { emp: number; er: number }
  longterm: { emp: number; er: number }
  employment: { emp: number; er: number }
  industrial: { emp: number; er: number }
  totalEmp: number
  totalEr: number
  netSalary: number
  incomeTax: number
  localTax: number
  netAfterTax: number
}

function calcIncomeTax(monthly: number): number {
  // 간이세액표 근사치 (부양가족 1명 기준, 2024)
  const annual = monthly * 12
  if (annual <= 12000000) return 0
  if (annual <= 46000000) return Math.round((annual - 12000000) * 0.15 / 12)
  if (annual <= 88000000) return Math.round((5100000 + (annual - 46000000) * 0.24) / 12)
  if (annual <= 150000000) return Math.round((15180000 + (annual - 88000000) * 0.35) / 12)
  if (annual <= 300000000) return Math.round((36870000 + (annual - 150000000) * 0.38) / 12)
  if (annual <= 500000000) return Math.round((93870000 + (annual - 300000000) * 0.40) / 12)
  if (annual <= 1000000000) return Math.round((173870000 + (annual - 500000000) * 0.42) / 12)
  return Math.round((383870000 + (annual - 1000000000) * 0.45) / 12)
}

export default function InsurancePage() {
  const [salary, setSalary] = useState('')
  const [salaryStr, setSalaryStr] = useState('')
  const [isTeacher, setIsTeacher] = useState(true)
  const [result, setResult] = useState<Result | null>(null)

  const handleSalaryChange = (v: string) => {
    const num = v.replace(/[^0-9]/g, '')
    setSalary(num)
    setSalaryStr(num ? Number(num).toLocaleString() : '')
  }

  const calculate = () => {
    const s = Number(salary)
    if (!s) return

    const pension = { emp: Math.round(s * RATES.pension.employee), er: Math.round(s * RATES.pension.employer) }
    const health  = { emp: Math.round(s * RATES.health.employee),  er: Math.round(s * RATES.health.employer) }
    // 장기요양 = 건강보험료 × 12.95%
    const longterm = { emp: Math.round(health.emp * 0.1295), er: Math.round(health.er * 0.1295) }
    const employment = isTeacher
      ? { emp: 0, er: 0 }  // 교원은 고용보험 미적용 (국공립)
      : { emp: Math.round(s * RATES.employment.employee), er: Math.round(s * RATES.employment.employer) }
    const industrial = { emp: 0, er: Math.round(s * RATES.industrial.employer) }

    const totalEmp = pension.emp + health.emp + longterm.emp + employment.emp
    const totalEr  = pension.er  + health.er  + longterm.er  + employment.er + industrial.er

    const incomeTax = calcIncomeTax(s)
    const localTax  = Math.round(incomeTax * 0.1)
    const netSalary = s - totalEmp
    const netAfterTax = netSalary - incomeTax - localTax

    setResult({ pension, health, longterm, employment, industrial, totalEmp, totalEr, netSalary, incomeTax, localTax, netAfterTax })
  }

  const reset = () => { setSalary(''); setSalaryStr(''); setResult(null) }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">4대보험 & 세금 계산기</h1>
        <p className="page-subtitle">월 급여 기준 4대보험료와 근로소득세를 계산합니다 · 2024년 요율 기준</p>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="field-label">월 기본급 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              className="input text-lg font-medium"
              placeholder="예: 3,500,000"
              value={salaryStr}
              onChange={e => handleSalaryChange(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="field-label mb-0">직종</label>
            <div className="flex gap-2">
              {[
                { v: true,  label: '국공립 교원 (고용보험 미적용)' },
                { v: false, label: '사립·계약직 (고용보험 적용)' },
              ].map(({ v, label }) => (
                <button
                  key={String(v)}
                  onClick={() => setIsTeacher(v)}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-xs border transition-all',
                    isTeacher === v
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                      : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={calculate} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Calculator size={15} />계산하기
            </button>
            <button onClick={reset} className="btn-secondary flex items-center gap-2">
              <RefreshCw size={14} />초기화
            </button>
          </div>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* 4대보험 상세 */}
              <div className="card">
                <h3 className="font-semibold text-white mb-4 pb-3 border-b border-white/5">4대보험 내역</h3>
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 pb-2 border-b border-white/5">
                    <span>항목</span><span className="text-right">근로자 부담</span><span className="text-right">사업주 부담</span>
                  </div>
                  {[
                    { label: `국민연금 (${(RATES.pension.employee * 100).toFixed(2)}%)`, emp: result.pension.emp, er: result.pension.er },
                    { label: `건강보험 (${(RATES.health.employee * 100).toFixed(3)}%)`, emp: result.health.emp, er: result.health.er },
                    { label: '장기요양보험 (건강보험료×12.95%)', emp: result.longterm.emp, er: result.longterm.er },
                    { label: isTeacher ? '고용보험 (국공립 미적용)' : `고용보험 (${(RATES.employment.employee * 100).toFixed(1)}%)`, emp: result.employment.emp, er: result.employment.er },
                    { label: '산재보험 (교육서비스업 0.7%)', emp: 0, er: result.industrial.er },
                  ].map(r => (
                    <div key={r.label} className="grid grid-cols-3 gap-2 py-1.5 text-sm border-b border-white/3">
                      <span className="text-slate-400">{r.label}</span>
                      <span className={clsx('text-right font-medium', r.emp > 0 ? 'text-red-300' : 'text-slate-600')}>
                        {r.emp > 0 ? `-${r.emp.toLocaleString()}` : '—'}
                      </span>
                      <span className={clsx('text-right font-medium', r.er > 0 ? 'text-amber-300' : 'text-slate-600')}>
                        {r.er > 0 ? r.er.toLocaleString() : '—'}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 pt-2 text-sm font-semibold">
                    <span className="text-white">합계</span>
                    <span className="text-right text-red-300">-{result.totalEmp.toLocaleString()}</span>
                    <span className="text-right text-amber-300">{result.totalEr.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 세금 및 실수령액 */}
              <div className="card border-violet-500/30">
                <h3 className="font-semibold text-white mb-4 pb-3 border-b border-white/5">세금 및 실수령액</h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label: '기본급', value: Number(salary), color: 'text-white' },
                    { label: `4대보험 (근로자 부담)`, value: -result.totalEmp, color: 'text-red-400' },
                    { label: '소득세 (간이세액, 부양 1인 기준)', value: -result.incomeTax, color: 'text-red-400' },
                    { label: '지방소득세 (소득세의 10%)', value: -result.localTax, color: 'text-red-400' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between">
                      <span className="text-slate-400">{r.label}</span>
                      <span className={clsx('font-medium', r.color)}>
                        {r.value < 0 ? `-${Math.abs(r.value).toLocaleString()}` : r.value.toLocaleString()}원
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 border-t border-white/10">
                    <span className="text-slate-300 font-medium">예상 실수령액</span>
                    <span className="text-emerald-300 font-bold text-2xl">{result.netAfterTax.toLocaleString()}원</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                <Info size={13} className="flex-shrink-0 mt-0.5" />
                <span>소득세는 부양가족 1인 기준 간이세액표 근사값입니다. 실제 공제액은 연말정산 결과에 따라 달라집니다.</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
