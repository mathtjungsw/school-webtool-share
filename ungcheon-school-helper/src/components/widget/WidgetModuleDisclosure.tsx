import { createContext, useContext, useId, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import './widgetModuleDisclosure.css'

interface DisclosureState {
  collapsed: boolean
  onToggle: () => void
  bodyId?: string
  dragHandle?: ReactNode
}

const DisclosureContext = createContext<DisclosureState>({ collapsed: false, onToggle: () => {} })

/** Presentation only: children stay mounted and the caller owns durable settings. */
export function WidgetModuleDisclosure({ collapsed, onToggle, dragHandle, children }: DisclosureState & { children: ReactNode }) {
  const bodyId = useId()
  return <DisclosureContext.Provider value={{ collapsed, onToggle, bodyId, dragHandle }}>{children}</DisclosureContext.Provider>
}

export function useWidgetModuleDisclosure() {
  return useContext(DisclosureContext)
}

export function WidgetModuleHeader({ title, icon, summary, badge, actions, className = '' }: {
  title: string
  icon?: ReactNode
  summary: string
  badge?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  const { collapsed, onToggle, bodyId, dragHandle } = useWidgetModuleDisclosure()
  return (
    <header className={`widget-module-heading ${collapsed ? 'is-collapsed' : ''} ${className}`}>
      {dragHandle}
      <span className="widget-module-heading-label">{icon}<strong>{title}</strong></span>
      {collapsed
        ? <span className="widget-module-summary" title={summary}>{summary}</span>
        : <span className="widget-module-heading-badge">{badge}</span>}
      {!collapsed && actions && <span className="widget-module-heading-actions">{actions}</span>}
      <button type="button" className="widget-module-toggle" onClick={onToggle}
        title={`${title} ${collapsed ? '펼치기' : '접기'}`}
        aria-label={`${title} ${collapsed ? '펼치기' : '접기'}`}
        aria-expanded={!collapsed} aria-controls={bodyId}>
        {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>
    </header>
  )
}

export function WidgetModuleBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { collapsed, bodyId } = useWidgetModuleDisclosure()
  return <div id={bodyId} className={`widget-module-body ${className}`} hidden={collapsed}>{children}</div>
}
