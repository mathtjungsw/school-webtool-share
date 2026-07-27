import { useAppStore } from '../stores/appStore'
import type { LogEntry } from '../types'

export const logger = {
  info:  (message: string, source = '') => useAppStore.getState().addLog('info',  message, source),
  warn:  (message: string, source = '') => useAppStore.getState().addLog('warn',  message, source),
  error: (message: string, source = '') => useAppStore.getState().addLog('error', message, source),
  log:   (level: LogEntry['level'], message: string, source = '') =>
    useAppStore.getState().addLog(level, message, source),
}
