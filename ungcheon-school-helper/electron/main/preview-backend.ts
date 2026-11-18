// Isolated loopback test service. Never connects to the production school hub.
import { resolve, sep, extname } from 'node:path'
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, statSync } from 'fs'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'

export async function startPreviewBackend(configPath: string, mobileDirectory: string) {
  let cfg: any = null
  const sessions = new Map<string, { name: string; expiresAt: string }>()
  const grants = new Map<string, { session: string; expires: number }>()
  const failures = new Map<string, { count: number; until: number }>()
  const sha = (v: string) => createHash('sha256').update(v).digest('hex')
  const sessionFile = configPath + '.sessions'
  let fingerprint = ''
  const refreshConfiguration = () => {
    let next: any = null
    try { if(existsSync(configPath))next=JSON.parse(readFileSync(configPath,'utf8')) } catch {}
    if(!next || typeof next.salt!=='string' || !/^[a-f0-9]{64}$/.test(next.verifier||'') || !Array.isArray(next.names)){cfg=null;sessions.clear();return}
    const nextFingerprint=sha(next.salt+next.verifier)
    if(nextFingerprint!==fingerprint){sessions.clear();failures.clear();try{const saved=JSON.parse(readFileSync(sessionFile,'utf8'));if(saved.fingerprint===nextFingerprint)for(const [key,value] of saved.sessions)sessions.set(key,value)}catch{}fingerprint=nextFingerprint}
    cfg=next
  }
  refreshConfiguration()
  const persist = () => { if(cfg) writeFileSync(sessionFile,JSON.stringify({fingerprint,sessions:[...sessions].filter(([,value])=>Date.parse(value.expiresAt)>Date.now())})) }
  const revision = (d: any) => { const info=statSync(d.path);return info.size+':'+info.mtimeMs }

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    const host = '127.0.0.1:' + req.socket.localPort
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== 'http://' + host) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end(); return }
    if (req.method === 'GET' && mobileDirectory) {
      const file = resolve(mobileDirectory, '.' + (req.url === '/' ? '/index.html' : (req.url || '').split('?')[0]))
      if (!file.startsWith(resolve(mobileDirectory)+sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404);res.end();return }
      const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.pdf':'application/pdf'}
      res.setHeader('Content-Type',types[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file));return
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end('{}'); return }
    let raw = ''
    try {
      for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw new Error('request-too-large') }
      const body = JSON.parse(raw)
      refreshConfiguration()
      const ok = (data: unknown) => res.end(JSON.stringify({ ok: true, data }))
      const fail = (code: string) => { res.end(JSON.stringify({ ok: false, code, error: code === 'AUTH_FAILED' ? '이름 또는 비밀번호를 확인해 주세요.' : '로그인이 필요합니다.' })) }
      const mobileLogin = body.action === 'verifyMobileViewer'
      if (mobileLogin || body.action === 'staffLogin') {
        if (!cfg) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, error: '시험 서버 설정이 필요합니다. 관리자에게 시험 서버 초기화를 요청하세요.' })); return }
        const name = String((mobileLogin ? body.viewerName : body.name) || '').trim()
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
        const session = { name, expiresAt: new Date(Date.now() + (mobileLogin ? 72 : 120) * 3600000).toISOString() }
        sessions.set((mobileLogin?'mobile:':'')+sha(token), session); persist()
        ok(mobileLogin ? {verified:true,accessToken:token,expiresAt:session.expiresAt} : {...session,token}); return
      }
      if (['getMobileScheduleBundle','getMobileAttendanceRoster','logoutMobileViewer','getMobileResource'].includes(body.action)) {
        const key='mobile:'+sha(String(body.accessToken || '')), viewer=sessions.get(key)
        if(!viewer || viewer.name!==body.viewerName || Date.parse(viewer.expiresAt)<=Date.now()){res.end(JSON.stringify({ok:false,code:'MOBILE_SESSION_EXPIRED'}));return}
        if(body.action==='logoutMobileViewer'){sessions.delete(key);persist();ok(true);return}
        const date=String(body.fromDate || body.date || ''), now=new Date().toISOString()
        const slots=Array.from({length:35},(_,i)=>({value:i%7===0?'1-1\n시험 과목':'',locked:false}))
        const meals=[{date,mealType:'중식',dishNames:['시험용 급식'],calories:'700 Kcal'}]
        const status={state:'fresh',lastSuccessAt:now,lastAttemptAt:now,itemCount:1}
        if(body.action==='getMobileResource'){ok({items:body.resource==='meals'?meals:[],status:body.resource==='meals'?status:{...status,state:'empty',itemCount:0}});return}
        if(body.action==='getMobileAttendanceRoster'){ok({date,period:body.period,entries:[],checkedAt:now});return}
        const revision = sha([viewer.name,date,body.toDate || date,'trial-1'].join('|'))
        if(body.ifRevision===revision){ok({notModified:true,revision});return}
        ok({revision,contractVersion:3,teacherTimetable:{name:viewer.name,label:viewer.name,slots},events:[{date,title:'시험용 교직원 일정',source:'weekly',label:'학사일정'}],meals,todayMeals:meals,attendanceSummaries:[],committeeEvents:[],timetableChanges:[],timetableOverrides:[],fetchedAt:now,sourceStatus:{meals:status,timetable:status}});return
      }
      const tokenKey = sha(String(body.staffToken || ''))
      const auth = sessions.get(tokenKey)
      if (!auth || Date.parse(auth.expiresAt) <= Date.now() || !cfg.names.includes(auth.name)) { fail('AUTH_REQUIRED'); return }
      if (body.action === 'health') {ok({service:'시험 학교 서버',version:75});return}
      if (body.action === 'staffSession') { ok(auth); return }
      if (body.action === 'staffLogout') { sessions.delete(tokenKey); persist(); ok(true); return }
      if (body.action === 'caseUnlock') {
        const guess = sha(String(body.password || ''))
        const prior = failures.get('case:'+tokenKey)
        if (prior && prior.until > Date.now() || guess !== cfg.caseVerifier) {
          const attempt = prior || {count:0, until:0}; attempt.count++
          if (attempt.count >= 5) attempt.until = Date.now()+30000
          failures.set('case:'+tokenKey, attempt); fail('AUTH_FAILED'); return
        }
        failures.delete('case:'+tokenKey)
        const grant = randomBytes(24).toString('hex')
        grants.set(grant, {session: tokenKey, expires: Date.parse(auth.expiresAt)})
        ok({grant}); return
      }
      if (['caseClose','caseLibrary','caseDocument'].includes(body.action)) {
        const grant = grants.get(body.grant)
        if (!grant || grant.session !== tokenKey || grant.expires <= Date.now()) { fail('CASE_LOCKED'); return }
        if (body.action === 'caseClose') { grants.delete(body.grant); ok(true); return }
      }
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
      const meta = {version:1,uploadedBy:'테스트교사',uploadedAt:'2026-11-18T00:00:00Z',sourceFileName:'시험용 자료',title:'시험용 주간시간표',semester:'2학기'}
      const student = {studentId:'10102',name:'가상학생',grade:'1',className:'1',classLabel:'1-1',number:'2',enrollmentCount:1,homeroomTeacher:auth.name,assistantTeacher:'',gender:'',remark:''}
      const lesson = {day:'월',period:1,subject:'시험과목',teacher:auth.name,classroom:'1-1',raw:'시험과목',selectedCourse:false}
      const slots = Array.from({length:35},(_,i)=>({value:i===0?'1-1\n시험과목':'',locked:false}))
      const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replace(/-/g,'')
      const emptyObjects: Record<string, unknown> = {
        getStaffRoster: { ...meta, members: cfg?.names?.map((name: string, i: number) => ({ id: String(i), name, position:'교사', department: '시험 환경', subject: '시험과목', homeroom: '1-1' })) || [] },
        getSyncManifest: { generatedAt:meta.uploadedAt,resources:{staffRoster:'test-1',studentRoster:'test-1',timetable:'test-1',studentTimetable:'test-1',sharedNeis:'test-1'} }, listCommitteeState: { members: [], events: [] },
        getTimetable: {...meta,teachers:[{name:auth.name,label:auth.name,load:'1',slots}],pulledLessons:[]},
        getStudentTimetable: {...meta,studentCount:1,classCount:1,courseCount:1,students:[{student,slots:{'월-1':lesson},selections:[],warnings:[]}],helpClassSchedules:[{grade:'1',className:'1',name:student.name,lessons:[{day:'월',period:1,sourceSubject:'시험과목'}]}]}, getStudentRoster: {...meta,students:[student]},
        getNeisSnapshot: {...meta,fromDate:today,toDate:today,fetchedAt:new Date().toISOString(),schoolName:'시험학교',timetables:[],schedules:[{date:today,eventName:'시험용 교직원 일정',eventContent:'시험 일정',eventLevel:'전교'}],meals:[]}, getWidgetAttendanceSummaries: { summaries: [], lessons: [] },
      }
      if (String(body.action).startsWith('list') || String(body.action).startsWith('get')) {
        ok(Object.prototype.hasOwnProperty.call(emptyObjects, body.action) ? emptyObjects[body.action] : []); return
      }
      res.statusCode = 403; res.end(JSON.stringify({ ok: false, error: '시험 환경에서는 운영자료 변경을 수행하지 않습니다.' }))
    } catch {
      res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: '시험 서버 요청을 처리하지 못했습니다.' }))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EADDRINUSE') { reject(error); return }
      server.once('error', reject).listen(0, '127.0.0.1', resolve)
    }).listen(19743, '127.0.0.1', resolve)
  })
  const address = server.address() as { port: number }
  return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() }
}
