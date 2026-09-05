const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..')
function bundle(relativePath, reactOverride) {
  const entry = path.join(root, relativePath)
  const result = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node20', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'lucide-react'], loader: { '.css': 'empty' }, logLevel: 'silent' })
  const module = { exports: {} }
  const localRequire = createRequire(entry)
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' && reactOverride ? reactOverride : localRequire(name), console }, { timeout: 5000 })
  return module.exports
}
const { buildWidgetTimedSchedule: build, parseWidgetClock } = bundle('src/services/widgetTimedSchedule.ts')
const timetableExports = bundle('src/components/widget/WidgetTimetable.tsx')
const WidgetTimetable = timetableExports.default
const date = '2026-08-31'
const lessons = Array.from({ length: 7 }, (_, i) => ({ period: i + 1, value: i === 1 ? '' : `교실${i + 1}\n합성과목`, badge: i === 5 ? '당김수업' : '' }))
const event = (id, startTime, endTime, extra = {}) => ({ id, date, title: id, kind: 'committee', startTime, endTime, ...extra })
const base = { date, lessons, instruction: true, timetableAvailable: true }
const plain = value => JSON.parse(JSON.stringify(value))
let count = 0
function test(name, run) { run(); count++; console.log(`PASS ${name}`) }

test('strict clocks reject invalid or ambiguous times without inventing duration', () => {
  for (const value of [undefined, '', '오후 1시', '24:00', '13:60', '-1:30', '13:5', '13:00~14:00']) assert.equal(parseWidgetClock(value), null)
  assert.equal(parseWidgetClock('0:00'), 0)
  assert.equal(parseWidgetClock('23:59'), 1439)
  assert.equal(parseWidgetClock(' 9:05 '), 545)
})
test('seven instructional lesson rows preserve lesson content and badges', () => {
  const model = build({ ...base, events: [] })
  assert.equal(model.segments.length, 7)
  assert.ok(model.segments.every(segment => segment.kind === 'lesson'))
  assert.deepEqual(plain(model.segments.map(segment => segment.lesson)), lessons)
  assert.equal(model.segments[3].start, 700)
  assert.equal(model.segments[3].end, 750)
})
test('lunch, cross-period break and point markers map to exact clock intervals', () => {
  const model = build({ ...base, events: [event('위원회', '13:10', '13:25'), event('자료검토', '13:50', '14:45'), event('자료제출', '15:40')] })
  const lunch = model.segments.find(segment => segment.kind === 'lunch')
  assert.ok(lunch)
  assert.equal(lunch.pieces[0].topPercent, 40 / 60 * 100)
  assert.equal(lunch.pieces[0].heightPercent, 15 / 60 * 100)
  const review = model.segments.flatMap(segment => segment.pieces.filter(piece => piece.event.id === '자료검토').map(piece => ({ segment, piece })))
  assert.deepEqual(plain(review.map(item => item.segment.kind)), ['lesson', 'break', 'lesson'])
  assert.deepEqual(plain(review.filter(item => item.segment.lesson).map(item => item.segment.lesson.period)), [5, 6])
  assert.equal(review.reduce((sum, { segment, piece }) => sum + piece.heightPercent / 100 * (segment.end - segment.start), 0), 55)
  assert.equal(review[0].piece.continuesAfter, true)
  assert.equal(review[1].piece.continuesBefore, true)
  assert.equal(review[1].piece.continuesAfter, true)
  assert.equal(review[2].piece.continuesBefore, true)
  const point = model.events.find(item => item.id === '자료제출')
  assert.equal(point.point, true)
  assert.equal(point.start, point.end)
  assert.equal(point.timeLabel, '15:40')
  const pointPiece = model.segments.find(segment => segment.lesson?.period === 7).pieces[0]
  assert.equal(pointPiece.heightPercent, 0)
  assert.equal(pointPiece.topPercent, 0)
})
test('all-day, different dates, missing/invalid/reversed times are excluded', () => {
  const model = build({ ...base, events: [event('all', '09:00', '10:00', { allDay: true }), event('other', '09:00', '10:00', { date: '2026-09-01' }),
    event('date-only'), event('bad-start', 'abc'), event('bad-end', '09:00', 'unknown'), event('reversed', '15:00', '14:00'), event('overnight', '23:00', '01:00'), event('valid-point', '15:00', '15:00')] })
  assert.deepEqual(plain(model.events.map(item => item.id)), ['valid-point'])
  assert.equal(model.events[0].point, true)
})
test('before/after-school segments appear only when touched by timed events', () => {
  const model = build({ ...base, events: [event('before', '08:15', '08:25'), event('after', '17:00'), event('late', '23:59')] })
  assert.deepEqual(plain(model.segments.filter(segment => segment.kind !== 'lesson').map(segment => segment.kind)), ['before', 'after'])
  assert.equal(model.events.find(item => item.id === 'late').end, 1439)
  assert.equal(model.segments.at(-1).end, 1440)
  const boundary = build({ ...base, events: [event('boundary', '16:30')] })
  assert.equal(boundary.segments.at(-1).kind, 'after')
  assert.equal(boundary.segments.at(-1).pieces[0].event.point, true)
})
test('overlap receives separate lanes while touching endpoints do not overlap', () => {
  const model = build({ ...base, events: [event('a', '13:30', '14:00'), event('b', '13:45', '14:10'), event('c', '13:50', '14:05'), event('d', '14:10', '14:20'), event('point', '13:50')] })
  assert.equal(new Set(model.events.filter(item => ['a', 'b', 'c', 'point'].includes(item.id)).map(item => item.lane)).size, 4)
  assert.equal(model.events.find(item => item.id === 'd').lane, 0)
  const touch = build({ ...base, events: [event('a', '09:00', '09:10'), event('b', '09:10', '09:20')] })
  assert.equal(touch.events[0].lane, touch.events[1].lane)
})
test('non-instruction or missing timetable never fabricates seven free lessons', () => {
  for (const override of [{ instruction: false }, { timetableAvailable: false }, { instruction: false, timetableAvailable: false }]) {
    const model = build({ ...base, ...override, events: [event('meeting', '13:10', '13:25')] })
    assert.equal(model.segments.length, 1)
    assert.equal(model.segments[0].kind, 'events')
    assert.equal(model.segments[0].lesson, undefined)
  }
  assert.equal(build({ ...base, instruction: false, events: [] }).segments.length, 0)
})
test('model does not mutate input and duplicate records do not double render', () => {
  const events = [event('same', '13:00', '13:20'), event('same', '13:00', '13:20')]
  const input = { ...base, events }, before = JSON.stringify(input)
  assert.equal(build(input).events.length, 1)
  assert.equal(JSON.stringify(input), before)
})
function render(events, overrides = {}) {
  return renderToStaticMarkup(React.createElement(WidgetTimetable, { date, lessons, events, now: new Date(2026, 7, 31, 12, 16), rule: { kind: 'instruction', label: '수업일' },
    timer: { currentPeriod: 4, nextPeriod: 5, countdown: '14분 남음', remainingMinutes: 14 }, ...overrides }))
}
test('render preserves current lesson countdown, next actual lesson, badge and point accessibility', () => {
  const html = render([event('제출시각', '15:40')])
  assert.ok(html.includes('14분 남음'))
  assert.ok(html.includes('다음 74분 후'))
  assert.ok(!html.includes('다음 14분'))
  assert.ok(html.includes('당김수업'))
  assert.ok(html.includes('wts-current'))
  assert.ok(html.includes('aria-label="시각 15:40 제출시각"'))
  assert.ok(!html.includes('aria-label="기간 15:40'))
})
test('render offers overlap expansion instead of horizontal overflow or unreadable many lanes', () => {
  const html = render([event('a', '13:30', '14:10'), event('b', '13:40', '14:00'), event('c', '13:45', '13:55')])
  assert.ok(html.includes('wts-overlap'))
  assert.ok(html.includes('3개 일정 상세 보기'))
  assert.ok(html.includes('보기'))
})
test('unavailable and holiday render retain timed events without fake free lesson rows', () => {
  for (const overrides of [{ timetableUnavailable: true }, { rule: { kind: 'weekend', label: '주말' } }]) {
    const html = render([event('행사', '12:10')], overrides)
    assert.ok(html.includes('행사'))
    assert.ok(!html.includes('공강'))
    assert.ok(!html.includes('1교시'))
    assert.ok(!html.includes('12:10~12:11'))
  }
})
test('event clicks and overlap expansion show read-only details locally and close cleanly', () => {
  let detail = null
  const Interactive = bundle('src/components/widget/WidgetTimetable.tsx', { ...React, useMemo: create => create(), useEffect: () => {}, useRef: () => ({ current: null }), useState: () => [detail, value => { detail = value }] }).default
  const props = { date, lessons, events: [event('위원회 상세', '13:10', '13:25', { location: '회의실', meta: '합성 안건' })],
    now: new Date(2026, 7, 31, 12, 16), rule: { kind: 'instruction' }, timer: { currentPeriod: 4, nextPeriod: 5 } }
  function elements(node, predicate, result = []) {
    if (!node || typeof node !== 'object') return result
    if (Array.isArray(node)) { node.forEach(child => elements(child, predicate, result)); return result }
    if (predicate(node)) result.push(node)
    elements(node.props?.children, predicate, result)
    return result
  }
  const initial = Interactive(props)
  const button = elements(initial, node => node.type === 'button' && String(node.props.className).includes('wts-event-label'))[0]
  assert.ok(button)
  button.props.onClick()
  assert.equal(detail.date, date)
  const opened = Interactive(props), html = renderToStaticMarkup(opened)
  assert.ok(html.includes('일정 상세 · 읽기 전용'))
  assert.ok(html.includes('회의실'))
  assert.ok(html.includes('합성 안건'))
  assert.ok(!html.includes('<input') && !html.includes('<form'))
  assert.ok(!renderToStaticMarkup(Interactive({ ...props, date: '2026-09-01' })).includes('일정 상세 · 읽기 전용'))
  elements(opened, node => node.type === 'button' && node.props['aria-label'] === '일정 상세 닫기')[0].props.onClick()
  assert.equal(detail, null)
  const crowded = { ...props, events: ['a', 'b', 'c'].map(id => event(id, '13:30', '14:00')) }
  elements(Interactive(crowded), node => node.type === 'button' && node.props.className === 'wts-overlap')[0].props.onClick()
  assert.equal(detail.keys.length, 3)
  assert.equal(elements(Interactive(crowded), node => node.type === 'article').length, 3)
  const longLesson = '304 · 매우 긴 합성 교과명과 강의실 정보 전체 보기'
  const lessonProps = { ...props, lessons: lessons.map(lesson => lesson.period === 4 ? { ...lesson, value: longLesson, badge: '교환 반영' } : lesson) }
  const lessonButton = elements(Interactive(lessonProps), node => node.type === 'button' && node.props.className === 'wts-lesson' && node.props['aria-label'].startsWith('4교시'))[0]
  lessonButton.props.onClick()
  assert.equal(detail.period, 4)
  const lessonHtml = renderToStaticMarkup(Interactive(lessonProps))
  assert.ok(lessonHtml.includes('4교시 · 수업 상세'))
  assert.ok(lessonHtml.includes(longLesson))
  assert.ok(lessonHtml.includes('교환 반영'))
  assert.ok(lessonHtml.includes('11:40~12:30'))
})
test('compact 26px rows clamp all tag positions without negative tops or adjacent-row overflow', () => {
  assert.equal(timetableExports.WIDGET_TIMETABLE_ROW_HEIGHT, 26)
  assert.equal(timetableExports.WIDGET_TIMETABLE_TAG_HEIGHT, 22)
  for (const percentage of [-20, 0, 10, 40, 80, 100, 140]) {
    const top = timetableExports.widgetTimedTagTop(percentage)
    assert.ok(top >= 0 && top + timetableExports.WIDGET_TIMETABLE_TAG_HEIGHT <= 26)
  }
  const html = render([event('late-point', '13:29'), event('short-range', '15:19', '15:20')])
  assert.ok(html.includes('min-height:26px'))
  assert.ok(!html.includes('min-height:42px') && !html.includes('min-height:32px'))
  assert.ok(!html.includes('top:-'))
})
test('module header summarizes current and next actual lesson while body remains mounted', () => {
  const Interactive = bundle('src/components/widget/WidgetTimetable.tsx', { ...React, useMemo: create => create(), useEffect: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}] }).default
  const props = { date, lessons, events: [], now: new Date(2026, 7, 31, 12, 16), rule: { kind: 'instruction' }, timer: { currentPeriod: 4, nextPeriod: 5, countdown: '14분 남음' } }
  const tree = Interactive(props)
  const children = React.Children.toArray(tree.props.children)
  const header = children.find(child => child.type?.name === 'WidgetModuleHeader')
  const body = children.find(child => child.type?.name === 'WidgetModuleBody')
  assert.ok(header && body)
  assert.equal(header.props.title, '오늘 시간표')
  assert.ok(header.props.summary.includes('현재 4교시'))
  assert.ok(header.props.summary.includes('다음 5교시 74분 후'))
  assert.ok(!header.props.summary.includes('14분 후'))
  assert.ok(body.props.children, 'Disclosure must wrap, not conditionally unmount, timetable content')
  const withFree = Interactive({ ...props, lessons: lessons.map(lesson => lesson.period === 5 ? { ...lesson, value: '' } : lesson) })
  const nextHeader = React.Children.toArray(withFree.props.children).find(child => child.type?.name === 'WidgetModuleHeader')
  assert.ok(nextHeader.props.summary.includes('다음 6교시 134분 후'))
  for (const events of [[], [event('lunch-event', '12:50', '13:10')]]) {
    const lunch = Interactive({ ...props, events, now: new Date(2026, 7, 31, 13, 0), lessons: lessons.map(lesson => lesson.period === 5 ? { ...lesson, value: '' } : lesson) })
    const lunchHeader = React.Children.toArray(lunch.props.children).find(child => child.type?.name === 'WidgetModuleHeader')
    assert.equal(lunchHeader.props.summary, '점심 · 다음 6교시 90분 후')
  }
})
test('detail scrolling occurs only on a new open selection and only outside widget-body bounds', () => {
  let detail = null, previousDependency, scrollCount = 0, bounds = { top: 450, bottom: 600 }, regionPresent = true
  const region = {
    closest: selector => { assert.equal(selector, '.widget-scroll-body'); return { getBoundingClientRect: () => ({ top: 50, bottom: 400 }) } },
    getBoundingClientRect: () => bounds,
    scrollIntoView: options => { assert.deepEqual(plain(options), { block: 'nearest', behavior: 'smooth' }); scrollCount++ },
  }
  const Interactive = bundle('src/components/widget/WidgetTimetable.tsx', {
    ...React, useMemo: create => create(), useRef: () => ({ current: regionPresent ? region : null }),
    useState: () => [detail, value => { detail = value }],
    useEffect: (effect, dependencies) => { assert.equal(dependencies.length, 1); if (dependencies[0] !== previousDependency) { previousDependency = dependencies[0]; effect() } },
  }).default
  const props = { date, lessons, events: [event('meeting', '13:10', '13:25')], now: new Date(2026, 7, 31, 12, 16), rule: { kind: 'instruction' }, timer: { currentPeriod: 4, nextPeriod: 5 } }
  Interactive(props)
  assert.equal(scrollCount, 0)
  detail = { date, keys: ['synthetic-selection'] }
  Interactive(props)
  assert.equal(scrollCount, 1)
  Interactive({ ...props, now: new Date(2026, 7, 31, 12, 17), events: [...props.events] })
  assert.equal(scrollCount, 1, 'Clock ticks and refreshed data must not scroll')
  bounds = { top: 60, bottom: 200 }
  detail = { date, keys: ['another-selection'] }
  Interactive(props)
  assert.equal(scrollCount, 1, 'Already visible detail must not scroll')
  detail = null
  Interactive(props)
  assert.equal(scrollCount, 1, 'Closing detail must not scroll')
  regionPresent = false
  detail = { date, keys: ['missing-region'] }
  Interactive(props)
  assert.equal(scrollCount, 1)
})
console.log(`Widget timed schedule: ${count} pure-model and render checks passed (synthetic data only).`)
