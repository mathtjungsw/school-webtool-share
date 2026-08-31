const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const source = fs.readFileSync(file, 'utf8')
  const localRequire = id => {
    if (id.endsWith('.css')) return {}
    if (!id.startsWith('.')) return require(id)
    const target = path.resolve(path.dirname(file), id)
    const actual = [target, `${target}.ts`, `${target}.tsx`].find(p => fs.existsSync(p) && fs.statSync(p).isFile())
    if (!actual) throw new Error(`Unresolved fixture import: ${id}`)
    return load(actual)
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: mod.exports, module: mod, require: localRequire, console })
  return mod.exports
}
const fromWidget = name => load(path.join(root, 'src/components/widget', `${name}.tsx`))
const { WidgetModuleDisclosure, WidgetModuleHeader, WidgetModuleBody } = fromWidget('WidgetModuleDisclosure')
const h = React.createElement
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`) }
function wrap(node, collapsed = true) { return renderToStaticMarkup(h(WidgetModuleDisclosure, { collapsed, onToggle() {} }, node)) }

test('collapsed body renders children with hidden, not unmounted; only one accessible toggle', () => {
  const node = h(React.Fragment, null,
    h(WidgetModuleHeader, { title: '검증 기능', summary: '실제 요약', actions: h('button', null, '본문 작업') }),
    h(WidgetModuleBody, null, h('input', { defaultValue: '보존할 입력' })))
  const collapsed = wrap(node)
  assert.match(collapsed, /hidden=""/)
  assert.ok(collapsed.includes('보존할 입력'))
  assert.ok(collapsed.includes('실제 요약'))
  assert.ok(!collapsed.includes('본문 작업'))
  assert.equal((collapsed.match(/<button/g) || []).length, 1)
  assert.ok(collapsed.includes('aria-expanded="false"'))
  const controls = collapsed.match(/aria-controls="([^"]+)"/)?.[1]
  assert.ok(controls && collapsed.includes(`id="${controls}"`), 'toggle controls its actual retained body')
  const expanded = wrap(node, false)
  assert.doesNotMatch(expanded, /hidden=""/)
  assert.ok(expanded.includes('보존할 입력'))
  assert.ok(expanded.includes('본문 작업'))
})

const modules = fromWidget('WidgetProductivityModules')
test('timer, tomorrow, weather and tasks summaries use real supplied values', () => {
  assert.ok(wrap(h(modules.WidgetPeriodTimerModule, { value: { phase: 'lunch', label: '점심', headline: '6교시 수학', countdown: '90분 뒤' } })).includes('6교시 수학 · 90분 뒤'))
  assert.ok(wrap(h(modules.WidgetTomorrowModule, { value: { dateLabel: '9.1', ruleLabel: '16:00부터 표시' } })).includes('16:00부터 표시'))
  assert.ok(wrap(h(modules.WidgetTomorrowModule, { value: { dateLabel: '9.7', dayLabel: '다음 수업일', firstLesson: { title: '2교시 수학' } } })).includes('9.7 · 다음 수업일 · 첫 수업 2교시 수학'))
  assert.ok(wrap(h(modules.WidgetWeatherModule, { actions: [] })).includes('날씨 자료 없음'))
  assert.ok(wrap(h(modules.WidgetTaskTimelineModule, { buckets: [{ id: 'today', label: '오늘', items: [{ id: 'a', title: '가상업무', completed: false }, { id: 'b', title: '가상완료', completed: true }] }] })).includes('미완료 1건 · 완료 1건'))
})

test('conditional end-of-day remains absent; shortcut summary is data-backed', () => {
  assert.equal(wrap(h(modules.WidgetEndOfDayModule, { value: { visible: false, incompleteTaskCount: 2 } })), '')
  assert.ok(wrap(h(modules.WidgetShortcutsModule, { shortcuts: [{ id: 'a', label: '가상 메뉴' }], onOpen() {} })).includes('1개 · 가상 메뉴'))
})

test('memo has one module toggle and independently labelled writer; tools keep inputs inside hidden body', () => {
  const Memo = fromWidget('WidgetQuickMemo').default
  const Tools = fromWidget('WidgetQuickTools').default
  const memo = wrap(h(Memo, { memos: [], onAdd() {}, onToggle() {}, onUpdate() {}, onDelete() {}, onConvertToTask() {} }))
  assert.ok(memo.includes('메모 0건 · 미완료 0건'))
  assert.equal((memo.match(/<button/g) || []).length, 1)
  const tools = wrap(h(Tools, { snippets: [], onAddSnippet() {}, onDeleteSnippet() {} }))
  assert.ok(tools.includes('QR · 입력 대기'))
  assert.ok(tools.includes('hidden=""'))
  assert.ok(tools.includes('주소나 안내 문구 입력'))
  const source = fs.readFileSync(path.join(root, 'src/components/widget/WidgetQuickMemo.tsx'), 'utf8')
  assert.ok(source.includes("expanded ? '입력 닫기' : '쓰기'"))
  const section = fs.readFileSync(path.join(root, 'src/components/widget/WidgetProductivityModules.tsx'), 'utf8')
  assert.doesNotMatch(section, /useState|defaultCollapsed|collapsible/)
})
console.log(`Widget disclosure: ${passed} SSR/structure checks passed (browser verifies live input retention).`)
