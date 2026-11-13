'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const compiled = ts.transpileModule(fs.readFileSync('src/services/schoolHub.ts', 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText
const captured = [], invalidated = [], moduleFixture = {exports: {}}
let sequence = 0, reject = false
vm.runInNewContext(compiled, {
  module: moduleFixture, exports: moduleFixture.exports,
  require: name => { assert.ok(['./studentTimetable', './rosterAttendance', './studentId'].includes(name)); return {} },
  crypto: {randomUUID: () => `synthetic-operation-${++sequence}`},
  window: {electron: {
    schoolHubRequest: async request => {captured.push(request); if (reject) throw Error('synthetic network failure'); return {ok:true, data:{saved:true}}},
    schoolHubCacheDeleteResource: async resource => {invalidated.push(resource)},
  }},
})
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
})().catch(error => {console.error(error); process.exitCode = 1})
