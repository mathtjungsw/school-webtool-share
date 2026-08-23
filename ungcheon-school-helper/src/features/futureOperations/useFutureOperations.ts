import { useCallback, useEffect, useState } from 'react'
import { loadFutureOperationsState, saveFutureOperationsState, subscribeFutureOperations } from './storage'
import type { FutureOperationsState } from './types'

export function useFutureOperations() {
  const [state, setState] = useState<FutureOperationsState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    void loadFutureOperationsState().then(value => { if (active) setState(value) })
    const unsubscribe = subscribeFutureOperations(value => { if (active) setState(value) })
    return () => { active = false; unsubscribe() }
  }, [])

  const update = useCallback(async (updater: (current: FutureOperationsState) => FutureOperationsState) => {
    setSaving(true)
    try {
      const current = await loadFutureOperationsState()
      const next = updater(current)
      setState(await saveFutureOperationsState(next))
    } finally {
      setSaving(false)
    }
  }, [])

  return { state, saving, update }
}

