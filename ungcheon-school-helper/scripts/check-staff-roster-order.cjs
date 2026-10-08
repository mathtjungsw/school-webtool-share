'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const { buildSync } = require('esbuild')
const XLSX = require('xlsx')
const { inspectSource, validate } = require('./apps-script-deploy-guard.cjs')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'server/Code.gs'), 'utf8')
const server = inspectSource(source, 'roster order')
const reference = server.constants.get('STAFF_ROSTER_FILE_ORDER_20261008')
let checks = 0
const test = (name, run) => { run(); checks++; console.log('PASS ' + name) }
let printed, downloaded
const entry = path.join(root, 'src/services/rosterAttendance.ts')
const result = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['xlsx', './printing'] })
const moduleState = { exports: {} }
const localRequire = createRequire(entry)
vm.runInNewContext(result.outputFiles[0].text, { module: moduleState, exports: moduleState.exports, ArrayBuffer, Uint8Array, Buffer,
  require: name => name === './printing' ? { escapePrintHtml: value => String(value), printDocument: options => { printed = options } } : localRequire(name), crypto, Intl, Date, TextEncoder,
  window: { electron: { saveFileDialog: (_name, bytes) => { downloaded = bytes; return Promise.resolve(true) } } } })
const service = moduleState.exports
const member = (name, displayOrder, position = '교사') => ({ id: name, name, position, department: '부서', subject: '교과', homeroom: '3-1', displayOrder })
const bytes = matrix => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), '명렬')
  return Array.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
test('Excel sequence overrides names, roles and two-column row traversal', () => {
  const rows = [['순번', '직책', '성명', '서명', '순번', '직책', '성명', '서명'],
    [2, '교사', '가교사', '', 4, '조리실무사', '나직원', ''],
    [1, '교사', '하교사', '', 3, '교장', '다교장', '']]
  const parsed = service.parseStaffRosterWorkbook(bytes(rows))
  assert.deepEqual(Array.from(parsed, m => m.name), ['하교사', '가교사', '다교장', '나직원'])
  assert.deepEqual(Array.from(parsed, m => m.displayOrder), [1, 2, 3, 4])
})
test('Legacy no-sequence imports keep source order and teacher alias', () => {
  const parsed = service.parseStaffRosterWorkbook(bytes([['직책', '성명'], ['교사', '최대식'], ['교장', '가교장']]))
  assert.deepEqual(Array.from(parsed, m => m.name), ['전종택', '가교장'])
  assert.deepEqual(Array.from(service.sortStaffMembers([member('하교사'), member('가교사')]), m => m.name), ['하교사', '가교사'])
  assert.deepEqual(Array.from(service.sortStaffMembers([member('새교사'), member('하교사', 1)])), [member('하교사', 1), member('새교사')])
})
test('Print uses the local preview order, not original Excel ranks', () => {
  service.printTrainingRoster([member('둘째', 2), member('첫째', 1)], '연수', '2026-10-08')
  assert.ok(printed.bodyHtml.indexOf('둘째') < printed.bodyHtml.indexOf('첫째'))
  assert.match(printed.bodyHtml, /<td>1<\/td><td>교사<\/td>/)
})

// In-memory Sheets only. No network, account, operational records or tokens.
class Sheet {
  constructor(name, headers, rows = []) { this.name = name; this.data = [headers, ...rows].map(row => [...row]) }
  getLastRow() { return this.data.length }
  getLastColumn() { return this.data[0].length }
  getMaxColumns() { return 26 }
  getMaxRows() { return 200 }
  setFrozenRows() {}
  setName(name) { this.name = name; sheets.set(name, this); return this }
  copyTo() { return new Sheet('copy', this.data[0], this.data.slice(1)) }
  getRange(row, col, height, width) {
    if (typeof row === 'string') return { setNumberFormat() {} }
    return {
      clearContent: () => { if (row === 2) this.data = [this.data[0]] },
      setValues: values => {
        assert.equal(values.length, height)
        values.forEach((value, index) => { assert.equal(value.length, width); this.data[row - 1 + index] = [...value] })
      }
    }
  }
}
const headers = ['id', 'name', 'position', 'department', 'subject', 'homeroom']
const sheets = new Map()
const properties = new Map([['protected-password', 'synthetic-hash'], ['active-session', 'synthetic-session']])
const book = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(name, []); sheets.set(name, sheet); return sheet } }
const context = vm.createContext({ console: undefined, Number, Date, Object,
  SpreadsheetApp: { getActiveSpreadsheet: () => book },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => crypto.randomUUID() }, clean_: value => String(value || '').trim(),
  iso_: value => String(value || ''), touchSyncResource_: () => {},
  readObjects_: name => { const sheet = sheets.get(name); return sheet ? sheet.data.slice(1).map(row => Object.fromEntries(sheet.data[0].map((key, index) => [key, row[index]]))) : [] }
})
for (const name of ['STAFF_ROSTER_SHEET', 'STAFF_ROSTER_META_SHEET', 'STAFF_ROSTER_FILE_ORDER_1_1_37_KEY', 'STAFF_ROSTER_FILE_ORDER_20261008']) {
  vm.runInContext(`const ${name}=${JSON.stringify(server.constants.get(name))};`, context)
}
for (const name of ['normalizeStaffHomeroom_', 'ensureDataSheet_', 'replaceSheetRows_', 'migrateStaffRosterFileOrder1_1_37_', 'compareStaffMembers_', 'getStaffRoster_', 'replaceStaffRoster_']) vm.runInContext(server.functions.get(name), context)
const call = (name, ...args) => context[name](...args)
const initialRows = reference.map(([name, position], index) => [`keep-${index}`, name, position, `부서-${index}`, `교과-${index}`, '3-1']).reverse()
initialRows.find(row => row[1] === '전종택')[1] = '최대식'
initialRows.splice(initialRows.findIndex(row => row[1] === '우가희'), 1)
initialRows.push(['retired-id', '이전직원', '주무관', '기존부서', '', ''])
sheets.set('교원명렬', new Sheet('교원명렬', headers, initialRows))
sheets.set('교원명렬정보', new Sheet('교원명렬정보', ['version', 'sourceFileName', 'uploadedBy', 'uploadedAt', 'memberCount'], [[9, 'previous.xlsx', 'test', '', initialRows.length]]))
test('Migration seeds exact 66 and preserves IDs/details, aliases and backup', () => {
  call('migrateStaffRosterFileOrder1_1_37_', book)
  const roster = call('getStaffRoster_')
  assert.equal(roster.members.length, 66)
  assert.deepEqual(Array.from(roster.members, m => [m.name, m.position]), reference)
  assert.deepEqual(Array.from(roster.members, m => m.displayOrder), reference.map((_, index) => index + 1))
  roster.members.forEach((m, index) => {
    if (m.name === '우가희') { assert.ok(m.id); assert.equal(m.department, ''); assert.equal(m.subject, ''); return }
    assert.equal(m.id, 'keep-' + index); assert.equal(m.department, '부서-' + index); assert.equal(m.subject, '교과-' + index); assert.equal(m.homeroom, '3-1')
  })
  assert.equal(sheets.get('교원명렬_20261008_보관').data.length, initialRows.length + 1)
  assert.equal(properties.get('protected-password'), 'synthetic-hash')
  assert.equal(properties.get('active-session'), 'synthetic-session')
})
test('Migration is idempotent and never overwrites subsequent administrator edits', () => {
  const snapshot = JSON.stringify(sheets.get('교원명렬').data)
  call('migrateStaffRosterFileOrder1_1_37_', book)
  assert.equal(JSON.stringify(sheets.get('교원명렬').data), snapshot)
  assert.equal(call('getStaffRoster_').version, 10)
})
test('Legacy PC saves cannot undo shared sequence; new staff append', () => {
  const previous = call('getStaffRoster_').members
  const legacy = previous.slice().reverse().map(({ displayOrder, ...m }) => m)
  legacy.unshift(member('새직원'))
  call('replaceStaffRoster_', { members: legacy })
  const updated = call('getStaffRoster_').members
  assert.deepEqual(Array.from(updated.slice(0, 66), m => m.name), reference.map(item => item[0]))
  assert.equal(updated[66].name, '새직원')
  assert.equal(updated[66].displayOrder, 67)
})
test('Explicit new Excel order persists through server save/read, duplicate names reject', () => {
  const members = call('getStaffRoster_').members.slice(0, 2).reverse().map((m, index) => ({ ...m, displayOrder: index + 1 }))
  call('replaceStaffRoster_', { members })
  assert.deepEqual(Array.from(call('getStaffRoster_').members, m => m.name), Array.from(members, m => m.name))
  call('migrateStaffRosterFileOrder1_1_37_', book)
  assert.equal(call('getStaffRoster_').members.length, 2)
  assert.throws(() => call('replaceStaffRoster_', { members: [members[0], members[0]] }), /같은 이름/)
})
test('Exact approval cannot authorize a corrupted roster function or seed', () => {
  const { execFileSync } = require('node:child_process')
  const main = execFileSync('git', ['show', 'origin/main:ungcheon-school-helper/server/Code.gs'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  const baselines = [{ label: 'origin/main', role: 'origin-main', source: main }]
  assert.equal(validate({ localSource: source, baselines }).ok, true)
  assert.throws(() => validate({ localSource: source.replace(server.functions.get('getStaffRoster_'), 'function getStaffRoster_() { return null; }'), baselines }), /protected desktop function/)
  assert.throws(() => validate({ localSource: source.replace("['류희열', '교장']", "['잘못된이름', '교장']"), baselines }), /desktop constant/)
})
if (process.env.STAFF_ROSTER_SOURCE) test('Actual supplied Excel matches the deployment seed in every name and position', () => {
  const data = fs.readFileSync(process.env.STAFF_ROSTER_SOURCE)
  const parsed = service.parseStaffRosterWorkbook(Array.from(data))
  assert.deepEqual(Array.from(parsed, m => [m.name, m.position]), reference)
  assert.deepEqual(Array.from(parsed, m => m.displayOrder), reference.map((_, index) => index + 1))
})
async function finish() {
  await service.downloadStaffRoster([member('둘째', 2), member('첫째', 1)])
  test('Downloaded Excel follows stored order', () => {
    const wb = XLSX.read(Uint8Array.from(downloaded), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    assert.deepEqual(rows.map(row => row.성명), ['첫째', '둘째'])
  })
  console.log(`Staff roster order: ${checks} groups passed.`)
}
finish().catch(error => { console.error(error); process.exitCode = 1 })
