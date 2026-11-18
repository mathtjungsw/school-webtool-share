import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const supported = /^(?:ungcheon-grade-preview-v1|ungcheon-estimated-split-subjects-v1|ungcheon-estimated-split-helper-v1(?::[a-zA-Z0-9_-]+)?|ungcheon-split-planner-(?:first|second)-exam)$/
export function registerGradeVault(main: () => BrowserWindow | null, owner: () => string) {
  ipcMain.on('grade:vault', (event, action: string, key: string, value?: string) => {
    try {
      const teacher = owner()
      if (!teacher || event.sender !== main()?.webContents || event.senderFrame !== event.sender.mainFrame || !supported.test(key)) throw Error()
      const dir = join(app.getPath('userData'), 'grade-work', createHash('sha256').update(teacher).digest('hex'))
      const path = join(dir, createHash('sha256').update(key).digest('hex') + '.bin')
      let result: string | null = null
      if (action === 'remove') { if (existsSync(path)) unlinkSync(path) }
      else {
        if (!safeStorage.isEncryptionAvailable()) throw Error()
        if (action === 'get') result = existsSync(path) ? safeStorage.decryptString(readFileSync(path)) : null
        else if (action === 'set' && typeof value === 'string') {
          mkdirSync(dir, { recursive: true })
          const temp = path + '.tmp'
          writeFileSync(temp, safeStorage.encryptString(value))
          if (safeStorage.decryptString(readFileSync(temp)) !== value) throw Error()
          renameSync(temp, path)
        } else throw Error()
      }
      event.returnValue = { ok: true, value: result }
    } catch { event.returnValue = { ok: false } }
  })
}
