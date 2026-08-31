'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
}
const moduleValue = { exports: {} }
new Function('module', 'exports', compile(fs.readFileSync(path.join(root, 'src/services/widgetSettings.ts'), 'utf8')))(moduleValue, moduleValue.exports)
const settings = moduleValue.exports
const normalize = settings.normalizeWidgetProductivitySettings
let count = 0
function test(name, run) { run(); count++; console.log(`PASS ${name}`) }

test('all known modules start expanded in every legacy schema', () => {
  for (const input of [undefined, null, {}, { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]) {
    const value = normalize(input)
    assert.equal(value.version, 4)
    assert.deepEqual(Object.keys(value.moduleCollapsed), [...settings.WIDGET_MODULE_IDS])
    assert.ok(Object.values(value.moduleCollapsed).every(item => item === false))
  }
})
test('only own boolean values of known module ids survive normalization', () => {
  for (const invalid of [null, [], true, 'meal', 42]) {
    assert.ok(Object.values(normalize({ moduleCollapsed: invalid }).moduleCollapsed).every(value => !value))
  }
  const input = Object.assign(Object.create({ timer: true }), { meal: true, timetable: false, fortune: 'true', tasks: 1, memo: null, events: true, unknown: true })
  const result = normalize({ moduleCollapsed: input }).moduleCollapsed
  assert.equal(result.meal, true)
  assert.ok(Object.entries(result).filter(([id]) => id !== 'meal').every(([, value]) => value === false))
  assert.ok(!Object.hasOwn(result, 'events'))
  assert.ok(!Object.hasOwn(result, 'unknown'))
})
test('toggle is immutable, independent and never changes hidden modules or order', () => {
  const original = normalize({ moduleVisibility: { memo: false }, moduleOrder: ['tasks', 'meal', 'memo'], showTimedEvents: false })
  const before = JSON.stringify(original)
  const first = settings.setWidgetModuleCollapsed(original, 'meal', true)
  const second = settings.setWidgetModuleCollapsed(first, 'tasks', true)
  const third = settings.setWidgetModuleCollapsed(second, 'meal', false)
  assert.equal(JSON.stringify(original), before)
  assert.equal(first.moduleCollapsed.meal, true)
  assert.equal(second.moduleCollapsed.meal, true)
  assert.equal(third.moduleCollapsed.meal, false)
  assert.equal(third.moduleCollapsed.tasks, true)
  assert.deepEqual(third.moduleVisibility, original.moduleVisibility)
  assert.deepEqual(third.moduleOrder, original.moduleOrder)
  assert.equal(third.showTimedEvents, false)
})
test('collapsed states survive reorder, hide/show and persisted JSON restart', () => {
  let current = settings.setWidgetModuleCollapsed(normalize({}), 'meal', true)
  current = settings.setWidgetModuleVisibility(current, 'meal', false)
  current = normalize({ ...current, moduleOrder: settings.moveWidgetModule(current.moduleOrder, 'meal', 0) })
  current = normalize(JSON.parse(JSON.stringify(current)))
  assert.equal(current.moduleCollapsed.meal, true)
  assert.equal(current.moduleVisibility.meal, false)
  assert.equal(current.moduleOrder[0], 'meal')
  current = settings.setWidgetModuleVisibility(current, 'meal', true)
  assert.equal(current.moduleCollapsed.meal, true)
})
test('v1/v2 event migration remains one-time and v3 hiding stays hidden', () => {
  for (const version of [1, 2]) {
    const result = normalize({ version, moduleVisibility: { timetable: false, events: true } })
    assert.equal(result.moduleVisibility.timetable, true)
    assert.equal(result.showTimedEvents, true)
    assert.equal(result.moduleCollapsed.timetable, false)
  }
  for (const version of [3, 4]) {
    const result = normalize({ version, moduleVisibility: { timetable: false, events: true }, moduleCollapsed: { timetable: true } })
    assert.equal(result.moduleVisibility.timetable, false)
    assert.equal(result.moduleCollapsed.timetable, true)
  }
})
test('normalized maps do not share mutable state across callers/defaults', () => {
  const first = normalize({}), second = normalize({})
  first.moduleCollapsed.meal = true
  assert.equal(second.moduleCollapsed.meal, false)
  assert.equal(settings.DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS.moduleCollapsed.meal, false)
})
test('actual Electron read and update plumbing persists collapsed maps and unrelated categories', () => {
  const source = fs.readFileSync(path.join(root, 'electron/main/index.ts'), 'utf8')
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const getter = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'widgetSettings')
  let update
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ipcMain.handle' && node.arguments[0]?.text === 'widget:updateSettings') update = node.arguments[1]
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(getter && update)
  let saved = { version: 3, showWeeklyPlans: false, showMealDuty: false, moduleVisibility: { timetable: false }, moduleOrder: ['meal', 'timer'], opacity: .9 }
  let afterSave
  const store = { get: () => saved, set: (_, value) => {
    saved = JSON.parse(JSON.stringify(value))
    const callback = afterSave
    afterSave = undefined
    callback?.()
  } }
  const executable = compile(`${getter.getText(ast)}\nconst update = ${update.getText(ast)};\nreturn { read: widgetSettings, update };`)
  const plumbing = new Function('store', 'WIDGET_SETTINGS_KEY', 'DEFAULT_WIDGET_SETTINGS', 'normalizeWidgetProductivitySettings', 'widgetWindow', executable)(store, 'synthetic-widget', { ...settings.DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS, opacity: .96 }, normalize, null)
  // Both independent clicks were formed before either response returned. Each
  // sends only its id, not a stale copy of the whole rendered settings map.
  const mealClick = { moduleCollapsed: { meal: true } }
  const timerClick = { moduleCollapsed: { timer: true } }
  plumbing.update(null, mealClick)
  plumbing.update(null, timerClick)
  plumbing.update(null, { opacity: .85 })
  const restarted = plumbing.read()
  assert.equal(restarted.version, 4)
  assert.equal(restarted.moduleCollapsed.meal, true)
  assert.equal(restarted.moduleCollapsed.timer, true)
  assert.equal(restarted.showWeeklyPlans, false)
  assert.equal(restarted.showMealDuty, false)
  assert.equal(restarted.moduleVisibility.timetable, false)
  assert.deepEqual(restarted.moduleOrder.slice(0, 2), ['meal', 'timer'])
  // A nested update at the persistence boundary must also preserve siblings.
  afterSave = () => plumbing.update(null, { moduleCollapsed: { tasks: true } })
  plumbing.update(null, { moduleCollapsed: { fortune: true } })
  const nested = plumbing.read()
  for (const id of ['meal', 'timer', 'fortune', 'tasks']) assert.equal(nested.moduleCollapsed[id], true)
  plumbing.update(null, { moduleCollapsed: { meal: false } })
  assert.equal(plumbing.read().moduleCollapsed.meal, false)
  assert.equal(plumbing.read().moduleCollapsed.timer, true)
})
console.log(`Widget collapse settings: ${count} checks passed.`)
