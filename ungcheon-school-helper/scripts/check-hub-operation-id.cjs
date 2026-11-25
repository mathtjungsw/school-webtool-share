'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const compiled = ts.transpileModule(fs.readFileSync('src/services/schoolHub.ts', 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText
const captured = [], invalidated = [], moduleFixture = {exports: {}}
let sequence = 0, reject = false
vm.runInNewContext(compiled, {
  module: moduleFixture, exports: moduleFixture.exports,
  require: name => { assert.ok(['./studentTimetable', './rosterAttendance', './studentId', '../data/pulledLessons2026','./helpClassSchedule'].includes(name)); return {} },
  crypto: {randomUUID: () => `synthetic-operation-${++sequence}`},
  window: {electron: {
    schoolHubRequest: async request => {captured.push(request); if (reject) throw Error('synthetic network failure'); return {ok:true, data:{saved:true}}},
    schoolHubCacheDeleteResource: async resource => {invalidated.push(resource)},
  }},
})

async function checkSharedReads() {
  const main = fs.readFileSync('electron/main/index.ts', 'utf8')
  const handler = main.slice(main.indexOf('const hubReads ='), main.indexOf("ipcMain.handle('schoolHubCache:getAll'"))
  const cache = { exports: {} }
  const compile = source => ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  let now = 0, generation = 1, authenticated = true
  let receive
  const requests = []
  const clock = { now: () => now }
  vm.runInNewContext(compile(fs.readFileSync('electron/main/school-hub-read-cache.ts', 'utf8')), {
    exports: cache.exports, Date: clock,
  })
  vm.runInNewContext(compile(handler), {
    ...cache.exports,
    ipcMain: { handle: (_, callback) => { receive = callback } },
    trustedApp: sender => sender === 'main' || sender === 'widget',
    staffAuth: { snapshot: () => ({ authenticated, expiresAt: 'same-expiry' }), sessionGeneration: () => generation },
    HUB_READ_ACTIONS: new Set(['getSyncManifest', 'getWidgetAttendanceSummaries']),
    requestSchoolHub: async payload => {
      requests.push(payload)
      return { ok: authenticated && payload.date !== 'synthetic-failure', serial: requests.length }
    },
  })
  const manifest = { action: 'getSyncManifest' }
  const attendance = { action: 'getWidgetAttendanceSummaries', date: 'synthetic-today' }
  const [first, shared] = await Promise.all([receive('main', manifest), receive('widget', manifest)])
  assert.equal(first, shared)
  assert.equal(requests.length, 1, 'The two renderer windows share the same pending manifest request')
  now = 30_000
  assert.equal(await receive('widget', manifest), first)
  now = 60_000
  const next = await receive('main', manifest)
  assert.notEqual(next.serial, first.serial, 'Automatic manifest expires after 60 seconds')
  const updated = await receive('widget', { ...manifest, force: true })
  assert.notEqual(updated.serial, next.serial)
  assert.equal(requests.at(-1).force, undefined, 'Manifest force is local only')
  const summary = await receive('widget', attendance)
  await receive('main', { action: 'saveCommitteeMembers' })
  assert.notEqual((await receive('main', manifest)).serial, updated.serial, 'A write invalidates the shared manifest')
  now = 359_999
  assert.equal(await receive('widget', attendance), summary, 'Attendance never repeats on 30-second sync ticks')
  assert.equal(await receive('widget', { ...attendance, attendanceContextVersion: 'updated' }), summary)
  now = 360_000
  const newSummary = await receive('widget', attendance)
  assert.notEqual(newSummary.serial, summary.serial)
  const manual = await receive('widget', { ...attendance, force: true })
  assert.notEqual(manual.serial, newSummary.serial)
  assert.equal(await receive('widget', attendance), manual)
  const failure = await receive('widget', { ...attendance, date: 'synthetic-failure' })
  assert.equal(failure.ok, false)
  assert.equal(await receive('widget', { ...attendance, date: 'synthetic-failure' }), failure)
  const beforeSwitch = await receive('main', manifest)
  generation += 1
  assert.notEqual((await receive('widget', manifest)).serial, beforeSwitch.serial, 'New login cannot reuse a previous session result')
  assert.equal((await receive('untrusted-frame', manifest)).ok, false)
  authenticated = false
  assert.equal((await receive('main', manifest)).ok, false, 'Logged-out requests cannot read cached results')
  console.log('PASS main-and-widget request sharing, five-minute attendance, manual refresh, write invalidation and session isolation')
}

;(async () => {
  const {hubRequest} = moduleFixture.exports
  const request = Object.freeze({action:'addLink', title:'Synthetic', url:'https://example.com'})
  await hubRequest(request)
  assert.equal(captured[0].operationId, 'synthetic-operation-1')
  assert.equal(request.operationId, undefined)
  await hubRequest({...request, operationId:captured[0].operationId})
  assert.equal(captured[1].operationId, captured[0].operationId)
  assert.equal(sequence, 1)
  await hubRequest({action:'addStaffChecklist', requestId:'synthetic-checklist-retry'})
  assert.equal(captured[2].operationId, 'synthetic-checklist-retry')
  for (const action of ['listLinks','getMobileScheduleBundle','verifyAdmin','staffLogin']) {
    await hubRequest({action})
    assert.equal(captured.at(-1).operationId, undefined)
  }
  reject = true
  const attempts = captured.length
  await assert.rejects(hubRequest(request), /synthetic network failure/)
  assert.equal(captured.length, attempts + 1, 'Uncertain writes must not be automatically repeated')
  assert.equal(invalidated.length, 3, 'Only acknowledged writes invalidate the resource cache')
  console.log('PASS actual hub transport: mutation IDs, explicit retry identity, checklist compatibility, read/auth exclusion, immutable input and no automatic replay')
  await checkSharedReads()
})().catch(error => {console.error(error); process.exitCode = 1})
