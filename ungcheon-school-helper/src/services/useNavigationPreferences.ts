import { useEffect, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { canAddShortcut, HIDDEN_MENUS_KEY, knownMenuIds, MAIN_MENU_IDS, restoreShortcuts, SHORTCUTS_KEY } from './navigationPreferences'

export function useNavigationPreferences() {
  const [shortcuts, setShortcuts] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const currentShortcuts = useRef<string[]>([])
  const writes = useRef(Promise.resolve())

  useEffect(() => {
    const electron = window.electron
    if (!electron) return
    let active = true
    let hiddenVersion = 0
    const readHidden = async () => {
      const version = ++hiddenVersion
      try {
        const value = await electron.configGet(HIDDEN_MENUS_KEY)
        if (active && version === hiddenVersion) setHidden(knownMenuIds(value).filter(id => !MAIN_MENU_IDS.includes(id)))
      } catch {
        if (active && version === hiddenVersion) setError('숨긴 메뉴 설정을 불러오지 못했습니다.')
      }
    }
    const read = async () => {
      try {
        const [saved, oldPins, oldFavorites, oldOrder] = await Promise.all([
          electron.configGet(SHORTCUTS_KEY), electron.configGet('sidebar.pinnedMenus.v1'),
          electron.configGet('dashboard.favorites'), electron.configGet('sidebar.menuOrder'), readHidden(),
        ])
        if (!active) return
        const next = restoreShortcuts(saved, oldPins, oldFavorites, oldOrder)
        currentShortcuts.current = next
        setShortcuts(next)
        setOrder(knownMenuIds(oldOrder))
        setReady(true)
      } catch {
        if (active) setError('바로가기 설정을 불러오지 못했습니다.')
      }
    }
    void read()
    window.addEventListener('sidebar:preferences-updated', readHidden)
    return () => {
      active = false
      window.removeEventListener('sidebar:preferences-updated', readHidden)
    }
  }, [])

  const save = (key: string, value: string[]) => {
    setError('')
    writes.current = writes.current.then(async () => {
      await window.electron.configSet(key, value)
    }).catch(() => { setError('메뉴 설정을 이 PC에 저장하지 못했습니다.') })
  }

  const saveShortcuts = (next: string[]) => {
    currentShortcuts.current = next
    setShortcuts(next)
    save(SHORTCUTS_KEY, next)
  }

  return {
    shortcuts, hidden, order, ready, error,
    toggleShortcut(id: string) {
      if (!ready || !canAddShortcut(id)) return
      const before = currentShortcuts.current
      saveShortcuts(before.includes(id) ? before.filter(item => item !== id) : [...before, id])
    },
    reorderShortcuts(activeId: string, targetId: string) {
      const before = currentShortcuts.current
      const from = before.indexOf(activeId), to = before.indexOf(targetId)
      if (ready && from >= 0 && to >= 0 && from !== to) saveShortcuts(arrayMove(before, from, to))
    },
    hideMenu(id: string) {
      if (!ready || MAIN_MENU_IDS.includes(id) || hidden.includes(id)) return
      const next = [...hidden, id]
      setHidden(next)
      save(HIDDEN_MENUS_KEY, next)
    },
  }
}

export type NavigationPreferences = ReturnType<typeof useNavigationPreferences>
