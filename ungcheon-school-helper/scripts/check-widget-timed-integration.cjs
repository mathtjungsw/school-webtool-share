'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// All records below are synthetic. No live teacher/student/server data is read.
const root = path.resolve(__dirname, '..')
const cache = new Map()
function loadTs(relativePath) {
  const absolute = path.resolve(root, relativePath)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const source = fs.readFileSync(absolute, 'utf8')
  const output = ts.transpileModule(source, {
    fileName: absolute,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  cache.set(absolute, module)
  const requireLocal = request => {
    if (!request.startsWith('.')) return require(request)
    const resolved = path.resolve(path.dirname(absolute), request)
    const candidate = [resolved, `${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, 'index.ts')]
      .find(item => fs.existsSync(item) && fs.statSync(item).isFile())
    assert.ok(candidate, `Missing local module: ${request}`)
    return loadTs(path.relative(root, candidate))
  }
  new Function('require', 'module', 'exports', output)(requireLocal, module, module.exports)
  return module.exports
}
let count = 0
function test(label, run) { run(); count++; console.log(`PASS ${label}`) }
const settings = loadTs('src/services/widgetSettings.ts')
const normalize = settings.normalizeWidgetProductivitySettings

test('schema v4 retains the integrated events lane by default', () => {
  const current = normalize(undefined)
  assert.equal(current.version, 4)
  assert.equal(current.showTimedEvents, true)
  assert.equal(settings.WIDGET_MODULE_IDS.length, 12)
  assert.ok(!settings.WIDGET_MODULE_IDS.includes('events'))
  assert.ok(!current.moduleOrder.includes('events'))
  assert.ok(!Object.hasOwn(current.moduleVisibility, 'events'))
})

test('lane visibility migration preserves every previously supported hide/show preference', () => {
  for (const [input, expected] of [
    [{ showTimedEvents: false, moduleVisibility: { events: true }, showEvents: true }, false],
    [{ showTimedEvents: true, moduleVisibility: { events: false }, enabledModules: [], showEvents: false }, true],
    [{ version: 2, moduleVisibility: { events: false }, enabledModules: ['events'], showEvents: true }, false],
    [{ version: 2, moduleVisibility: { events: true }, enabledModules: [], showEvents: false }, true],
    [{ enabledModules: [], showEvents: true }, false],
    [{ enabledModules: ['timetable'], showEvents: true }, false],
    [{ enabledModules: ['events'], showEvents: false }, true],
    [{ showEvents: false }, false],
    [{ showEvents: true }, true],
    [{ showTimedEvents: null, moduleVisibility: { events: false } }, false],
    [{ showTimedEvents: 'true', moduleVisibility: { events: 'false' }, showEvents: false }, false],
    [{}, true],
  ]) assert.equal(normalize(input).showTimedEvents, expected, JSON.stringify(input))
})

test('migration is non-mutating and preserves order, other visibility and later setting edits', () => {
  const saved = { version: 2, moduleOrder: ['events', 'tasks', 'timer', 'events', 'tasks'], moduleVisibility: { events: false, meal: false, memo: true } }
  const before = JSON.stringify(saved)
  const migrated = normalize(saved)
  assert.equal(JSON.stringify(saved), before)
  assert.deepEqual(migrated.moduleOrder.slice(0, 2), ['tasks', 'timer'])
  assert.equal(migrated.moduleOrder.length, 12)
  assert.equal(migrated.moduleVisibility.meal, false)
  assert.equal(migrated.moduleVisibility.memo, true)
  assert.equal(migrated.showTimedEvents, false)
  assert.equal(normalize(JSON.parse(JSON.stringify(migrated))).showTimedEvents, false)
  assert.equal(settings.setWidgetModuleVisibility(migrated, 'meal', true).showTimedEvents, false)
})

const adapters = loadTs('src/services/widgetEventSources.ts')
test('legacy visible events reveal the merged timetable exactly once, without overriding later hiding', () => {
  for (const legacy of [
    { version: 2, moduleVisibility: { timetable: false, events: true } },
    { enabledModules: ['events'] },
    { moduleVisibility: { timetable: false }, showEvents: true },
  ]) {
    const migrated = normalize(legacy)
    assert.equal(migrated.moduleVisibility.timetable, true)
    assert.equal(migrated.showTimedEvents, true)
    const hiddenAgain = { ...migrated, moduleVisibility: { ...migrated.moduleVisibility, timetable: false } }
    assert.equal(normalize(hiddenAgain).moduleVisibility.timetable, false)
    assert.equal(normalize({ ...hiddenAgain, showEvents: true }).moduleVisibility.timetable, false)
  }
  for (const saved of [
    { version: 2, moduleVisibility: { timetable: false, events: false }, showEvents: true },
    { moduleVisibility: { timetable: false }, enabledModules: [], showEvents: true },
    { moduleVisibility: { timetable: false } },
    { version: 2, moduleVisibility: { timetable: false, events: true }, showTimedEvents: false },
    { version: 3, moduleVisibility: { timetable: false, events: true } },
    { version: 3, moduleVisibility: { timetable: false }, showEvents: true },
    { version: 4, moduleVisibility: { timetable: false, events: true } },
  ]) assert.equal(normalize(saved).moduleVisibility.timetable, false, JSON.stringify(saved))
})
const model = loadTs('src/services/widgetTimedSchedule.ts')
const date = '2026-08-31'
const teacher = '합성교사'
const supplement = {
  weekly: [
    { date: '20260831', eventName: '회의 09:20~09:50', department: '검사부', sheetName: '합성' },
    { date, eventName: '학년 행사 3학년', department: '검사부', sheetName: '합성' },
    { date, eventName: '종일 행사 09:00', department: '', sheetName: '합성' },
    { date: '20260901', eventName: '다음날 10:00', department: '', sheetName: '합성' },
  ],
  duty: [
    { date: '20260831', kind: 'gate', title: '등교지도', time: '08:15~08:25', location: '정문', sourceSheet: '합성' },
    { date, kind: 'meal', title: '급식지도', time: '12:30~13:10', location: '급식실', sourceSheet: '합성' },
  ],
  creative: [
    { date: '20260831', kind: 'activity', title: '창체 연속', period: '5,6교시', grades: '전체', sourceSheet: '합성' },
    { date, kind: 'activity', title: '창체 분리', period: '1,3', grades: '전체', sourceSheet: '합성' },
    { date, kind: 'schoolEvent', title: '학사 행사', period: '', grades: '', sourceSheet: '합성' },
  ],
}
const personal = [
  { id: 'p1', date: '20260831', title: '개인 일정', time: '10:45', endTime: '11:05', kind: 'schedule' },
  { id: 'p2', date, title: '개인 업무', time: '11:00', kind: 'task', completed: false },
  { id: 'p3', date, title: '완료 업무', time: '11:10', kind: 'task', completed: true },
  { id: 'p4', date, title: '숨긴 일정', time: '11:20', kind: 'schedule', showOnCalendar: false },
  { id: 'p5', date, title: '시간 없는 일정', kind: 'schedule' },
]
const base = {
  personal,
  sharedTasks: [
    { id: 's1', deadline: '20260831', title: '업무 마감', targetNames: [teacher], responses: [], items: [], status: 'open' },
    { id: 's2', deadline: '20260910', scheduledDate: '20260831', startTime: '15:40', title: '시각 업무', targetNames: [teacher], responses: [], items: [], status: 'open' },
    { id: 's3', deadline: '20260910', scheduledDate: '20260831', startTime: '13:10', endTime: '13:25', title: '기간 업무', targetNames: [teacher], responses: [], items: [], status: 'open' },
  ],
  schoolSchedules: [{ date: '20260831', eventName: '학사일정 3학년' }],
  committeeEvents: [
    { id: 'c1', date: '20260831', title: '위원회', committeeName: '합성위원회', memberNames: [teacher], startTime: '13:10', endTime: '13:25', location: '회의실' },
    { id: 'c2', date, title: '다른 위원회', memberNames: ['다른합성교사'], startTime: '10:00', endTime: '10:30' },
  ],
}
test('source dates normalize compact and ISO dates without accepting invalid calendar dates', () => {
  assert.equal(adapters.normalizeWidgetEventDate('20260831'), date)
  assert.equal(adapters.normalizeWidgetEventDate(' 2026-08-31 '), date)
  for (const invalid of ['20260230', '2026-13-01', '202608', '2026-08-31T12:00']) {
    assert.equal(adapters.normalizeWidgetEventDate(invalid), '')
  }
  const result = adapters.buildWidgetSupplementEvents(date, supplement)
  assert.ok(result.length > 0)
  assert.ok(result.every(event => event.date === date))
  assert.ok(!result.some(event => event.title.includes('다음날')))
  assert.deepEqual(adapters.buildWidgetSupplementEvents('20260831', supplement), result)
})
test('explicit ranges, duty times and contiguous/noncontiguous creative periods preserve timing', () => {
  const events = adapters.buildWidgetSupplementEvents(date, supplement)
  const clock = title => events.filter(event => event.title === title).map(event => [event.startTime, event.endTime])
  assert.deepEqual(clock('회의 09:20~09:50'), [['09:20', '09:50']])
  assert.deepEqual(clock('등교지도'), [['08:15', '08:25']])
  assert.deepEqual(clock('급식지도'), [['12:30', '13:10']])
  assert.deepEqual(clock('창체 연속'), [['13:30', '15:20']])
  assert.deepEqual(clock('창체 분리'), [['08:40', '09:30'], ['10:40', '11:30']])
  assert.equal(new Set(events.map(event => event.id)).size, events.length)
  for (const prose of ['3학년 행사', '2026-08-31', '09:00 회의, 15:00 연수']) {
    assert.deepEqual(adapters.explicitWidgetTime(prose), {})
  }
})
test('personal and committee adapters preserve visibility, completion and end times', () => {
  const events = adapters.buildWidgetBaseEvents(date, base, teacher)
  assert.ok(!events.some(event => ['완료 업무', '숨긴 일정', '다른 위원회'].includes(event.title)))
  assert.ok(events.some(event => event.title === '업무 마감' && event.allDay))
  const committee = events.find(event => event.kind === 'committee')
  assert.equal(committee.startTime, '13:10')
  assert.equal(committee.endTime, '13:25')
  assert.equal(committee.location, '회의실')
  const personalSchedule = events.find(event => event.title === '개인 일정')
  assert.equal(personalSchedule.startTime, '10:45')
  assert.equal(personalSchedule.endTime, '11:05')
  const pointTask = events.find(event => event.title === '시각 업무')
  assert.equal(pointTask.startTime, '15:40')
  assert.equal(pointTask.endTime, undefined)
  assert.equal(pointTask.allDay, false)
  const rangedTask = events.find(event => event.title === '기간 업무')
  assert.equal(rangedTask.startTime, '13:10')
  assert.equal(rangedTask.endTime, '13:25')
  assert.ok(adapters.buildWidgetBaseEvents(date, { ...base, includeCompletedTasks: true }, teacher).some(event => event.title === '완료 업무'))
  assert.deepEqual(adapters.buildWidgetBaseEvents(date, base, ''), [])
})
test('adapters feed timetable model while untimed/all-day items remain available for summaries only', () => {
  const events = [...adapters.buildWidgetBaseEvents(date, base, teacher), ...adapters.buildWidgetSupplementEvents(date, supplement)]
  const lessons = Array.from({ length: 7 }, (_, i) => ({ period: i + 1, value: i === 0 ? '합성 수업' : '' }))
  const output = model.buildWidgetTimedSchedule({ date, lessons, events, instruction: true, timetableAvailable: true })
  assert.equal(output.events.length, 11)
  for (const title of ['시간 없는 일정', '업무 마감', '학사일정 3학년', '학년 행사 3학년', '학사 행사', '종일 행사 09:00']) {
    assert.ok(events.some(event => event.title === title), `Summary lost ${title}`)
    assert.ok(!output.events.some(event => event.title === title), `Untimed lane entry ${title}`)
  }
  assert.equal(output.segments.filter(segment => segment.kind === 'lesson').length, 7)
  assert.ok(output.segments.some(segment => segment.kind === 'before' && segment.pieces.some(piece => piece.event.title === '등교지도')))
  assert.ok(output.segments.some(segment => segment.kind === 'lunch' && segment.pieces.some(piece => piece.event.title === '급식지도')))
  const meetingSegments = output.segments.filter(segment => segment.pieces.some(piece => piece.event.title === '회의 09:20~09:50'))
  assert.ok(meetingSegments.length >= 3, 'Cross-period event must retain break and both lessons')
})
test('renderer connects filtered timed events and settings without a separate event module', () => {
  const app = fs.readFileSync(path.join(root, 'src/components/widget/WidgetApp.tsx'), 'utf8')
  const source = ts.createSourceFile('WidgetApp.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let timetableProps
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'WidgetTimetable') {
      timetableProps = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(prop => [prop.name.getText(source), prop.initializer?.getText(source)]))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(timetableProps, 'WidgetTimetable must be rendered')
  assert.equal(timetableProps.get('events'), '{timedEvents}')
  assert.equal(timetableProps.get('date'), '{today}')
  assert.match(app, /settings\.showTimedEvents\s*\?\s*filteredEvents\s*:\s*\[\]/)
  for (const option of ['showPersonalSchedules', 'showPersonalTasksInEvents', 'showNeisSchedules', 'showCommitteeEvents', 'showWeeklyPlans', 'showGateDuty', 'showMealDuty', 'showCreativeActivities']) {
    assert.match(app, new RegExp(`return settings\\.${option}`))
  }
  assert.doesNotMatch(app, /const eventsModule\s*=|case\s+["']events["']\s*:/)
  const panel = fs.readFileSync(path.join(root, 'src/components/widget/WidgetSettingsPanel.tsx'), 'utf8')
  assert.match(panel, /시간표의 시간 지정 일정 표시/)
  assert.match(panel, /showTimedEvents/)
  assert.doesNotMatch(app, /다음\s*\{timerView\.countdown\}/, 'Collapsed next lesson must not use current-period remaining time')
  assert.match(app, /nextLessonMinutes/)
  assert.match(app, /ref=\{popoverRef\}/)
  assert.match(app, /\}, \[openPanel\]\)/, 'Only a user-opened footer panel triggers its scroll effect')
  for (const marker of ['DndContext', 'SortableContext', 'useSortable', 'verticalListSortingStrategy', 'arrayMove']) assert.match(app, new RegExp(marker))
  assert.match(app, /aria-label="기능 순서 이동"/)
  assert.match(app, /applySettings\(\{ moduleOrder \}\)/)
})
console.log(`Widget timed integration: ${count} checks passed.`)
