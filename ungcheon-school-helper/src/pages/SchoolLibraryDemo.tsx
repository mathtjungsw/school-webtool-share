import { useState } from 'react'

// Teaching examples for the installed migration trial. There are no roster identifiers in this dataset.
const students = [{ number:'30101', name:'가상 학생 가' }, { number:'30102', name:'가상 학생 나' }]
const records = [
  { number:'30101', book:'과학혁명의 구조', kind:'독후감', text:'새로운 설명이 기존 관찰을 어떻게 바꾸는지 다른 사례와 비교해 보았다.' },
  { number:'30102', book:'종의 기원', kind:'책 라벨', text:'환경이 바뀌면 생물의 특징은 어떻게 달라질까?' },
  { number:'30101', book:'이기적 유전자', kind:'독후감', text:'협력 행동을 설명하는 두 관점을 대조했다.' },
]
export function SchoolLibraryDemo() {
  const [student, setStudent] = useState('')
  const [query, setQuery] = useState('')
  const rows = records.filter(r => (!student || r.number === student) &&
    [r.number, students.find(s => s.number === r.number)?.name, r.book, r.kind, r.text].some(v => v?.includes(query.trim())))
  return <main className="mx-auto max-w-4xl p-7">
    <p className="font-bold text-emerald-800">웅천 서가 · 가상 학급</p>
    <h1 className="my-2 text-3xl font-bold">우리 반 독서 기록</h1>
    <p className="text-slate-700">가상 담임의 3학년 1반 기록을 살펴보세요. 실제 독서 활동은 기존 서가를 이용해 주세요.</p>
    <div className="my-5 flex flex-wrap gap-4"><label>학생<select className="input-field" value={student} onChange={e=>setStudent(e.target.value)}>
      <option value="">전체 학생 (2명)</option>{students.map(s=><option key={s.number} value={s.number}>{s.number} {s.name}</option>)}</select></label>
      <label>기록 검색<input className="input-field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="학번, 이름, 책 제목, 글 내용"/></label></div>
    <h2 className="mb-3 text-lg font-bold" aria-live="polite">독서 활동 {rows.length}건</h2>
    {rows.map(r=><article key={r.number+r.book} className="mb-3 rounded-xl border bg-white p-5">
      <p className="text-sm text-slate-600">{students.find(s=>s.number===r.number)?.name} ({r.number}) · {r.kind}</p>
      <h3 className="my-1 text-lg font-bold">{r.book}</h3><p>{r.text}</p></article>)}
    {!rows.length && <p>조건에 맞는 기록이 없습니다.</p>}
  </main>
}
