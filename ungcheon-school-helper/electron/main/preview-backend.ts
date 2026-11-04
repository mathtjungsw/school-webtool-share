// Isolated loopback test service. Never connects to the production school hub.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, statSync } from 'fs'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'

export async function startPreviewBackend(configPath: string) {
  const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null
  const sessions = new Map<string, { name: string; expiresAt: string }>()
  const failures = new Map<string, { count: number; until: number }>()
  const sha = (v: string) => createHash('sha256').update(v).digest('hex')
  const sessionFile = configPath + '.sessions'
  const fingerprint = cfg ? sha(cfg.salt + cfg.verifier) : ''
  try { const saved = JSON.parse(readFileSync(sessionFile,'utf8')); if(saved.fingerprint===fingerprint) for(const [key,value] of saved.sessions) sessions.set(key,value) } catch {}
  const persist = () => { if(cfg) writeFileSync(sessionFile,JSON.stringify({fingerprint,sessions:[...sessions].filter(([,value])=>Date.parse(value.expiresAt)>Date.now())})) }
  const revision = (d: any) => { const info=statSync(d.path);return info.size+':'+info.mtimeMs }

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.writeHead(405); res.end('{}'); return }
    let raw = ''
    try {
      for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw new Error('request-too-large') }
      const body = JSON.parse(raw)
      const ok = (data: unknown) => res.end(JSON.stringify({ ok: true, data }))
      const fail = (code: string) => { res.statusCode = 403; res.end(JSON.stringify({ ok: false, code, error: code === 'AUTH_FAILED' ? '이름 또는 비밀번호를 확인해 주세요.' : '로그인이 필요합니다.' })) }
      if (body.action === 'staffLogin') {
        if (!cfg) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, error: '시험 서버 설정이 필요합니다. 관리자에게 시험 서버 초기화를 요청하세요.' })); return }
        const name = String(body.name || '').trim()
        const attempt = failures.get(name) || { count: 0, until: 0 }
        if (attempt.until > Date.now()) { fail('AUTH_FAILED'); return }
        const actual = scryptSync(String(body.password || ''), cfg.salt, 32)
        const expected = Buffer.from(cfg.verifier, 'hex')
        if (!cfg.names.includes(name) || expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
          attempt.count++; if (attempt.count >= 5) attempt.until = Date.now() + 30000
          failures.set(name, attempt); fail('AUTH_FAILED'); return
        }
        failures.delete(name)
        const token = randomBytes(32).toString('hex')
        const session = { name, expiresAt: new Date(Date.now() + 120 * 3600000).toISOString() }
        sessions.set(sha(token), session); persist(); ok({ ...session, token }); return
      }
      const tokenKey = sha(String(body.staffToken || ''))
      const auth = sessions.get(tokenKey)
      if (!auth || Date.parse(auth.expiresAt) <= Date.now() || !cfg.names.includes(auth.name)) { fail('AUTH_REQUIRED'); return }
      if (body.action === 'staffSession') { ok(auth); return }
      if (body.action === 'staffLogout') { sessions.delete(tokenKey); persist(); ok(true); return }
      if (body.action === 'caseLibrary') {
        ok((cfg?.documents || []).map((d: any) => ({ id: d.id, title: d.title, revision: revision(d) }))); return
      }
      if (body.action === 'caseDocument') {
        const doc = cfg?.documents?.find((d: any) => d.id === body.id)
        if (!doc) throw new Error('document-not-found')
        const bytes = readFileSync(doc.path)
        if (bytes.length > 100 * 1024 * 1024) throw new Error('document-too-large')
        ok({ id: doc.id, title: doc.title, revision: revision(doc), data: bytes.toString('base64') }); return
      }
      // Existing pages receive empty test data, never production records.
      const emptyObjects: Record<string, unknown> = {
        getStaffRoster: { members: cfg?.names?.map((name: string, i: number) => ({ id: String(i), name, department: '시험 환경', subject: '', homeroom: '' })) || [] },
        getSyncManifest: { resources: {} }, listCommitteeState: { members: [], events: [] },
        getTimetable: null, getStudentTimetable: null, getStudentRoster: { students: [] },
        getNeisSnapshot: null, getWidgetAttendanceSummaries: { summaries: [], lessons: [] },
      }
      if (String(body.action).startsWith('list') || String(body.action).startsWith('get')) {
        ok(Object.prototype.hasOwnProperty.call(emptyObjects, body.action) ? emptyObjects[body.action] : []); return
      }
      res.statusCode = 403; res.end(JSON.stringify({ ok: false, error: '시험 환경에서는 운영자료 변경을 수행하지 않습니다.' }))
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: '시험 서버 요청을 처리하지 못했습니다.' }))
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() }
}
