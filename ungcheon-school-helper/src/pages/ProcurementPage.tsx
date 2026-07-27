import { useState, useMemo } from 'react'
import { Plus, Trash2, RefreshCw, ShoppingCart } from 'lucide-react'
import clsx from 'clsx'

// 평가 기준 항목 (물품선정위원회 자동화서식 기준)
const DEFAULT_CRITERIA = [
  { id: 'c1', name: '기능·성능', weight: 30 },
  { id: 'c2', name: '가격 적정성', weight: 25 },
  { id: 'c3', name: '품질·내구성', weight: 20 },
  { id: 'c4', name: '서비스·AS', weight: 15 },
  { id: 'c5', name: '환경·안전기준', weight: 10 },
]

interface Criterion {
  id: string
  name: string
  weight: number  // 배점
}

interface Product {
  id: string
  name: string
  brand: string
  model: string
  price: number
  note: string
  scores: Record<string, number>  // criterionId → 점수(0~만점)
}

interface Evaluator {
  id: string
  name: string
}

function makeProduct(): Product {
  return {
    id: crypto.randomUUID(),
    name: '', brand: '', model: '', price: 0, note: '',
    scores: Object.fromEntries(DEFAULT_CRITERIA.map(c => [c.id, 0])),
  }
}

export default function ProcurementPage() {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA.map(c => ({ ...c })))
  const [products, setProducts] = useState<Product[]>([makeProduct(), makeProduct()])
  const [evaluators, setEvaluators] = useState<Evaluator[]>([
    { id: crypto.randomUUID(), name: '' },
    { id: crypto.randomUUID(), name: '' },
    { id: crypto.randomUUID(), name: '' },
  ])
  const [tab, setTab] = useState<'setup' | 'eval' | 'result'>('setup')

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0)

  const addProduct = () => {
    const p = makeProduct()
    p.scores = Object.fromEntries(criteria.map(c => [c.id, 0]))
    setProducts(prev => [...prev, p])
  }

  const removeProduct = (id: string) => setProducts(p => p.filter(x => x.id !== id))

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setProducts(p => p.map(x => x.id === id ? { ...x, ...patch } : x))

  const updateScore = (productId: string, criterionId: string, score: number) => {
    setProducts(p => p.map(x => x.id === productId
      ? { ...x, scores: { ...x.scores, [criterionId]: Math.min(score, criteria.find(c => c.id === criterionId)?.weight ?? 100) } }
      : x
    ))
  }

  const updateCriterion = (id: string, patch: Partial<Criterion>) =>
    setCriteria(c => c.map(x => x.id === id ? { ...x, ...patch } : x))

  const results = useMemo(() =>
    products.map(p => {
      const totalScore = criteria.reduce((s, c) => s + (p.scores[c.id] ?? 0), 0)
      return { ...p, totalScore }
    }).sort((a, b) => b.totalScore - a.totalScore)
  , [products, criteria])

  const winner = results[0]

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">물품선정위원회</h1>
          <p className="page-subtitle">물품 비교 평가표를 작성하고 선정 결과를 자동 산출합니다</p>
        </div>
        <button onClick={() => { setProducts([makeProduct(), makeProduct()]); setTitle(''); }}
          className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw size={12} />초기화
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-surface-800 p-1 rounded-xl w-fit">
        {([['setup', '기본 설정'], ['eval', '평가 입력'], ['result', '결과 보기']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm transition-all',
              tab === v ? 'bg-violet-500 text-white font-medium' : 'text-slate-400 hover:text-white'
            )}>{l}</button>
        ))}
      </div>

      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-semibold text-white text-sm">회의 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="field-label">물품명 / 사업명</label>
                <input className="input" placeholder="예: 학교 급식실 스테인리스 식판 구입" value={title}
                  onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="field-label">심의일자</label>
                <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* 평가 기준 */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">평가 기준 및 배점</h3>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full border',
                totalWeight === 100
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              )}>
                합계: {totalWeight}점 {totalWeight !== 100 && '(100점이 되도록 조정하세요)'}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/10">
                  <th className="text-left py-1.5 px-2">평가 항목</th>
                  <th className="text-left py-1.5 px-2 w-24">배점</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map(c => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="py-1.5 px-2">
                      <input className="input text-xs w-full" value={c.name}
                        onChange={e => updateCriterion(c.id, { name: e.target.value })} />
                    </td>
                    <td className="py-1.5 px-2">
                      <input type="number" min="0" max="100" className="input text-xs w-20 text-center"
                        value={c.weight}
                        onChange={e => updateCriterion(c.id, { weight: Number(e.target.value) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 심사위원 */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">심사위원 ({evaluators.length}명)</h3>
              <button onClick={() => setEvaluators(e => [...e, { id: crypto.randomUUID(), name: '' }])}
                className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} />추가</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {evaluators.map(e => (
                <div key={e.id} className="flex items-center gap-1">
                  <input className="input text-xs w-24" placeholder="성명" value={e.name}
                    onChange={ev => setEvaluators(prev => prev.map(x => x.id === e.id ? { ...x, name: ev.target.value } : x))} />
                  {evaluators.length > 1 && (
                    <button onClick={() => setEvaluators(prev => prev.filter(x => x.id !== e.id))}
                      className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 물품 목록 */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">비교 물품 ({products.length}개)</h3>
              <button onClick={addProduct} className="btn-ghost text-xs flex items-center gap-1">
                <Plus size={12} />물품 추가
              </button>
            </div>
            <div className="space-y-2">
              {products.map((p, i) => (
                <div key={p.id} className="p-3 bg-surface-900 rounded-xl border border-white/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-5">{i + 1}</span>
                    <input className="input text-xs flex-1" placeholder="물품명" value={p.name}
                      onChange={e => updateProduct(p.id, { name: e.target.value })} />
                    <input className="input text-xs w-24" placeholder="브랜드" value={p.brand}
                      onChange={e => updateProduct(p.id, { brand: e.target.value })} />
                    <input className="input text-xs w-28" placeholder="모델명" value={p.model}
                      onChange={e => updateProduct(p.id, { model: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <input type="number" className="input text-xs w-28" placeholder="단가(원)"
                        value={p.price || ''} onChange={e => updateProduct(p.id, { price: Number(e.target.value) })} />
                    </div>
                    {products.length > 2 && (
                      <button onClick={() => removeProduct(p.id)}
                        className="text-red-400 hover:text-red-300"><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'eval' && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-white mb-4 text-sm">{title || '물품 평가표'}</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-2 text-slate-500 w-40">평가 항목</th>
                <th className="text-center py-2 px-2 text-slate-500 w-16">배점</th>
                {products.map(p => (
                  <th key={p.id} className="text-center py-2 px-2 text-slate-300">
                    {p.name || `물품${products.indexOf(p)+1}`}
                    {p.price > 0 && <div className="text-slate-500 font-normal">{p.price.toLocaleString()}원</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.map(c => (
                <tr key={c.id} className="border-b border-white/5">
                  <td className="py-2 px-2 text-slate-300">{c.name}</td>
                  <td className="py-2 px-2 text-center text-slate-500">{c.weight}점</td>
                  {products.map(p => (
                    <td key={p.id} className="py-1.5 px-2 text-center">
                      <input
                        type="number"
                        min="0"
                        max={c.weight}
                        className="input w-16 text-center text-xs"
                        value={p.scores[c.id] ?? 0}
                        onChange={e => updateScore(p.id, c.id, Number(e.target.value))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-white/20">
                <td className="py-2 px-2 font-semibold text-white" colSpan={2}>합계</td>
                {products.map(p => {
                  const total = criteria.reduce((s, c) => s + (p.scores[c.id] ?? 0), 0)
                  return (
                    <td key={p.id} className="py-2 px-2 text-center font-bold text-violet-300 text-sm">
                      {total}점
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'result' && (
        <div className="space-y-4">
          {/* 결과 요약 */}
          {winner && winner.name && (
            <div className="card border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <ShoppingCart size={24} className="text-emerald-400" />
                <div>
                  <p className="text-xs text-emerald-400 mb-0.5">선정 물품</p>
                  <p className="text-xl font-bold text-white">{winner.name}</p>
                  {winner.brand && <p className="text-sm text-slate-400">{winner.brand} {winner.model}</p>}
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-slate-500">총점</p>
                  <p className="text-3xl font-bold text-emerald-300">{winner.totalScore}점</p>
                  {winner.price > 0 && <p className="text-sm text-slate-400">{winner.price.toLocaleString()}원</p>}
                </div>
              </div>
            </div>
          )}

          {/* 순위표 */}
          <div className="card">
            <h3 className="font-semibold text-white mb-4 text-sm">평가 결과 순위</h3>
            <div className="space-y-2">
              {results.map((p, i) => (
                <div key={p.id}
                  className={clsx('flex items-center gap-3 p-3 rounded-xl border',
                    i === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-surface-900 border-white/5'
                  )}>
                  <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    i === 0 ? 'bg-emerald-500 text-white' : 'bg-surface-800 text-slate-400'
                  )}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{p.name || `물품${i+1}`}</p>
                    {(p.brand || p.model) && <p className="text-xs text-slate-500">{p.brand} {p.model}</p>}
                  </div>
                  {p.price > 0 && <span className="text-sm text-slate-400">{p.price.toLocaleString()}원</span>}
                  <div className="text-right">
                    <p className="font-bold text-lg text-white">{p.totalScore}점</p>
                    <p className="text-xs text-slate-500">/{totalWeight}점</p>
                  </div>

                  {/* 항목별 점수 */}
                  <div className="flex gap-1">
                    {criteria.map(c => (
                      <div key={c.id} className="text-center">
                        <p className="text-[10px] text-slate-600">{c.name.slice(0,2)}</p>
                        <p className="text-xs text-slate-300">{p.scores[c.id] ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-600">
            ※ 본 평가표는 참고용입니다. 최종 선정은 위원회 심의 의결로 결정됩니다.
          </p>
        </div>
      )}
    </div>
  )
}
