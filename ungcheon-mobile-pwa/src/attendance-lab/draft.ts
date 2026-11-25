import { useCallback, useRef, useState } from 'react'
import type { AttendanceStatus } from '../../../ungcheon-school-helper/electron/main/attendance-lab-data'

export type AttendanceEdit = { student?: string; period?: number; value: AttendanceStatus }
type Draft<T> = { snapshot: T | null; edits: readonly AttendanceEdit[] }
let writeQueue = Promise.resolve()

export function latestAttendanceEdit(edits: readonly AttendanceEdit[], student: string, period?: number) {
  return edits.findLast(edit => (edit.student === undefined || edit.student === student) &&
    (edit.period === undefined || edit.period === period))
}

export function useAttendanceDraft<T>() {
  const [draft, setDraft] = useState<Draft<T>>({ snapshot: null, edits: [] })
  const current = useRef(draft)
  const publish = useCallback((next: Draft<T>) => {
    current.current = next
    setDraft(next)
  }, [])

  const updateSnapshot = useCallback((update: (previous: T | null) => T | null) => {
    publish({ ...current.current, snapshot: update(current.current.snapshot) })
  }, [publish])

  function send(edit: AttendanceEdit | undefined, write: () => Promise<(snapshot: T) => T>) {
    const last = current.current.edits.at(-1)
    if (edit && last && last.student === edit.student && last.period === edit.period && last.value === edit.value) return writeQueue
    if (edit) publish({ ...current.current, edits: [...current.current.edits, edit] })
    function finish(update?: (snapshot: T) => T) {
      const previous = current.current
      publish({
        snapshot: update && previous.snapshot ? update(previous.snapshot) : previous.snapshot,
        edits: edit ? previous.edits.filter(item => item !== edit) : previous.edits,
      })
    }

    // Writes can outlive the visible board and touch the same Firestore document.
    const saved = writeQueue.then(async () => {
      try { finish(await write()) }
      catch (error) { finish(); throw error }
    })
    writeQueue = saved.catch(() => {})
    return saved
  }

  return { ...draft, current, updateSnapshot, send }
}
