import { useMemo, useState } from 'react'
import { BriefcaseBusiness, Check, CheckCircle2, Circle, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react'
import type { QuickMemo, QuickMemoRetention } from '../../services/widgetLocalData'

export type WidgetMemoRetention = QuickMemoRetention
export type WidgetMemoItemView = QuickMemo

export interface WidgetQuickMemoProps {
  memos: readonly WidgetMemoItemView[]
  maxLength?: number
  busy?: boolean
  onAdd: (text: string, retention: WidgetMemoRetention) => void | Promise<unknown>
  onToggle: (id: string) => void | Promise<unknown>
  onUpdate: (id: string, text: string) => void | Promise<unknown>
  onDelete: (id: string) => void | Promise<unknown>
  onConvertToTask: (id: string) => void | Promise<unknown>
}

export default function WidgetQuickMemo({
  memos,
  maxLength = 240,
  busy = false,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  onConvertToTask,
}: WidgetQuickMemoProps) {
  const [text, setText] = useState('')
  const [retention, setRetention] = useState<QuickMemoRetention>('today')
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')
  const trimmed = text.trim()
  const sorted = useMemo(
    () => [...memos].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [memos],
  )

  const add = async () => {
    if (!trimmed || busy) return
    await onAdd(trimmed.slice(0, maxLength), retention)
    setText('')
  }

  return (
    <section className="widget-productivity-section widget-quick-memo no-drag" aria-label="빠른 메모">
      <header className="widget-productivity-section-heading">
        <span>
          <StickyNote size={13} aria-hidden="true" />
          <strong>빠른 메모</strong>
          {memos.length > 0 && <b className="widget-productivity-count">{memos.length}</b>}
        </span>
        <button
          type="button"
          className="widget-productivity-text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '접기' : '쓰기'}
        </button>
      </header>

      {expanded && (
        <div className="widget-memo-editor">
          <label>
            <span className="sr-only">메모 내용</span>
            <textarea
              value={text}
              maxLength={maxLength}
              rows={2}
              autoFocus
              placeholder="잠깐 기억할 내용을 적어두세요."
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void add()
              }}
            />
          </label>
          <div className="widget-memo-editor-footer">
            <span className="widget-segmented-control" aria-label="메모 보관 기간">
              <button
                type="button"
                className={retention === 'today' ? 'active' : ''}
                onClick={() => setRetention('today')}
              >
                오늘만
              </button>
              <button
                type="button"
                className={retention === 'until-deleted' ? 'active' : ''}
                onClick={() => setRetention('until-deleted')}
              >
                직접 삭제까지
              </button>
            </span>
            <span className="widget-memo-count">{text.length}/{maxLength}</span>
            <button
              type="button"
              className="widget-primary-mini-button"
              disabled={!trimmed || busy}
              onClick={() => void add()}
            >
              <Plus size={12} /> 저장
            </button>
          </div>
        </div>
      )}

      {sorted.length > 0 ? (
        <ul className="widget-memo-list">
          {sorted.slice(0, expanded ? 6 : 2).map((memo) => (
            <li key={memo.id} className={memo.completed ? 'is-completed' : ''}>
              <button
                type="button"
                className="widget-memo-toggle"
                disabled={busy}
                title={memo.completed ? '미완료로 되돌리기' : '완료 표시'}
                onClick={() => void onToggle(memo.id)}
              >
                {memo.completed ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              </button>
              <span className={`widget-memo-retention ${memo.retention}`}>
                {memo.retention === 'today' ? '오늘' : '계속'}
              </span>
              {editingId === memo.id ? (
                <input
                  className="widget-memo-inline-edit"
                  value={editingText}
                  maxLength={maxLength}
                  autoFocus
                  onChange={(event) => setEditingText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditingId('')
                    if (event.key === 'Enter' && editingText.trim()) {
                      void onUpdate(memo.id, editingText.trim())
                      setEditingId('')
                    }
                  }}
                />
              ) : <p title={memo.text}>{memo.text}</p>}
              <span className="widget-memo-actions">
                {editingId === memo.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !editingText.trim()}
                      title="수정 저장"
                      onClick={() => {
                        void onUpdate(memo.id, editingText.trim())
                        setEditingId('')
                      }}
                    ><Check size={12} /></button>
                    <button type="button" title="수정 취소" onClick={() => setEditingId('')}><X size={12} /></button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    title="메모 수정"
                    onClick={() => { setEditingId(memo.id); setEditingText(memo.text) }}
                  ><Pencil size={12} /></button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  title="개인 업무로 옮기기"
                  aria-label={`${memo.text} 개인 업무로 옮기기`}
                  onClick={() => void onConvertToTask(memo.id)}
                >
                  <BriefcaseBusiness size={12} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  title="메모 삭제"
                  aria-label={`${memo.text} 삭제`}
                  onClick={() => void onDelete(memo.id)}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </li>
          ))}
          {!expanded && sorted.length > 2 && (
            <li className="widget-memo-more">+{sorted.length - 2}건은 ‘쓰기’를 누르면 함께 보입니다.</li>
          )}
        </ul>
      ) : (
        !expanded && <p className="widget-productivity-empty">저장된 빠른 메모가 없습니다.</p>
      )}
    </section>
  )
}
