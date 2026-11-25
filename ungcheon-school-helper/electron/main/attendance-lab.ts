import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  ATTENDANCE_STATUSES, LAB_DATES, labAccess, labBoardPath, labOptionsPath, labRecordPath, makeLabFixtures, permittedLabOptions,
  type LabChange, type LabField, type LabOptions, type LabRecord, type LabRole, type LabRow, type LabStaff,
} from './attendance-lab-data'

const DATABASE = 'projects/demo-ungcheon-attendance/databases/(default)'
const API_PATH = '/attendance-lab-api/'
type Document = { name: string; fields: { payload: { stringValue: string } } }
type Scope = { date: string; period: number; role: LabRole; group: string }
export type LabSession = { staff: LabStaff; expiresAt: number; active: () => boolean }
type Subscription = { session: LabSession; response: ServerResponse; fields: Map<string, Omit<LabChange, 'value'>>; pending: LabChange[] | null }

function reply(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function sendEvent(response: ServerResponse, event: string, data: unknown) {
  if (!response.destroyed && !response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function dayAndPeriod(input: URLSearchParams) {
  const date = input.get('date') || ''
  const period = Number(input.get('period'))
  return LAB_DATES.includes(date) && Number.isInteger(period) && period >= 1 && period <= 7 ? { date, period } : null
}

function scopeFrom(input: URLSearchParams): Scope | null {
  const day = dayAndPeriod(input)
  const role = input.get('role')
  const group = input.get('group') || ''
  return day && (role === 'homeroom' || role === 'subject') && /^[a-z0-9-]{1,30}$/.test(group) ? { ...day, role, group } : null
}

export function createAttendanceLab(authorize: (token: string) => LabSession | null) {
  const port = Number(process.env.UNGCHEON_ATTENDANCE_EMULATOR_PORT || 8187)
  const endpoint = `http://127.0.0.1:${port}/v1/${DATABASE}`
  const subscriptions = new Set<Subscription>()
  const writes = new Map<string, Promise<void>>()
  let ready: Promise<void> | undefined

  async function firestore(path: string, body?: unknown) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid emulator port')
    const response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (response.status === 404 && body === undefined) return null
    if (!response.ok) throw new Error('Emulator request failed')
    return response.json()
  }

  function document(path: string, payload: unknown): Document {
    return { name: `${DATABASE}/documents/${path}`, fields: { payload: { stringValue: JSON.stringify(payload) } } }
  }

  function unpack<T>(doc: Document): T {
    return JSON.parse(doc.fields.payload.stringValue) as T
  }

  async function get<T>(path: string): Promise<T | null> {
    const result = await firestore(`/documents/${path}`)
    return result ? unpack<T>(result) : null
  }

  function seed() {
    if (!ready) ready = (async () => {
      const marker = 'labMeta/fixtures-2'
      if (await get(marker)) return
      const alreadySeeded = Boolean(await get('labMeta/fixtures-1'))
      const writes = [...makeLabFixtures()]
        .filter(([, payload]) => !alreadySeeded || typeof payload !== 'string')
        .map(([path, payload]) => ({ update: document(path, payload) }))
      try {
        await firestore('/documents:commit', { writes: [...writes, { update: document(marker, 'ready'), currentDocument: { exists: false } }] })
      } catch (error) {
        if (!await get(marker)) throw error
      }
    })().catch(error => { ready = undefined; throw error })
    return ready
  }

  async function board(scope: Scope) {
    return get<LabRow[]>(labBoardPath(scope.date, scope.period, scope.role, scope.group))
  }

  function closeUnauthorized() {
    for (const subscription of subscriptions) {
      if (subscription.session.active()) continue
      sendEvent(subscription.response, 'session-expired', null)
      subscription.response.end()
    }
  }

  async function stream(response: ServerResponse, scope: Scope, session: LabSession) {
    const rows = await board(scope)
    if (!rows) { reply(response, 404, { error: '선택한 학급이나 수업이 없습니다.' }); return }
    if (!session.active()) { reply(response, 401, { error: '다시 로그인해 주세요.' }); return }
    if (response.destroyed) return
    if (subscriptions.size >= 32) { reply(response, 429, { error: '열려 있는 시험 화면이 많습니다.' }); return }
    const fields = new Map<string, Omit<LabChange, 'value'>>()
    for (const row of rows) {
      fields.set(labRecordPath(scope.date, scope.period, row, 'homeroom'), { student: row.id, field: 'homeroom' })
      if (row.lesson) fields.set(labRecordPath(scope.date, scope.period, row, 'subject'), { student: row.id, field: 'subject' })
      fields.set(labRecordPath(scope.date, scope.period, row, 'note'), { student: row.id, field: 'note' })
    }
    const subscription: Subscription = { session, response, fields, pending: [] }
    subscriptions.add(subscription)
    const expiry = setTimeout(closeUnauthorized, Math.max(0, session.expiresAt - Date.now() + 1))
    expiry.unref()
    response.on('close', () => { clearTimeout(expiry); subscriptions.delete(subscription) })
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' })
    response.flushHeaders()
    try {
      const documents = Array.from(fields.keys(), path => `${DATABASE}/documents/${path}`)
      const result: { found?: Document }[] = documents.length ? await firestore('/documents:batchGet', { documents }) : []
      if (!session.active()) { closeUnauthorized(); return }
      const records: Record<string, LabRecord> = {}
      for (const { found } of result) {
        if (!found) continue
        const target = fields.get(found.name.slice(`${DATABASE}/documents/`.length))
        if (!target) continue
        Object.assign(records[target.student] ??= {}, { [target.field]: unpack<string>(found) })
      }
      sendEvent(response, 'board', { rows, records })
      for (const change of subscription.pending ?? []) sendEvent(response, 'change', change)
      subscription.pending = null
    } catch {
      sendEvent(response, 'unavailable', null)
      response.end()
    }
  }

  async function write(scope: Scope, session: LabSession, student: string, field: LabField, value: string) {
    const valid = scope.role === field || (scope.role === 'homeroom' && field === 'note')
    if (!valid || typeof value !== 'string' || (field === 'note' ? value.length > 160 : !ATTENDANCE_STATUSES.some(status => status === value))) return false
    const rows = await board(scope)
    const row = rows?.find(item => item.id === student)
    if (!row || (field === 'subject' && !row.lesson)) return false
    const path = labRecordPath(scope.date, scope.period, row, field)
    const commit = (writes.get(path) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!session.active()) throw new Error('Session expired')
      await firestore('/documents:commit', { writes: [{ update: document(path, value.trim()) }] })
      closeUnauthorized()
      for (const subscription of subscriptions) {
        if (!subscription.session.active()) continue
        const item = subscription.fields.get(path)
        if (!item) continue
        const change = { ...item, value: value.trim() }
        if (subscription.pending) subscription.pending.push(change)
        else sendEvent(subscription.response, 'change', change)
      }
    })
    writes.set(path, commit)
    try { await commit } finally { if (writes.get(path) === commit) writes.delete(path) }
    return true
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (!url.pathname.startsWith(API_PATH)) return false
    const action = url.pathname.slice(API_PATH.length)
    try {
      const token = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.authorization ?? '')?.[1]
      const session = token ? authorize(token) : null
      if (!session?.active()) { reply(response, 401, { error: '로그인 뒤 다시 이용해 주세요.' }); return true }
      const access = labAccess(session.staff)
      if (request.method === 'GET' && action === 'dates') {
        reply(response, 200, { dates: LAB_DATES, access }); return true
      }
      if (!access.roles.length || (request.method === 'POST' && access.readOnly)) {
        reply(response, 403, { error: '출결 자료를 볼 수 있거나 수정할 수 있는 권한이 없습니다.' }); return true
      }
      const scope = scopeFrom(url.searchParams)
      if (request.method === 'GET' && action === 'options') {
        const selected = dayAndPeriod(url.searchParams)
        if (!selected) { reply(response, 400, { error: '시험 날짜와 교시를 다시 선택해 주세요.' }); return true }
        await seed()
        const options = await get<LabOptions>(labOptionsPath(selected.date, selected.period))
        if (!session.active()) reply(response, 401, { error: '다시 로그인해 주세요.' })
        else reply(response, 200, permittedLabOptions(session.staff, options ?? { classes: [], lessons: [] }))
        return true
      }
      if (!scope || !((request.method === 'GET' && action === 'board') || (request.method === 'POST' && action === 'record'))) {
        reply(response, 400, { error: '날짜·교시·수업을 확인해 주세요.' }); return true
      }
      await seed()
      const options = await get<LabOptions>(labOptionsPath(scope.date, scope.period))
      const permitted = permittedLabOptions(session.staff, options ?? { classes: [], lessons: [] })
      const groups = scope.role === 'homeroom' ? permitted.classes : permitted.lessons
      if (!session.active()) { reply(response, 401, { error: '다시 로그인해 주세요.' }); return true }
      if (!groups.some(group => group.id === scope.group)) { reply(response, 403, { error: '담당하는 학급과 수업만 열 수 있습니다.' }); return true }
      if (action === 'board') {
        await stream(response, scope, session)
      } else {
        let raw = ''
        for await (const chunk of request) {
          raw += chunk
          if (raw.length > 2048) { reply(response, 413, { error: '비고가 너무 깁니다.' }); return true }
        }
        let record: LabChange
        try { record = JSON.parse(raw) } catch { reply(response, 400, { error: '입력값을 확인해 주세요.' }); return true }
        const saved = record && await write(scope, session, record.student, record.field, record.value)
        reply(response, saved ? 200 : 400, saved ? { saved: true } : { error: '이 학급 또는 수업에서 수정할 수 없는 기록입니다.' })
      }
    } catch {
      if (!response.headersSent) reply(response, 503, { error: '시험용 Firebase에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.' })
      else response.end()
    }
    return true
  }

  return { handle, closeUnauthorized, close: () => { for (const { response } of subscriptions) response.end() } }
}
