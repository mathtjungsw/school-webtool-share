const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'electron/main/widgetGeometry.ts'), 'utf8')
const moduleResult = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: moduleResult.exports, module: moduleResult })
const { fitWidgetBounds } = moduleResult.exports
let passed = 0
function test(label, fn) { fn(); passed++; console.log(`PASS ${label}`) }
function inside(bounds, area) {
  assert.ok(bounds.width > 0 && bounds.height > 0)
  assert.ok(bounds.x >= area.x && bounds.y >= area.y)
  assert.ok(bounds.x + bounds.width <= area.x + area.width)
  assert.ok(bounds.y + bounds.height <= area.y + area.height)
}
for (const scale of [1, 1.25, 1.5, 2]) {
  test(`logical work area at ${scale * 100}% scaling clips long content and moves lower-edge window`, () => {
    const area = { x: 0, y: 0, width: Math.floor(1920 / scale), height: Math.floor(1040 / scale) }
    const current = { x: area.width - 390, y: area.height - 100, width: 390, height: 100 }
    const bounds = fitWidgetBounds(current, area, 1600)
    inside(bounds, area)
    assert.equal(bounds.height, area.height - 24)
    assert.equal(bounds.y, 12)
    assert.equal(bounds.width, 390)
  })
}
test('short content keeps natural height instead of filling screen', () => {
  const bounds = fitWidgetBounds({x: 500,y: 100,width:390,height:600}, {x:0,y:0,width:1920,height:1040}, 227.2)
  assert.equal(bounds.height, 228); assert.equal(bounds.y, 100)
})
test('negative-coordinate secondary monitor and migration to smaller monitor', () => {
  const secondary = { x: -1280,y: -120,width:1280,height:720 }
  const bounds = fitWidgetBounds({x:-900,y:500,width:390,height:600}, secondary, 900)
  inside(bounds, secondary); assert.equal(bounds.height, 696)
  inside(fitWidgetBounds(bounds, {x:0,y:0,width:960,height:520},900), {x:0,y:0,width:960,height:520})
})
test('side taskbar inset, tiny work area and invalid requested heights stay inside', () => {
  for (const area of [{x:80,y:40,width:1200,height:680},{x:0,y:0,width:320,height:160}]) {
    for (const height of [NaN, Infinity, -1, 0, 84, 10000]) inside(fitWidgetBounds({x:1600,y:1000,width:390,height:600},area,height),area)
  }
})
test('repeated fit is idempotent and returns to natural height after content shrink', () => {
  const area = {x:0,y:0,width:1366,height:728}
  const first=fitWidgetBounds({x:950,y:600,width:390,height:600},area,1200)
  assert.deepEqual(fitWidgetBounds(first,area,1200),first)
  assert.equal(fitWidgetBounds(first,area,125).height,125)
})
test('pin and opacity updates do not reset native height; display changes trigger fitting', () => {
  const main=fs.readFileSync(path.join(root,'electron/main/index.ts'),'utf8')
  const block=main.slice(main.indexOf("ipcMain.handle('widget:updateSettings'"),main.indexOf("ipcMain.handle('widget:fitHeight'"))
  assert.doesNotMatch(block,/\.setSize\(/)
  assert.match(block,/fitWidgetWindow\(widgetSize\(next.expanded, next.preset\).width\)/)
  for (const event of ['display-added','display-removed','display-metrics-changed']) assert.ok(main.includes(`screen.on('${event}', refitOnDisplayChange)`))
})
test('CSS keeps native viewport scroll body and footer isolated from main-app roots', () => {
  const compact=fs.readFileSync(path.join(root,'src/components/widget/widgetCompact.css'),'utf8')
  const base=fs.readFileSync(path.join(root,'src/components/widget/widget.css'),'utf8')
  assert.match(compact,/\.widget-shell\s*\{\s*height: 100vh;/)
  assert.doesNotMatch(compact,/\.widget-shell main\s*\{\s*overflow: visible/)
  assert.match(compact,/\.widget-shell > \.widget-actions\s*\{\s*flex: 0 0 auto;/)
  for (const css of [base,compact]) { assert.ok(css.includes('html[data-widget-window="true"]')); assert.doesNotMatch(css,/(?:^|\n)html,\s*\nbody,/); }
})
console.log(`Widget geometry: ${passed} checks passed.`)
