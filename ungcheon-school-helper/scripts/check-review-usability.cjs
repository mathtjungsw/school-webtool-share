const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { buildSync } = require('esbuild')
const root = path.resolve(__dirname, '..')
function bundle(relative, reactOverride, globals = {}) {
  const entry = path.join(root, relative)
  const { outputFiles } = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', external: ['react'], logLevel: 'silent' })
  const module = { exports: {} }
  const localRequire = createRequire(entry)
  vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, URLSearchParams, require: name => name === 'react' && reactOverride ? reactOverride : localRequire(name), ...globals })
  return module.exports
}
const { schoolDate } = bundle('src/services/schoolDate.ts')
const { calculatePrintPreflight, buildPrintDocument } = bundle('src/services/printing/PrintEngine.ts')
const { overrideScopesOverlap, overrideBatchConflicts } = bundle('src/services/timetableOverrideBatch.ts')
const navigation = bundle('src/services/taskNavigation.ts', { useSyncExternalStore: (_, get) => get() })
let count = 0
function test(name, run) { run(); count++; console.log('PASS ' + name) }
test('Korean calendar date at UTC/KST day, year and leap boundaries', () => {
  assert.equal(schoolDate(new Date('2026-09-24T23:20:00Z')), '2026-09-25')
  assert.equal(schoolDate(new Date('2026-12-31T15:00:00Z')), '2027-01-01')
  assert.equal(schoolDate(new Date('2024-02-28T15:00:00Z')), '2024-02-29')
  assert.equal(schoolDate(new Date('2026-09-24T14:59:59Z')), '2026-09-24')
})
test('print checks actual A4 content and does not hide tiny scaling', () => {
  assert.equal(calculatePrintPreflight(800, 1100, 800, 1100).fitsSinglePage, true)
  const long = calculatePrintPreflight(800, 3300, 800, 1100)
  assert.equal(long.estimatedPages, 3)
  assert.equal(long.scaleToFit, 1/3)
  assert.equal(long.verticalOverflow, true)
  assert.equal(calculatePrintPreflight(1600, 500, 800, 1100).horizontalOverflow, true)
  assert.match(buildPrintDocument({ title: '검사', bodyHtml: '<p>자료</p>', orientation: 'landscape' }), /data-orientation="landscape"/)
})
test('task and change deep links preserve encoded IDs and repeated focus', () => {
  assert.equal(navigation.acceptTaskNavigation(navigation.taskNavigationTarget('업무 & #1', 'personal')), 'staff_tasks')
  assert.equal(navigation.useTaskFocus().id, '업무 & #1')
  assert.equal(navigation.useTaskFocus().kind, 'personal')
  navigation.acceptTaskNavigation(navigation.taskNavigationTarget('업무 & #1', 'personal'))
  assert.equal(navigation.useTaskFocus().sequence, 2)
  assert.equal(navigation.acceptTaskNavigation('dashboard'), 'dashboard')
  assert.equal(navigation.acceptChangeNavigation('timetable_swap?change=' + encodeURIComponent('변경#2')), 'timetable_swap')
  assert.equal(navigation.useChangeFocus().id, '변경#2')
})
const rule = (id, extra = {}) => ({ id, date: '2026-09-23', targetPeriod: 2, targetGrade: '', targetClass: '', active: true, action: 'copy', sourceDate: '2026-09-22', sourcePeriod: 1, ...extra })
test('override conflict understands whole school, grade, class and inactive rules', () => {
  assert.equal(overrideScopesOverlap(rule('a'), rule('b', { targetGrade: '3', targetClass: '2' })), true)
  assert.equal(overrideScopesOverlap(rule('a', { targetGrade: '2' }), rule('b', { targetGrade: '3' })), false)
  assert.equal(overrideScopesOverlap(rule('a', { targetClass: '1' }), rule('b', { targetClass: '2' })), false)
  assert.equal(overrideScopesOverlap(rule('a'), rule('a')), false)
  assert.equal(overrideScopesOverlap(rule('a'), rule('b', { active: false })), false)
  assert.equal(overrideScopesOverlap(rule('a'), rule('b', { targetPeriod: 3 })), false)
  assert.equal(overrideBatchConflicts([rule('a')], [rule('b')]).length, 1)
})
test('pulled source collisions are reported even with different destinations', () => {
  const a = rule('a', { action: 'move_pulled' })
  const b = rule('b', { action: 'move_pulled', date: '2026-09-24', targetPeriod: 7 })
  assert.equal(overrideScopesOverlap(a, b), true)
  assert.equal(overrideScopesOverlap(a, rule('c', { date: '2026-09-22', targetPeriod: 1 })), true)
})
async function testCacheFreshness() {
  let now = Date.parse('2026-09-25T00:00:00Z')
  let failed = false
  class Clock extends Date { static now() { return now } }
  const electron = {
    schoolHubCacheGetAll: async () => [], schoolHubCacheSet: async () => {},
    schoolHubRequest: async req => req.action === 'getSyncManifest'
      ? { ok: true, data: { resources: { timetable: 'v:1' } } }
      : failed ? { ok: false, error: 'synthetic offline' }
        : { ok: true, data: { version: 1, teachers: [] } },
  }
  const hub = bundle('src/services/schoolHub.ts', null, { Date: Clock, window: { electron, dispatchEvent: () => {} }, Event, console })
  await hub.getSchoolTimetable(true)
  const first = hub.getSchoolHubSourceStatus(['timetable'])[0].checkedAt
  now += 1000
  await hub.getSchoolTimetable()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(hub.getSchoolHubSourceStatus(['timetable'])[0].checkedAt, first, 'cached manifest cannot pretend to be a new server check')
  failed = true
  await assert.rejects(hub.getSchoolTimetable(true), /synthetic offline/)
  assert.equal(hub.getSchoolHubSourceStatus(['timetable'])[0].state, 'cached')
  await hub.getSchoolTimetable()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(hub.getSchoolHubSourceStatus(['timetable'])[0].state, 'cached', 'older manifest cannot clear a later failure')
  now += 1000
  failed = false
  await hub.getSchoolTimetable(true)
  assert.equal(hub.getSchoolHubSourceStatus(['timetable'])[0].state, 'fresh')
  assert.equal(hub.getSchoolHubSourceStatus(['staffRoster'])[0].state, 'unavailable')
  count++
  console.log('PASS per-source freshness preserves failure and original manifest check time')
}
testCacheFreshness().then(() => console.log(count + ' usability regression groups passed')).catch(error => { console.error(error); process.exitCode = 1 })
