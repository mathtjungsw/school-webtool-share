const readIntervals = {
  getSyncManifest: 60_000,
  getWidgetAttendanceSummaries: 5 * 60_000,
} as const

type SharedRead = keyof typeof readIntervals

type ReadEntry<T> = {
  key: string
  pending?: Promise<T>
  completed?: { value: T; expiresAt: number }
}

export function createSchoolHubReadCache<T>() {
  const entries = new Map<SharedRead, ReadEntry<T>>()

  return {
    read(action: SharedRead, key: string, force: boolean, load: () => Promise<T>): Promise<T> {
      const previous = entries.get(action)
      if (previous?.key === key) {
        if (previous.pending) return previous.pending
        if (!force && previous.completed && previous.completed.expiresAt > Date.now()) {
          return Promise.resolve(previous.completed.value)
        }
      }

      const entry: ReadEntry<T> = { key }
      const expiresAt = Date.now() + readIntervals[action]
      // Share failed responses for the same interval too. A manual refresh
      // can still reach the server immediately after an outage.
      entry.pending = load().then(value => {
        entry.completed = { value, expiresAt }
        return value
      }).finally(() => {
        entry.pending = undefined
      })
      entries.set(action, entry)
      return entry.pending
    },
    invalidateManifest() {
      entries.delete('getSyncManifest')
    },
  }
}
