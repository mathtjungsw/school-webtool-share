import { useEffect, useRef, useState } from 'react'

type Result = {
  mode: 'demo' | 'live'
  kind: 'found' | 'unconfirmed' | 'unavailable'
  copies: number
  checked: number
  available: number
  callNo: string
  time: string
}

export function SchoolBookStatus({ id }: { id: number }) {
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  async function lookup(mode: Result['mode']) {
    const sequence = ++request.current
    setPending(true)
    setResult(null)
    setError('')
    try {
      const next = await window.preview.view({ id: 'university_recommended_books', action: 'schoolBook', bookId: id, mode })
      if (sequence === request.current) setResult(next)
    } catch {
      if (sequence === request.current) setError('네트워크 연결을 확인한 후 다시 조회하세요.')
    } finally {
      if (sequence === request.current) setPending(false)
    }
  }
  return <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
    <h3 className="font-bold">웅천고 도서관 대출 상태</h3>
    <div className="my-2 flex flex-wrap gap-2">
      <button className="btn-primary" onClick={() => void lookup('live')} disabled={pending}>독서로 현재 조회</button>
      <button className="btn-secondary" onClick={() => void lookup('demo')} disabled={pending}>시연 자료로 확인</button>
    </div>
    <div role="status" className="text-sm">{pending && '조회 중…'}{error}
      {result && <><strong>{result.mode === 'demo' ? '가상 시연 자료' : '독서로 조회'} · </strong>
        {result.kind === 'found' && <>검색에서 확인한 소장 {result.copies}권 · {result.checked === result.copies
          ? '대출 가능 ' + result.available + '권'
          : '대출 가능 확인 ' + result.available + '권 · 상태 미확인 ' + (result.copies - result.checked) + '권'}
          {result.callNo && <> · 청구기호 {result.callNo}</>}</>}
        {result.kind === 'unconfirmed' && (result.mode === 'demo' ? '이 책의 시연 자료가 없습니다.' : '검색 결과에서 이 판본의 소장을 확인하지 못했습니다.')}
        {result.kind === 'unavailable' && '독서로가 응답하지 않아 현재 상태를 확인할 수 없습니다.'}
        <small className="mt-1 block">확인 시각 {new Date(result.time).toLocaleString('ko-KR')}</small></>}
    </div>
  </section>
}
