import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Lightbulb, MessageSquareText,
  RefreshCw, Search, Send, ShieldCheck, Trash2, Wrench,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useAdminStore } from '../stores/adminStore'
import {
  hubRequest,
  listFeatureRequests,
  type FeatureRequest,
  type FeatureRequestStatus,
  type FeatureRequestType,
} from '../services/schoolHub'

const STATUS_INFO: Record<FeatureRequestStatus, { label: string; className: string }> = {
  submitted: { label: '접수', className: 'bg-sky-500/15 text-sky-300' },
  reviewing: { label: '검토 중', className: 'bg-amber-500/15 text-amber-300' },
  planned: { label: '개선 예정', className: 'bg-violet-500/15 text-violet-300' },
  completed: { label: '반영 완료', className: 'bg-emerald-500/15 text-emerald-300' },
  declined: { label: '반영 어려움', className: 'bg-slate-500/15 text-slate-400' },
}

export default function FeatureRequestsPage() {
  const config = useAppStore(state => state.config)
  const saveConfig = useAppStore(state => state.saveConfig)
  const isAdmin = useAdminStore(state => state.isAdmin)
  const adminPassword = useAdminStore(state => state.adminPassword)
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    requestType: 'new' as FeatureRequestType,
    title: '',
    content: '',
    author: config.teacherName ?? '',
  })

  const configured = Boolean(config.schoolHubUrl)

  useEffect(() => {
    if (!form.author && config.teacherName) {
      setForm(current => ({ ...current, author: config.teacherName ?? '' }))
    }
  }, [config.teacherName, form.author])

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError('')
    try {
      setRequests(await listFeatureRequests())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => { load() }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const author = form.author.trim()
    if (author.length < 2) {
      setError('작성자 실명을 두 글자 이상 입력하세요.')
      return
    }
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await hubRequest({
        action: 'addFeatureRequest',
        requestType: form.requestType,
        title: form.title,
        content: form.content,
        author,
      })
      if (author !== config.teacherName) await saveConfig({ teacherName: author })
      setForm(current => ({ ...current, title: '', content: '', author }))
      setSuccess('기능개선 요청이 등록되었습니다.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const updateRequest = async (id: string, status: FeatureRequestStatus, adminReply: string) => {
    if (!isAdmin || !adminPassword) throw new Error('관리자 모드에서만 처리할 수 있습니다.')
    await hubRequest({ action: 'updateFeatureRequest', id, status, adminReply, adminPassword })
    await load()
  }

  const deleteRequest = async (id: string) => {
    if (!isAdmin || !adminPassword) return
    if (!confirm('이 기능개선 요청을 삭제할까요?')) return
    try {
      await hubRequest({ action: 'deleteFeatureRequest', id, adminPassword })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return requests
    return requests.filter(item =>
      [item.title, item.content, item.author, item.adminReply]
        .some(value => value?.toLowerCase().includes(query)),
    )
  }, [requests, search])

  if (!configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-10 text-center border-amber-500/20">
          <MessageSquareText size={36} className="mx-auto text-amber-400 mb-3" />
          <h1 className="text-xl font-bold text-white">학교 공유 서비스 설정이 필요합니다</h1>
          <p className="text-sm text-slate-400 mt-2">환경설정에 Google Apps Script 웹 앱 URL을 입력하면 기능개선 게시판을 사용할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">기능개선 요청</h1>
          <p className="text-sm text-slate-400 mt-1">새 기능 제안과 기존 기능 개선 의견을 함께 나누는 게시판입니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <span className="rounded-xl bg-amber-500/10 text-amber-300 px-3 py-2 text-xs flex items-center gap-1.5">
              <ShieldCheck size={13} /> 관리자 처리 가능
            </span>
          )}
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 새로고침
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3">
        <p className="text-sm font-semibold text-sky-200">실명으로 작성해 주세요.</p>
        <p className="text-xs text-sky-300/75 mt-1">
          모든 교직원이 함께 보는 학교 게시판입니다. 책임 있는 소통을 위해 작성자 실명을 입력하고,
          학생·학부모의 이름이나 연락처 등 개인정보는 작성하지 마세요.
        </p>
      </div>

      <form onSubmit={submit} className="card p-5">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-4"><Lightbulb size={16} className="text-amber-300" /> 요청 작성</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <select
            className="input-field"
            value={form.requestType}
            onChange={event => setForm({ ...form, requestType: event.target.value as FeatureRequestType })}
          >
            <option value="new">새 기능 요청</option>
            <option value="improvement">기존 기능 개선</option>
          </select>
          <input
            className="input-field sm:col-span-2"
            required
            maxLength={100}
            placeholder="요청 제목"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
          />
          <input
            className="input-field"
            required
            minLength={2}
            maxLength={30}
            placeholder="작성자 실명"
            value={form.author}
            onChange={event => setForm({ ...form, author: event.target.value })}
          />
          <textarea
            className="input-field sm:col-span-4 min-h-28 resize-y"
            required
            maxLength={3000}
            placeholder="필요한 기능이나 불편한 점, 원하는 동작을 구체적으로 적어주세요."
            value={form.content}
            onChange={event => setForm({ ...form, content: event.target.value })}
          />
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" disabled={submitting} className="btn-primary px-5 flex items-center gap-2 disabled:opacity-40">
              <Send size={14} /> {submitting ? '등록 중...' : '실명으로 요청 등록'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={15} /> {success}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input-field w-full pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="제목, 내용, 작성자로 검색" />
      </div>

      <div className="space-y-3">
        {filtered.map(item => (
          <RequestCard
            key={item.id}
            item={item}
            isAdmin={isAdmin}
            onUpdate={updateRequest}
            onDelete={deleteRequest}
          />
        ))}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-slate-500">등록된 기능개선 요청이 없습니다.</div>
      )}
    </div>
  )
}

function RequestCard({
  item,
  isAdmin,
  onUpdate,
  onDelete,
}: {
  item: FeatureRequest
  isAdmin: boolean
  onUpdate: (id: string, status: FeatureRequestStatus, adminReply: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [status, setStatus] = useState(item.status)
  const [reply, setReply] = useState(item.adminReply ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const statusInfo = STATUS_INFO[item.status] ?? STATUS_INFO.submitted

  useEffect(() => {
    setStatus(item.status)
    setReply(item.adminReply ?? '')
  }, [item.status, item.adminReply])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onUpdate(item.id, status, reply)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card p-5">
      <div className="flex gap-3">
        <div className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${
          item.requestType === 'new' ? 'bg-amber-500/15 text-amber-300' : 'bg-violet-500/15 text-violet-300'
        }`}>
          {item.requestType === 'new' ? <Lightbulb size={16} /> : <Wrench size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-500">{item.requestType === 'new' ? '새 기능' : '기능 개선'}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
          </div>
          <h3 className="font-semibold text-white mt-1">{item.title}</h3>
          <p className="text-sm text-slate-400 whitespace-pre-wrap mt-2">{item.content}</p>
          <p className="text-[10px] text-slate-600 mt-3">{item.author} · {formatDate(item.createdAt)}</p>

          {item.adminReply && !isAdmin && (
            <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-300">관리자 답변</p>
              <p className="text-xs text-slate-400 whitespace-pre-wrap mt-1">{item.adminReply}</p>
            </div>
          )}

          {isAdmin && (
            <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
              <div className="flex flex-wrap gap-2">
                <select className="input-field min-w-36" value={status} onChange={event => setStatus(event.target.value as FeatureRequestStatus)}>
                  {Object.entries(STATUS_INFO).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
                </select>
                <input
                  className="input-field flex-1 min-w-52"
                  maxLength={1000}
                  placeholder="관리자 답변(선택)"
                  value={reply}
                  onChange={event => setReply(event.target.value)}
                />
                <button onClick={save} disabled={saving} className="btn-primary px-4 disabled:opacity-40">{saving ? '저장 중...' : '처리 저장'}</button>
                <button onClick={() => onDelete(item.id)} className="btn-ghost px-3 text-rose-400" title="요청 삭제"><Trash2 size={14} /></button>
              </div>
              {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}
