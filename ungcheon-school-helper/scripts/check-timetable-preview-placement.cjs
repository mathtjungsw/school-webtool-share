const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function parse(relativePath) {
  const source = ts.createSourceFile(relativePath, fs.readFileSync(path.join(root, relativePath), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(source.parseDiagnostics.length, 0, `${relativePath}: TypeScript parse failure`)
  return source
}
const page = parse('src/pages/TimetableSwapPage.tsx')
const component = parse('src/components/timetable/TeacherSchedulePreview.tsx')
function all(node, predicate) {
  const found = []
  function visit(current) { if (predicate(current)) found.push(current); ts.forEachChild(current, visit) }
  visit(node)
  return found
}
function tag(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText()
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return ''
}
function attr(node, name) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node
  return opening.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name)?.initializer
}
function expression(node, name) {
  const value = attr(node, name)
  assert.ok(value && ts.isJsxExpression(value) && value.expression, `${tag(node)} requires ${name} expression`)
  return value.expression
}
function calls(node, name) {
  return all(node, item => ts.isCallExpression(item) && ts.isIdentifier(item.expression) && item.expression.text === name)
}
function variable(name) {
  const matches = all(page, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
  assert.equal(matches.length, 1, `${name} declaration must remain unique`)
  return matches[0].initializer
}
function executable(node, bindings) {
  const compiled = ts.transpileModule(`(${node.getText()})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  return vm.runInNewContext(compiled, bindings, { timeout: 1000 })
}
function plain(value) { return JSON.parse(JSON.stringify(value)) }
let count = 0
function test(name, run) { run(); count += 1; console.log(`PASS ${name}`) }

const previews = all(page, node => tag(node) === 'TeacherSchedulePreview')
assert.equal(previews.length, 1, '예상 시간표 must render once; no bottom duplicate')
const preview = previews[0]
const candidateSections = all(page, node => tag(node) === 'section' && all(node, child => tag(child) === 'CandidateButton').length === 2)
assert.equal(candidateSections.length, 1, '교환·대강 후보 선택 section must remain')
const candidates = candidateSections[0]

test('one preview sits immediately above the candidate teacher card selection, not below or above the main teacher selector', () => {
  let previewBlock = preview
  while (previewBlock.parent && previewBlock.parent !== candidates.parent) previewBlock = previewBlock.parent
  assert.equal(previewBlock.parent, candidates.parent, 'Preview and candidate section must share a layout parent')
  assert.ok(ts.isJsxFragment(candidates.parent) || ts.isJsxElement(candidates.parent), 'Candidate parent must be JSX layout')
  const siblings = candidates.parent.children.filter(node => !ts.isJsxText(node) && !(ts.isJsxExpression(node) && !node.expression))
  assert.equal(siblings.indexOf(previewBlock) + 1, siblings.indexOf(candidates), 'Preview must be the immediately preceding visible block')
  const teacherSelect = all(page, node => tag(node) === 'select' && calls(expression(node, 'onChange'), 'setTeacherIndex').length)[0]
  assert.ok(teacherSelect && teacherSelect.getStart() < previewBlock.getStart(), 'Original teacher selector must stay above preview')
  let conditional = preview.parent
  while (conditional && !ts.isJsxExpression(conditional)) conditional = conditional.parent
  const identifiers = all(conditional, ts.isIdentifier).map(node => node.text)
  assert.ok(identifiers.includes('preview') && identifiers.includes('previewSimulation'), 'Preview must still require both selection and simulation')
})

test('preview props retain selected teacher, simulation, mode, close and add-to-plan actions', () => {
  const teacher = expression(preview, 'teacher')
  assert.ok(ts.isElementAccessExpression(teacher))
  assert.equal(teacher.expression.getText(), 'timetable.teachers')
  assert.equal(teacher.argumentExpression.getText(), 'preview.teacherIndex')
  assert.equal(expression(preview, 'simulation').getText(), 'previewSimulation')
  assert.equal(expression(preview, 'mode').getText(), 'preview.mode')
  assert.equal(expression(preview, 'onAdd').getText(), 'addPreviewToPlan')
  const updates = []
  executable(expression(preview, 'onClose'), { setPreview: value => updates.push(value) })()
  assert.deepEqual(updates, [null])
  const closeButtons = all(component, node => tag(node) === 'button' && attr(node, 'aria-label')?.text === '미리보기 닫기')
  assert.equal(closeButtons.length, 1)
  assert.equal(expression(closeButtons[0], 'onClick').getText(), 'onClose')
  assert.equal(all(component, node => tag(node) === 'button' && attr(node, 'onClick') && ts.isIdentifier(expression(node, 'onClick')) && expression(node, 'onClick').text === 'onAdd').length, 1)
})

test('exchange and substitution candidate selection still replace preview with the chosen teacher', () => {
  const buttons = all(candidates, node => tag(node) === 'CandidateButton')
  const changes = []
  const bindings = { setPreview: value => changes.push(plain(value)), candidate: { partnerTeacherIndex: 3, partnerSlotIndex: 9 }, candidateIndex: 5, selectedSlot: 4 }
  buttons.forEach(button => executable(expression(button, 'onClick'), bindings)())
  assert.deepEqual(changes, [
    { mode: 'exchange', teacherIndex: 3, partnerSlotIndex: 9 },
    { mode: 'substitution', teacherIndex: 5, partnerSlotIndex: 4 },
  ])
})

test('simulation still selects exchange/substitution and forwards exact slot inputs', () => {
  const memo = variable('previewSimulation')
  assert.ok(ts.isCallExpression(memo) && memo.expression.getText() === 'useMemo')
  const run = mode => {
    const invocations = []
    const timetable = { teachers: [] }
    const result = executable(memo.arguments[0], {
      timetable, selectedSlot: 4, teacherIndex: 1, preview: { mode, teacherIndex: 3, partnerSlotIndex: 9 },
      simulateExchange: (...args) => { invocations.push(['exchange', ...args]); return 'exchange-result' },
      simulateSubstitution: (...args) => { invocations.push(['substitution', ...args]); return 'substitution-result' },
    })()
    assert.equal(result, `${mode}-result`)
    assert.deepEqual(invocations, [[mode, timetable, 1, 4, 3, ...(mode === 'exchange' ? [9] : [])]])
  }
  run('exchange'); run('substitution')
  assert.equal(executable(memo.arguments[0], { timetable: {}, selectedSlot: 4, preview: null })(), null)
  const grids = all(component, node => tag(node) === 'ScheduleGrid')
  assert.deepEqual(grids.map(node => attr(node, 'title').text), ['변경 전', '변경 후'])
  assert.deepEqual(grids.map(node => expression(node, 'slots').getText()), ['simulation.before', 'simulation.after'])
  assert.equal(expression(grids[1], 'changedSlots').getText(), 'simulation.changedSlots')
})

test('teacher, lesson and exchange/substitution tab changes reset stale preview', () => {
  const recorded = []
  const bindings = {
    setTeacherIndex: value => recorded.push(['teacher', value]), setSelectedSlot: value => recorded.push(['slot', value]),
    setPreview: value => recorded.push(['preview', value]), setViewMode: value => recorded.push(['mode', value]), setError: () => {},
  }
  const teacherSelect = all(page, node => tag(node) === 'select' && calls(expression(node, 'onChange'), 'setTeacherIndex').length)[0]
  executable(expression(teacherSelect, 'onChange'), bindings)({ target: { value: '6' } })
  assert.deepEqual(recorded.splice(0), [['teacher', 6], ['slot', null], ['preview', null]])
  const lessonButtons = all(page, node => tag(node) === 'button' && attr(node, 'onClick') && calls(expression(node, 'onClick'), 'setSelectedSlot').some(call => call.arguments[0]?.getText() === 'slotIndex'))
  assert.equal(lessonButtons.length, 1)
  executable(expression(lessonButtons[0], 'onClick'), { ...bindings, inlineCandidates: [], slot: { value: '수학', locked: false }, viewMode: 'exchange', slotIndex: 8 })()
  assert.deepEqual(recorded.splice(0), [['slot', 8], ['preview', null]])
  for (const mode of ['exchange', 'substitution']) {
    const tabs = all(page, node => tag(node) === 'ModeButton' && attr(node, 'onClick') && calls(expression(node, 'onClick'), 'setViewMode').some(call => call.arguments[0]?.text === mode))
    assert.equal(tabs.length, 1, `${mode} tab missing`)
    executable(expression(tabs[0], 'onClick'), bindings)()
    assert.deepEqual(recorded.splice(0), [['mode', mode], ['slot', null], ['preview', null]])
  }
})

test('preview selection scrolls only if the preview is outside the viewport; close and visible previews never scroll', () => {
  const effects = calls(page, 'useEffect').filter(call => all(call.arguments[0], node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'scrollIntoView').length)
  assert.equal(effects.length, 1)
  const effect = effects[0]
  assert.ok(ts.isArrayLiteralExpression(effect.arguments[1]))
  assert.deepEqual(effect.arguments[1].elements.map(node => node.getText()), ['preview'])
  const attached = all(page, node => tag(node) === 'div' && attr(node, 'ref') && expression(node, 'ref').getText() === 'previewRegionRef')
  assert.equal(attached.length, 1)
  assert.equal(all(attached[0], node => tag(node) === 'TeacherSchedulePreview').length, 1)
  for (const scenario of [
    { preview: null, top: -100, bottom: 1200, expected: 0 },
    { preview: {}, top: 0, bottom: 800, expected: 0 },
    { preview: {}, top: 100, bottom: 700, expected: 0 },
    { preview: {}, top: -1, bottom: 500, expected: 1 },
    { preview: {}, top: 400, bottom: 801, expected: 1 },
  ]) {
    const scrolls = []
    executable(effect.arguments[0], {
      preview: scenario.preview, window: { innerHeight: 800 },
      previewRegionRef: { current: { getBoundingClientRect: () => scenario, scrollIntoView: options => scrolls.push(plain(options)) } },
    })()
    assert.equal(scrolls.length, scenario.expected)
    if (scrolls.length) assert.deepEqual(scrolls[0], { block: 'nearest', behavior: 'auto' })
  }
  executable(effect.arguments[0], { preview: {}, previewRegionRef: { current: null } })()
})

test('add-to-plan preserves mode/teacher/slots, existing entries, duplicate guard and preview close', () => {
  for (const mode of ['exchange', 'substitution']) {
    const writes = [], errors = [], resets = [], buildArgs = []
    const timetable = { teachers: [] }
    const entry = { kind: mode, originalSlotIndex: 4, replacementSlotIndex: 9, replacementTeacher: '합성교사', originalDate: '2026-08-31', replacementDate: '2026-09-01' }
    const existing = { kind: 'change', originalSlotIndex: 1, replacementSlotIndex: 2, replacementTeacher: '다른합성교사', originalDate: '2026-08-30', replacementDate: '2026-08-30' }
    const bindings = {
      timetable, selectedSlot: 4, preview: { mode, teacherIndex: 3, partnerSlotIndex: 9 }, teacherIndex: 1,
      planDraft: { meta: { author: '', startDate: '', endDate: '' }, entries: [existing] }, config: { teacherName: '작성교사' },
      buildPlanEntry: (...args) => { buildArgs.push(args); return entry }, setPlanDraft: value => writes.push(plain(value)),
      setError: value => errors.push(value), setSuccess: () => {}, setPreview: value => resets.push(value),
    }
    executable(variable('addPreviewToPlan'), bindings)()
    assert.deepEqual(buildArgs, [[timetable, mode, 1, 4, 3, 9]])
    assert.deepEqual(writes[0].entries, [existing, entry])
    assert.equal(writes[0].meta.author, '작성교사')
    assert.deepEqual(resets, [null])
    bindings.planDraft.entries.push(entry)
    executable(variable('addPreviewToPlan'), bindings)()
    assert.equal(writes.length, 1, 'Duplicate must not be added')
    assert.equal(errors.length, 1)
  }
})

console.log(`Timetable preview placement: ${count} structural/behavioral checks passed.`)
