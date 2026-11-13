'use strict'

// Synthetic fixtures only. Optional --emulator targets a fixed demo project on loopback.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const context = vm.createContext({
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()],
    newBlob: value => ({ getBytes: () => Buffer.from(value, 'utf8') }),
  },
})
for (const file of ['FirestoreRepository.gs', 'MigrationSync.gs', 'MigrationAdmin.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, 'server', file), 'utf8'), { filename: file }).runInContext(context)
}
let passed = 0
function test(name, callback) { callback(); passed++; console.log(`PASS ${name}`) }
function plain(value) { return JSON.parse(JSON.stringify(value)) }
function record(sourceId, sortOrder, payload, isDeleted = false) { return { sourceId, sortOrder, payload, isDeleted } }
function errorCode(fn, code) { assert.throws(fn, error => error.code === code) }
function memoryRepository() {
  const docs = new Map()
  let clock = 0
  let fail = false
  const metrics = { documentsWritten: 0 }
  const clone = data => context.migrationDecode_(context.migrationEncode_(data))
  return {
    docs, metrics, failNext: () => { fail = true },
    get: key => docs.has(key) ? { data: clone(docs.get(key).data), updateTime: docs.get(key).updateTime } : null,
    list: (key, token) => {
      const all = [...docs.keys()].filter(item => item.startsWith(key + '/') && item.split('/').length === key.split('/').length + 1).sort()
      const index = Number(token || 0)
      const page = all.slice(index, index + 100)
      return { documents: page.map(id => ({ path: id, data: clone(docs.get(id).data) })), nextPageToken: all.length > index + 100 ? String(index + 100) : '' }
    },
    commit: writes => {
      if (fail) { fail = false; throw context.migrationError_('MIGRATION_TRANSPORT_FAILED', true) }
      for (const write of writes) {
        const existing = docs.get(write.path)
        if ((write.createOnly && existing) || (write.updateTime && existing?.updateTime !== write.updateTime)) throw context.migrationError_('MIGRATION_FIRESTORE_CONFLICT')
      }
      for (const write of writes) docs.set(write.path, { data: clone(write.data), updateTime: String(++clock) })
      metrics.documentsWritten += writes.length
    },
  }
}
function stage(repository, snapshot, pageSize = 2) {
  const run = context.migrationBeginSnapshot_(repository, snapshot, pageSize)
  for (let index = 0; index < run.pageCount; index++) context.migrationStagePage_(repository, snapshot, index)
}
const fixture = [record('original-1', 2, { text: '가나다', blank: '', zero: 0, bool: false, nullable: null, studentId: '00123' }), record('original-2', 0, { status: 'approved' }), record('deleted-3', 1, {}, true)]

test('typed values, stable key ordering, timestamps and empty values have distinct hashes', () => {
  assert.equal(context.migrationHash_({ b: 2, a: 1 }), context.migrationHash_({ a: 1, b: 2 }))
  assert.equal(new Set([null, false, 0, '', '0', [], {}].map(context.migrationHash_)).size, 7)
  assert.equal(vm.runInContext(`migrationDecode_(migrationEncode_(new Date('2026-11-13T00:00:00Z'))).toISOString()`, context), '2026-11-13T00:00:00.000Z')
  assert.notEqual(vm.runInContext(`migrationHash_(new Date('2026-11-13T00:00:00Z'))`, context), context.migrationHash_({ $timestamp: '2026-11-13T00:00:00.000Z' }))
  assert.deepEqual(plain(context.migrationDecode_(context.migrationEncode_(fixture[0].payload))), fixture[0].payload)
  for (const value of [undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => context.migrationEncode_(value))
  errorCode(() => context.migrationEncode_([[1]]), 'MIGRATION_NESTED_ARRAY')
})
test('invalid source identity, duplicate IDs, invalid order and revision are rejected', () => {
  errorCode(() => context.migrationSnapshot_('staff', 0, []), 'MIGRATION_INVALID_SNAPSHOT')
  errorCode(() => context.migrationSnapshot_('staff', 1, [fixture[0], fixture[0]]), 'MIGRATION_INVALID_SOURCE_ID')
  errorCode(() => context.migrationSnapshot_('staff', 1, [record('', 0, {})]), 'MIGRATION_INVALID_SOURCE_ID')
  errorCode(() => context.migrationSnapshot_('staff', 1, [record('a', -1, {})]), 'MIGRATION_INVALID_RECORD')
})
test('partial copy is invisible; atomic pages resume without rewriting successful work', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('staff', 1, fixture)
  context.migrationBeginSnapshot_(repo, snapshot, 2)
  context.migrationStagePage_(repo, snapshot, 0)
  assert.equal(repo.get('resourceManifests/staff'), null)
  errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_VERIFICATION_FAILED')
  repo.failNext()
  assert.throws(() => context.migrationStagePage_(repo, snapshot, 1))
  const written = repo.metrics.documentsWritten
  assert.equal(context.migrationStagePage_(repo, snapshot, 0).skipped, true)
  assert.equal(repo.metrics.documentsWritten, written)
  context.migrationStagePage_(repo, snapshot, 1)
  assert.equal(context.migrationPublishSnapshot_(repo, snapshot).duplicate, false)
  assert.equal(repo.get('resourceManifests/staff').data.deletedCount, 1)
  assert.equal(context.migrationPublishSnapshot_(repo, snapshot).duplicate, true)
})
test('new revisions preserve deletions and order; late initial copies cannot overwrite them', () => {
  const repo = memoryRepository()
  const old = context.migrationSnapshot_('staff', 1, fixture)
  const next = context.migrationSnapshot_('staff', 2, [record('original-1', 0, {}, true), record('original-2', 1, { status: 'cancelled' })])
  stage(repo, old); stage(repo, next)
  context.migrationPublishSnapshot_(repo, next)
  errorCode(() => context.migrationPublishSnapshot_(repo, old), 'MIGRATION_STALE_REVISION')
  const conflict = context.migrationSnapshot_('staff', 2, [])
  stage(repo, conflict)
  errorCode(() => context.migrationPublishSnapshot_(repo, conflict), 'MIGRATION_REVISION_CONFLICT')
  assert.equal(repo.get('resourceManifests/staff').data.runId, next.runId)
  assert.notEqual(old.payloadHash, context.migrationSnapshot_('staff', 1, fixture.map((item, i) => ({ ...item, sortOrder: i }))).payloadHash)
})
test('lost responses after successful page and pointer commits remain safe on retry', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('links', 1, fixture)
  context.migrationBeginSnapshot_(repo, snapshot, 2)
  const commit = repo.commit
  let loseResponse = true
  repo.commit = writes => {
    commit(writes)
    if (loseResponse) { loseResponse = false; throw context.migrationError_('MIGRATION_TRANSPORT_FAILED', true) }
  }
  assert.throws(() => context.migrationStagePage_(repo, snapshot, 0))
  const written = repo.metrics.documentsWritten
  assert.equal(context.migrationStagePage_(repo, snapshot, 0).skipped, true)
  assert.equal(repo.metrics.documentsWritten, written)
  context.migrationStagePage_(repo, snapshot, 1)
  loseResponse = true
  assert.throws(() => context.migrationPublishSnapshot_(repo, snapshot))
  assert.equal(context.migrationPublishSnapshot_(repo, snapshot).duplicate, true)
})
test('compare-and-set rejects a competing publication after the manifest was read', () => {
  const repo = memoryRepository()
  const first = context.migrationSnapshot_('links', 1, fixture)
  const second = context.migrationSnapshot_('links', 2, fixture)
  stage(repo, first); stage(repo, second)
  context.migrationPublishSnapshot_(repo, first)
  const get = repo.get
  let compete = true
  repo.get = key => {
    const read = get(key)
    if (key === 'resourceManifests/links' && compete) {
      compete = false
      repo.commit([{path:key, data:{...read.data, sourceRevision:3, runId:'competing-run'}, updateTime:read.updateTime}])
    }
    return read
  }
  errorCode(() => context.migrationPublishSnapshot_(repo, second), 'MIGRATION_FIRESTORE_CONFLICT')
  assert.equal(get('resourceManifests/links').data.sourceRevision, 3)
})
test('corruption and missing checkpoints prevent publication; empty replacement is valid', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('links', 1, fixture)
  stage(repo, snapshot)
  const key = `migrationRuns/${snapshot.runId}/records/${context.migrationHash_('original-2')}`
  repo.docs.get(key).data.payload.status = 'held'
  errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_VERIFICATION_FAILED')
  assert.equal(repo.get('resourceManifests/links'), null)
  const empty = context.migrationSnapshot_('links', 2, [])
  stage(repo, empty)
  context.migrationPublishSnapshot_(repo, empty)
  assert.equal(repo.get('resourceManifests/links').data.recordCount, 0)
})
test('pagination verifies every record beyond the first 100 documents', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('students', 1, Array.from({ length: 203 }, (_, i) => record('synthetic-' + i, i, { id: String(i).padStart(5, '0') })))
  stage(repo, snapshot, 100)
  assert.equal(context.migrationVerifySnapshot_(repo, snapshot).recordCount, 203)
  repo.docs.delete(`migrationRuns/${snapshot.runId}/pages/p2`)
  errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_INCOMPLETE_PAGES')
})
test('wrong document identity, damaged run metadata and mutated snapshots fail closed', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('staff', 1, fixture)
  stage(repo, snapshot)
  const key = `migrationRuns/${snapshot.runId}/records/${context.migrationHash_('original-1')}`
  repo.docs.set(key + 'wrong', repo.docs.get(key)); repo.docs.delete(key)
  errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_DOCUMENT_ID_MISMATCH')
  repo.docs.set(key, repo.docs.get(key + 'wrong')); repo.docs.delete(key + 'wrong')
  repo.docs.get(`migrationRuns/${snapshot.runId}`).data.pageCount = 0
  errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_RUN_MISMATCH')
  snapshot.records[0].payload = { corrupted: true }
  errorCode(() => context.migrationStagePage_(repo, snapshot, 0), 'MIGRATION_SNAPSHOT_CHANGED')
  assert.equal(repo.get('resourceManifests/staff'), null)
})
test('live connections default to disabled; test transports cannot target production projects', () => {
  errorCode(() => context.migrationRepository_({}), 'MIGRATION_CONNECTION_DISABLED')
  errorCode(() => context.migrationRepository_({ enabled: true, projectId: 'production-school', schoolId: 'ungcheon', environment: 'EMULATOR' }, () => {}), 'MIGRATION_EMULATOR_ONLY')
  errorCode(() => context.migrationRepository_({ enabled: true, projectId: 'production-school', schoolId: 'ungcheon', environment: 'MIRROR', sourceOfTruth: 'SHEETS' }, () => {}), 'MIGRATION_INVALID_CONFIG')
})
test('oversized pages are rejected before freezing a run and can use smaller pages', () => {
  const repo = memoryRepository()
  const snapshot = context.migrationSnapshot_('studentRows', 1, Array.from({length:10}, (_, i) => record('large-' + i, i, {text:'a'.repeat(760000)})))
  errorCode(() => context.migrationBeginSnapshot_(repo, snapshot, 10), 'MIGRATION_PAGE_TOO_LARGE_USE_SMALLER_SIZE')
  assert.equal(repo.docs.size, 0)
  assert.equal(context.migrationBeginSnapshot_(repo, snapshot, 5).pageCount, 2)
})
const config = { enabled: true, projectId: 'demo-ungcheon-migration', schoolId: 'ungcheon', environment: 'EMULATOR' }
test('REST failures redact server bodies and credentials; unsafe paths and writes are rejected', () => {
  const repo = context.migrationRepository_(config, () => ({ status: 403, text: 'PRIVATE_RESPONSE_TOKEN' }))
  assert.throws(() => repo.get('links/a'), error => error.code === 'MIGRATION_FIRESTORE_PERMISSION_DENIED' && !error.message.includes('PRIVATE'))
  errorCode(() => repo.get('../outside'), 'MIGRATION_INVALID_PATH')
  errorCode(() => repo.commit([{ path: 'links/a', data: {} }]), 'MIGRATION_PRECONDITION_REQUIRED')
  errorCode(() => repo.commit([{ path: 'links/a', data: { text: 'a'.repeat(850001) }, createOnly: true }]), 'MIGRATION_DOCUMENT_TOO_LARGE')
  const retry = context.migrationRepository_(config, () => ({ status: 429, text: 'PRIVATE' }))
  assert.throws(() => retry.get('links/a'), error => error.retryable === true)
})
test('administrator inventory uses metadata only and unauthorized requests read nothing', () => {
  let allowed = false
  let reads = 0
  context.requireAdmin_ = () => { if (!allowed) throw new Error('AUTH_DENIED') }
  context.SpreadsheetApp = { getActiveSpreadsheet: () => { reads++; return {
    getSheetByName: () => ({ getLastRow: () => 4, getLastColumn: () => 5 }),
    getSheets: () => [{ getName: () => '공유링크' }, { getName: () => 'private-unclassified' }],
  } } }
  assert.throws(() => context.migrationAdminInventory_({}))
  assert.equal(reads, 0)
  allowed = true
  const inventory = context.migrationAdminInventory_({})
  assert.equal(inventory.resources.length, 22)
  assert.equal(inventory.unclassifiedSheetCount, 1)
  assert.equal(inventory.rowValuesRead, false)
  assert.ok(!JSON.stringify(inventory).includes('private-unclassified'))
  const status = context.migrationAdminStatus_({})
  assert.equal(status.pendingCount, null)
  assert.equal(status.cutoverReady, false)
})
test('migration routes preserve staff authentication and avoid sheet initialization', () => {
  const code = fs.readFileSync(path.join(root, 'server/Code.gs'), 'utf8')
  const ctx = vm.createContext({ ...context, json_: value => value })
  vm.runInContext(code, ctx)
  for (const file of ['FirestoreRepository.gs', 'MigrationSync.gs', 'MigrationAdmin.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'server', file), 'utf8'), ctx)
  }
  let staffAllowed = false
  let adminAllowed = false
  ctx.json_ = value => value
  ctx.staffRequire_ = () => { if (!staffAllowed) throw new Error('STAFF_DENIED') }
  ctx.requireAdmin_ = () => { if (!adminAllowed) throw new Error('ADMIN_DENIED') }
  ctx.ensureSheets_ = () => { throw new Error('MUST_NOT_INITIALIZE') }
  for (const action of ['getMigrationStatus', 'getMigrationInventory']) {
    const call = () => ctx.doPost({ postData: { contents: JSON.stringify({ action }) } })
    assert.equal(call().ok, false)
    staffAllowed = true
    assert.equal(call().ok, false)
    adminAllowed = true
    assert.equal(call().ok, true)
    staffAllowed = false; adminAllowed = false
  }
  const electron = fs.readFileSync(path.join(root, 'electron/main/index.ts'), 'utf8')
  const getActions = electron.match(/const HUB_READ_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1]
  assert.ok(!getActions.includes('getMigration'), 'administrator credentials must never enter GET URLs')
})

if (process.argv.includes('--emulator')) {
  function transport(method, url, body, admin = true) {
    if (!url.startsWith('http://127.0.0.1:8185/v1/projects/demo-ungcheon-migration/')) throw new Error('EMULATOR_LOOPBACK_ONLY')
    const result = spawnSync(process.execPath, [path.join(__dirname, 'firebase-emulator-request.cjs')], {
      input: JSON.stringify({ method, url, body, admin }), encoding: 'utf8', timeout: 20000, maxBuffer: 2000000,
    })
    if (result.status !== 0) throw new Error('EMULATOR_REQUEST_FAILED')
    return JSON.parse(result.stdout)
  }
  test('real emulator denies unauthenticated reads and writes', () => {
    const base = 'http://127.0.0.1:8185/v1/projects/demo-ungcheon-migration/databases/(default)/documents'
    assert.equal(transport('get', base + '/schools/ungcheon/resourceManifests/staff', null, false).status, 403)
    assert.equal(transport('post', base + ':commit', { writes: [{ update: { name: 'projects/demo-ungcheon-migration/databases/(default)/documents/unauthorized/test', fields: { a: { stringValue: 'test' } } } }] }, false).status, 403)
  })
  test('real REST adapter copies, resumes, verifies, prevents stale publication and preserves types', () => {
    const repo = context.migrationRepository_(config, transport)
    const revision = Date.now()
    const snapshot = context.migrationSnapshot_('staff', revision, fixture)
    stage(repo, snapshot)
    const written = repo.metrics.documentsWritten
    context.migrationStagePage_(repo, snapshot, 0)
    assert.equal(repo.metrics.documentsWritten, written)
    context.migrationPublishSnapshot_(repo, snapshot)
    const newer = context.migrationSnapshot_('staff', revision + 1, [record('original-1', 0, {}, true)])
    stage(repo, newer)
    context.migrationPublishSnapshot_(repo, newer)
    errorCode(() => context.migrationPublishSnapshot_(repo, snapshot), 'MIGRATION_STALE_REVISION')
    const saved = repo.get(`migrationRuns/${snapshot.runId}/records/${context.migrationHash_('original-1')}`).data
    assert.deepEqual(plain(saved.payload), fixture[0].payload)
    const head = repo.get('resourceManifests/staff')
    errorCode(() => repo.commit([{ path: 'resourceManifests/staff', data: head.data, createOnly: true }]), 'MIGRATION_FIRESTORE_CONFLICT')
  })
}
console.log(`Firebase migration checks: ${passed} passed; ${process.argv.includes('--emulator') ? 'loopback emulator exercised' : 'synthetic in-memory only'}.`)
