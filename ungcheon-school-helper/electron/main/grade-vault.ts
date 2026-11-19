import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import { createDecipheriv, createHash, randomBytes, webcrypto } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const supported = /^(?:ungcheon-grade-preview-v1|ungcheon-estimated-split-subjects-v1|ungcheon-estimated-split-helper-v1(?::[a-zA-Z0-9_-]+)?|ungcheon-split-planner-(?:first|second)-exam)$/
const format = Buffer.from('UNGRADE1')
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

function decrypt(data: Buffer) {
  if (!data.subarray(0, format.length).equals(format)) return safeStorage.decryptString(data)
  const wrappedLength = data.readUInt32BE(format.length), start = format.length + 4
  const ivOffset = start + wrappedLength
  const key = Buffer.from(safeStorage.decryptString(data.subarray(start, ivOffset)), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(ivOffset, ivOffset + 12))
  decipher.setAuthTag(data.subarray(-16))
  return Buffer.concat([decipher.update(data.subarray(ivOffset + 12, -16)), decipher.final()]).toString('utf8')
}

async function encryptAndVerify(value: string, temporary: string) {
  const bytes = randomBytes(32), iv = randomBytes(12)
  const wrapped = safeStorage.encryptString(bytes.toString('base64'))
  const size = Buffer.alloc(4)
  size.writeUInt32BE(wrapped.length)
  const key = await webcrypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt'])
  const encrypted = await webcrypto.subtle.encrypt({name:'AES-GCM', iv}, key, Buffer.from(value))
  const header = Buffer.concat([format, size, wrapped, iv])
  await writeFile(temporary, Buffer.concat([header, Buffer.from(encrypted)]))
  const saved = await readFile(temporary)
  if (!saved.subarray(0, header.length).equals(header)) throw Error()
  if (safeStorage.decryptString(wrapped) !== bytes.toString('base64')) throw Error()
  const plaintext = await webcrypto.subtle.decrypt({name:'AES-GCM', iv}, key, saved.subarray(header.length))
  if (Buffer.from(plaintext).toString('utf8') !== value) throw Error()
}

type Pending = {
  value: string; version: number; timer?: ReturnType<typeof setTimeout>; writing: boolean
  callbacks: Array<(ok: boolean) => void>
}

export function registerGradeVault(main: () => BrowserWindow | null, owner: () => string) {
  const edits = new Map<string, Pending>()
  const location = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, key: string) => {
    const teacher = owner()
    if (!teacher || event.sender !== main()?.webContents || event.senderFrame !== event.sender.mainFrame || typeof key !== 'string' || !supported.test(key)) throw Error()
    return join(app.getPath('userData'), 'grade-work', hash(teacher), hash(key) + '.bin')
  }
  const finish = (path: string, entry: Pending, ok: boolean) => {
    if (entry.timer) clearTimeout(entry.timer)
    if (ok) edits.delete(path)
    entry.callbacks.splice(0).forEach(report => report(ok))
  }
  const writeLatest = async (path: string, entry: Pending) => {
    if (entry.writing || edits.get(path) !== entry) return
    entry.writing = true
    const {value, version} = entry
    const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp'
    try {
      await mkdir(dirname(path), {recursive:true})
      await encryptAndVerify(value, temporary)
      // A later edit, deletion, or a foreground save always wins.
      if (edits.get(path) === entry && entry.version === version) {
        renameSync(temporary, path)
        finish(path, entry, true)
      }
    } catch {
      if (edits.get(path) === entry && entry.version === version) finish(path, entry, false)
    } finally {
      entry.writing = false
      void rm(temporary, {force:true}).catch(() => {})
      if (edits.get(path) === entry && entry.version !== version) void writeLatest(path, entry)
    }
  }
  ipcMain.handle('grade:queueSave', async (event, key: string, value: string) => {
    try {
      const path = location(event, key)
      if (typeof value !== 'string' || !safeStorage.isEncryptionAvailable()) throw Error()
      const entry: Pending = edits.get(path) || {value, version:0, writing:false, callbacks:[]}
      if (entry.value !== value) entry.version++
      entry.value = value
      edits.set(path, entry)
      return await new Promise<boolean>(resolve => {
        entry.callbacks.push(resolve)
        if (!entry.writing && !entry.timer) {
          entry.timer = setTimeout(() => {entry.timer = undefined; void writeLatest(path, entry)}, 180)
        }
      })
    } catch {return false}
  })
  const writeNow = (path: string, value: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw Error()
    mkdirSync(dirname(path), {recursive:true})
    const temporary = path + '.tmp'
    writeFileSync(temporary, safeStorage.encryptString(value))
    if (safeStorage.decryptString(readFileSync(temporary)) !== value) throw Error()
    renameSync(temporary, path)
  }
  ipcMain.on('grade:vault', (event, action: string, key: string, value?: string) => {
    try {
      const path = location(event, key), entry = edits.get(path)
      let result: string | null = null
      if (action === 'remove') {
        if (existsSync(path)) unlinkSync(path)
        if (entry) finish(path, entry, true)
      } else if (action === 'get') {
        if (!safeStorage.isEncryptionAvailable()) throw Error()
        result = entry?.value ?? (existsSync(path) ? decrypt(readFileSync(path)) : null)
      } else if (action === 'set' && typeof value === 'string') {
        writeNow(path, value)
        if (entry) finish(path, entry, true)
      } else throw Error()
      event.returnValue = { ok:true, value:result }
    } catch {event.returnValue = {ok:false}}
  })
  // Electron cannot wait for an outstanding IPC save during quit/update.
  const flush = () => {
    try {
      for (const [path, entry] of edits) {
        writeNow(path, entry.value)
        finish(path, entry, true)
      }
      return true
    } catch {
      dialog.showErrorBox('성적 저장 확인', '마지막 수정을 저장하지 못했습니다. 저장 공간을 확인한 후 다시 종료하거나 이어서 하기 자료를 내려받아 주세요.')
      return false
    }
  }
  app.on('before-quit', event => {if (!flush()) event.preventDefault()})
  return flush
}
