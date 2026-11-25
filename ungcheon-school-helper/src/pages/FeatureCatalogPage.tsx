import { useState } from 'react'
import { ArrowUpRight, ChevronDown, EyeOff, Grid2X2, Images, Search, Star } from 'lucide-react'
import clsx from 'clsx'
import { NAVIGATION_BY_ID, type FeaturePreview, type NavigationItem } from '../config/navigationRegistry'
import { canAddShortcut, MENU_GROUPS } from '../services/navigationPreferences'
import { normalizeAssistantText } from '../services/workAssistantSearch'
import calendar from '../assets/function-previews/calendar.webp'
import table from '../assets/function-previews/table.webp'
import check from '../assets/function-previews/check.webp'
import documentPreview from '../assets/function-previews/document.webp'
import chart from '../assets/function-previews/chart.webp'
import search from '../assets/function-previews/search.webp'
import books from '../assets/function-previews/books.webp'
import tools from '../assets/function-previews/tools.webp'

const PREVIEW_IMAGES: Record<FeaturePreview, string> = { calendar, table, check, document: documentPreview, chart, search, books, tools }
const groupedIds = new Set(MENU_GROUPS.flatMap(group => group.items))

interface Props {
  mode: 'catalog' | 'overview'
  items: NavigationItem[]
  shortcuts: string[]
  canEdit: boolean
  onNavigate: (id: string) => void
  onToggleShortcut: (id: string) => void
  onHide: (id: string) => void
}

export default function FeatureCatalogPage({ mode, items, shortcuts, canEdit, onNavigate, onToggleShortcut, onHide }: Props) {
  const [query, setQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const isOverview = mode === 'overview'
  const visibleItems = isOverview ? [...items, NAVIGATION_BY_ID.get('dashboard')!, NAVIGATION_BY_ID.get('settings')!] : items
  const needles = query.toLocaleLowerCase('ko-KR').trim().split(/\s+/).map(normalizeAssistantText).filter(Boolean)
  const groups = [
    ...MENU_GROUPS.map(group => ({ id: group.id, label: group.label, entries: visibleItems.filter(item => group.items.includes(item.id)) })),
    { id: 'other', label: '기타', entries: visibleItems.filter(item => !groupedIds.has(item.id)) },
  ].filter(group => group.entries.length)
  const results = groups.filter(group => !isOverview || !selectedGroup || group.id === selectedGroup).map(group => ({
    ...group, entries: group.entries.filter(item => {
      const content = normalizeAssistantText([item.label, item.description, group.label, ...(item.searchAliases ?? [])].join(' '))
      return needles.every(needle => content.includes(needle))
    }),
  })).filter(group => group.entries.length)
  const resultCount = results.reduce((count, group) => count + group.entries.length, 0)

  const shortcutButton = (item: NavigationItem) => {
    if (!canAddShortcut(item.id)) return null
    const added = shortcuts.includes(item.id)
    const label = added ? `${item.label} 바로가기에서 빼기` : `${item.label} 내 바로가기에 추가`
    return <button type="button" aria-label={label} title={label} aria-pressed={added} disabled={!canEdit}
      onClick={() => onToggleShortcut(item.id)}
      className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 hover:bg-amber-50 disabled:opacity-50',
        added ? 'bg-amber-50 text-amber-800' : 'bg-white text-slate-600')}>
      <Star size={16} aria-hidden="true" fill={added ? 'currentColor' : 'none'} />
    </button>
  }

  return (
    <section className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8">
      <header className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white via-[#fffdf6] to-amber-50 px-5 py-5 sm:px-7">
        <nav aria-label="기능 목록 보기 방식" className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-xl border border-amber-200 bg-white p-1">
          {([
            { id: 'feature_catalog', label: '전체 메뉴', Icon: Grid2X2, selected: !isOverview },
            { id: 'feature_overview', label: '기능 훑어보기', Icon: Images, selected: isOverview },
          ]).map(({ id, label, Icon, selected }) => (
            <button type="button" key={id} onClick={() => onNavigate(id)} aria-current={selected ? 'page' : undefined}
              className={clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
                selected ? 'bg-amber-100 text-amber-950' : 'text-slate-600 hover:bg-slate-50')}>
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{isOverview ? '기능 훑어보기' : '전체 메뉴'}</h1>
            <p className="mt-2 text-sm text-slate-700">{isOverview ? '각 기능으로 할 수 있는 일을 그림과 한 문장으로 확인하세요.' : '분야를 열어 기능을 찾고, ★를 눌러 내 바로가기에 추가하세요.'}</p>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 text-slate-600 sm:max-w-xs">
            <Search size={17} aria-hidden="true" className="shrink-0" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)}
              aria-label="기능 찾기" placeholder="기능 찾기" className="min-w-0 w-full bg-transparent text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500" />
          </label>
        </div>
      </header>

      {isOverview && <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="분야별 기능">
        {[{ id: '', label: '전체' }, ...groups].map(group => (
          <button key={group.id} type="button" onClick={() => setSelectedGroup(group.id)} aria-pressed={selectedGroup === group.id}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-semibold',
              selectedGroup === group.id ? 'border-amber-300 bg-amber-100 text-amber-950' : 'border-slate-200 bg-white text-slate-600 hover:bg-amber-50')}>
            {group.label}
          </button>
        ))}
      </div>}

      {!!needles.length && <p className="mt-4 text-sm text-slate-600" role="status">검색 결과 {resultCount}개</p>}
      {results.length === 0 && <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">해당하는 기능이 없습니다. 다른 검색어를 입력해 보세요.</p>}

      {isOverview ? (
        <div className="mt-6 space-y-7">
          {results.map(group => (
            <section key={group.id} aria-labelledby={`overview-${group.id}`}>
              <h2 className="mb-3 text-base font-bold text-slate-900" id={`overview-${group.id}`}>{group.label}</h2>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {group.entries.map(item => (
                  <article key={item.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <img src={PREVIEW_IMAGES[item.preview]} alt="" width={480} height={160} loading="lazy" className="h-24 w-full object-cover" />
                    <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3.5">
                      <h3 className="text-sm font-bold text-slate-950">{item.label}</h3>
                      <p className="mb-3 mt-1.5 flex-1 break-keep text-sm leading-6 text-slate-600">{item.description}</p>
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => onNavigate(item.id)} aria-label={`${item.label} 열기`}
                          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-amber-900 hover:bg-amber-50">
                          열기 <ArrowUpRight size={15} aria-hidden="true" />
                        </button>
                        {shortcutButton(item)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {results.map(group => {
            const open = !!needles.length || openGroups.includes(group.id)
            return <section key={group.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2>
                <button type="button" aria-expanded={open} aria-controls={`catalog-${group.id}`}
                  aria-disabled={!!needles.length}
                  onClick={() => {
                    if (!needles.length) setOpenGroups(values => values.includes(group.id) ? values.filter(id => id !== group.id) : [...values, group.id])
                  }}
                  className="flex min-h-12 w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-amber-50">
                  <ChevronDown size={16} aria-hidden="true" className={!open ? '-rotate-90' : ''} />
                  <span>{group.label}</span><span className="ml-auto text-xs font-medium text-slate-600">{group.entries.length}개</span>
                </button>
              </h2>
              <ul id={`catalog-${group.id}`} hidden={!open} className="divide-y divide-slate-100 border-t border-slate-100">
                {group.entries.map(item => {
                  const Icon = item.icon
                  return <li key={item.id} className="flex items-center gap-2 px-4 py-2">
                    <button type="button" onClick={() => onNavigate(item.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50">
                      <Icon size={16} aria-hidden="true" className="shrink-0 text-slate-500" /> {item.label}
                    </button>
                    {shortcutButton(item)}
                    {canAddShortcut(item.id) && <button type="button" onClick={() => onHide(item.id)} title={`${item.label} 메뉴 숨기기`}
                      aria-label={`${item.label} 메뉴 숨기기`} disabled={!canEdit}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                      <EyeOff size={16} aria-hidden="true" />
                    </button>}
                  </li>
                })}
              </ul>
            </section>
          })}
        </div>
      )}
    </section>
  )
}
