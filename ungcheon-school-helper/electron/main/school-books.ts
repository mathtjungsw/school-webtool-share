import books from '../../src/data/recommendedBooks.json'
import editionData from '../../src/data/recommendedBookEditions.json'

type Mode = 'demo' | 'live'
type State = 'found' | 'unavailable' | 'unconfirmed'
type Copy = { isbn?: string; bookKey?: string | number; title?: string; author?: string; callNo?: string }
type Data = { bookList?: Copy[]; status?: string }
const api = 'https://read365.edunet.net/alpasq/api/search'
const school = { neisCode: 'S100000673', provCode: 'S10', schoolName: '웅천고등학교' }
const editions: Record<string, { isbn?: string; editionTitle?: string; cover?: string }> = editionData.editions
const normalize = (text = '') => text.normalize('NFKC').replace(/[\p{P}\s]/gu, '').toLowerCase()
function result(mode: Mode, kind: State, copies = 0, checked = 0, available = 0, callNo = '') {
  return { mode, kind, copies, checked, available, callNo, time: new Date().toISOString() }
}
async function read(url: string, options: RequestInit = {}): Promise<Data | undefined> {
  try {
    const response = await fetch(url, { ...options, headers:{ ...options.headers, Accept:'application/json', 'User-Agent':'Mozilla/5.0 (Ungcheon School Helper)' }, credentials:'omit', redirect:'error', signal:AbortSignal.timeout(20000) })
    if (!response.ok) return
    const data = await response.json()
    if (data?.status === 'OK') return data.data
  } catch { return undefined }
}
async function current(book: typeof books[number]) {
  const data = await read(api, {method:'POST', headers:{'Content-Type':'application/json; charset=utf-8'}, body:JSON.stringify({
    ...school, neisCode:[school.neisCode], searchKeyword:book.id===4?'이기적 유전자':book.title, page:1, display:50, coverYn:'N',
  })})
  if (!Array.isArray(data?.bookList)) return result('live', 'unavailable')
  const isbn = editions[book.id]?.isbn
  const seen = new Set<string>()
  const copies = data.bookList.filter(item=>{
    const matches = isbn ? normalize(item.isbn) === normalize(isbn) : normalize(book.title) === normalize(item.title) &&
      !!book.author && normalize(item.author).includes(normalize(book.author))
    const key = String(item.bookKey || '')
    if (!matches || (key && seen.has(key))) return false
    if (key) seen.add(key)
    return true
  })
  if (!copies.length) return result('live','unconfirmed')
  const states = await Promise.all([...seen].slice(0,5).map(key => read(api+'/book/state?'+new URLSearchParams({
    neisCode:school.neisCode, provCode:school.provCode, bookKey:key,
  }))))
  return result('live', 'found', copies.length, states.filter(s=>s?.status==='대출가능'||s?.status==='대출중').length,
    states.filter(s=>s?.status==='대출가능').length, copies[0].callNo)
}
const cache = new Map<number,{ until:number; value: ReturnType<typeof result> }>()
const pending = new Map<number,ReturnType<typeof current>>()
export async function lookupSchoolBook(id: unknown, mode: unknown) {
  const book = books.find(item=>item.id===id)
  if (!book || (mode!=='live' && mode!=='demo')) throw Error('도서를 다시 선택하세요.')
  if (mode==='demo') {
    if (book.id===1 || book.id===5) return result(mode,'found',2,2,1,'시연 자료')
    if (book.id===4) return result(mode,'found',1,1,0,'시연 자료')
    return result(mode,'unconfirmed')
  }
  const saved=cache.get(book.id)
  if (saved && saved.until>Date.now()) return saved.value
  const request=pending.get(book.id)
  if (request) return request
  const next=current(book).then(value=>{
    cache.set(book.id,{until:Date.now()+(value.kind==='unavailable'?15000:60000),value})
    return value
  }).finally(()=>pending.delete(book.id))
  pending.set(book.id,next)
  return next
}
