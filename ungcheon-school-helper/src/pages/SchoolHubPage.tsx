import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ExternalLink, Link2, Megaphone, Plus, RefreshCw,
  ShieldCheck, Trash2, AlertCircle, Search,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import { hubRequest, listLinks, listNotices, type SchoolNotice, type SharedLink } from '../services/schoolHub'
import { useNoticeStore } from '../stores/noticeStore'

export default function SchoolHubPage() {
  const config = useAppStore(s => s.config)
  const refreshNoticeStore = useNoticeStore(s => s.fetchNotices)
  const [tab, setTab] = useState<'links' | 'notices'>('links')
  const [links, setLinks] = useState<SharedLink[]>([])
  const [notices, setNotices] = useState<SchoolNotice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const isAdmin = useAdminStore(s => s.isAdmin)
  const adminPassword = useAdminStore(s => s.adminPassword)
  const [linkForm, setLinkForm] = useState({
    department: '', title: '', url: '', description: '', registeredBy: config.teacherName ?? '',
  })
  const [noticeForm, setNoticeForm] = useState({
    title: '', body: '', level: 'info', expiresAt: '',
  })

  const configured = Boolean(config.schoolHubUrl)

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true); setError('')
    try {
      const [nextLinks, nextNotices] = await Promise.all([listLinks(), listNotices()])
      setLinks(nextLinks)
      setNotices(nextNotices)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => { load() }, [load])

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return links
    return links.filter(link => [link.department, link.title, link.description, link.registeredBy]
      .some(value => value?.toLowerCase().includes(q)))
  }, [links, search])

  const addLink = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await hubRequest({
        action: 'addLink',
        ...linkForm,
        registeredBy: linkForm.registeredBy || config.teacherName || '교직원',
      })
      setLinkForm(f => ({ ...f, title: '', url: '', description: '' }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteLink = async (id: string) => {
    if (!isAdmin || !adminPassword) { setError('관리자 모드에서만 삭제할 수 있습니다.'); return }
    if (!confirm('이 공유 링크를 삭제할까요?')) return
    try {
      await hubRequest({ action: 'deleteLink', id, adminPassword })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const addNotice = async (event: FormEvent) => {
    event.preventDefault()
    if (!isAdmin || !adminPassword) { setError('관리자 모드에서만 공지를 등록할 수 있습니다.'); return }
    try {
      await hubRequest({ action: 'addNotice', ...noticeForm, adminPassword })
      setNoticeForm({ title: '', body: '', level: 'info', expiresAt: '' })
      await load()
      await refreshNoticeStore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteNotice = async (id: number) => {
    if (!isAdmin || !adminPassword) { setError('관리자 모드에서만 삭제할 수 있습니다.'); return }
    if (!confirm('이 공지를 삭제할까요?')) return
    try {
      await hubRequest({ action: 'deleteNotice', id, adminPassword })
      await load()
      await refreshNoticeStore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-10 text-center border-amber-500/20">
          <Link2 size={36} className="mx-auto text-amber-400 mb-3" />
          <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            환경설정에 Google Apps Script 웹 앱 URL을 입력하면<br />
            모든 교직원이 같은 공지와 부서별 링크를 볼 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">웅천고 학교 공유</h1>
          <p className="text-sm text-slate-400 mt-1">등록한 링크는 별도 승인 없이 모든 교직원에게 즉시 공유됩니다.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('links')} className={tab === 'links' ? 'btn-primary' : 'btn-ghost'}>
          <span className="flex items-center gap-2"><Link2 size={14} /> 부서별 공유 링크</span>
        </button>
        <button onClick={() => setTab('notices')} className={tab === 'notices' ? 'btn-primary' : 'btn-ghost'}>
          <span className="flex items-center gap-2"><Megaphone size={14} /> 학교 공지</span>
        </button>
        <div className={`ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
          isAdmin ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-slate-500'
        }`}>
          <ShieldCheck size={14} />
          {isAdmin ? '관리자 모드 활성화' : '현재 사용자 모드'}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {tab === 'links' ? (
        <>
          <form onSubmit={addLink} className="card p-5">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-4"><Plus size={16} className="text-violet-400" /> 공유 링크 등록</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input className="input-field" required maxLength={40} placeholder="부서명" value={linkForm.department} onChange={e => setLinkForm({ ...linkForm, department: e.target.value })} />
              <input className="input-field" required maxLength={80} placeholder="자료·사이트 이름" value={linkForm.title} onChange={e => setLinkForm({ ...linkForm, title: e.target.value })} />
              <input className="input-field lg:col-span-2" required placeholder="https://..." value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} />
              <input className="input-field sm:col-span-2 lg:col-span-3" maxLength={200} placeholder="설명(선택)" value={linkForm.description} onChange={e => setLinkForm({ ...linkForm, description: e.target.value })} />
              <div className="flex gap-2">
                <input className="input-field min-w-0 flex-1" maxLength={30} placeholder="등록자" value={linkForm.registeredBy} onChange={e => setLinkForm({ ...linkForm, registeredBy: e.target.value })} />
                <button className="btn-primary px-4" type="submit">등록</button>
              </div>
            </div>
          </form>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-field w-full pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="부서, 자료명, 등록자로 검색" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {filteredLinks.map(link => (
              <article key={link.id} className="card p-4 group">
                <div className="flex gap-3">
                  <button onClick={() => window.electron.openExternal(link.url)} className="flex-1 text-left min-w-0">
                    <span className="inline-flex text-[10px] font-semibold rounded-full bg-sky-500/15 text-sky-300 px-2 py-1 mb-2">{link.department}</span>
                    <h3 className="font-semibold text-white flex items-center gap-2">{link.title}<ExternalLink size={12} className="text-slate-500" /></h3>
                    {link.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{link.description}</p>}
                    <p className="text-[10px] text-slate-600 mt-3">{link.registeredBy} · {formatDate(link.createdAt)}</p>
                  </button>
                  {isAdmin && (
                    <button onClick={() => deleteLink(link.id)} className="self-start p-2 text-slate-600 hover:text-rose-400 opacity-40 group-hover:opacity-100" title="관리자 삭제">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!loading && filteredLinks.length === 0 && <Empty text="등록된 공유 링크가 없습니다." />}
        </>
      ) : (
        <>
          {isAdmin && (
            <form onSubmit={addNotice} className="card p-5">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-4"><Megaphone size={16} className="text-violet-400" /> 관리자 공지 등록</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <input className="input-field sm:col-span-2" required maxLength={100} placeholder="공지 제목" value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} />
                <select className="input-field" value={noticeForm.level} onChange={e => setNoticeForm({ ...noticeForm, level: e.target.value })}>
                  <option value="info">일반</option><option value="important">중요</option><option value="urgent">긴급</option>
                </select>
                <textarea className="input-field sm:col-span-3 min-h-28 resize-y" required maxLength={3000} placeholder="공지 내용" value={noticeForm.body} onChange={e => setNoticeForm({ ...noticeForm, body: e.target.value })} />
                <label className="text-xs text-slate-400">
                  팝업 만료일(선택)
                  <input type="date" className="input-field w-full mt-1" value={noticeForm.expiresAt} onChange={e => setNoticeForm({ ...noticeForm, expiresAt: e.target.value })} />
                </label>
                <button className="btn-primary px-5 self-end h-10" type="submit">공지 등록</button>
              </div>
            </form>
          )}
          <div className="space-y-3">
            {notices.map(notice => (
              <article key={notice.id} className="card p-4 flex gap-3">
                <span className={`w-2 rounded-full ${notice.level === 'urgent' ? 'bg-rose-500' : notice.level === 'important' ? 'bg-amber-400' : 'bg-sky-500'}`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white">{notice.title}</h3>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap mt-2">{notice.body}</p>
                  <p className="text-[10px] text-slate-600 mt-3">{notice.date}{notice.expiresAt ? ` · 팝업 만료 ${notice.expiresAt}` : ''}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => deleteNotice(notice.id)} className="self-start p-2 text-slate-600 hover:text-rose-400" title="관리자 삭제"><Trash2 size={14} /></button>
                )}
              </article>
            ))}
          </div>
          {!loading && notices.length === 0 && <Empty text="등록된 공지가 없습니다." />}
        </>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="card p-10 text-center text-sm text-slate-500">{text}</div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}
