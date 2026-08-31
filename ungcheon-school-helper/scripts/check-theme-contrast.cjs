const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(projectRoot, 'src/styles/globals.css'), 'utf8')
const MIN_RATIO = 4.5

function extractBlock(selector, from = 0) {
  const start = css.indexOf(selector, from)
  if (start < 0) throw new Error(`CSS 선택자를 찾지 못했습니다: ${selector}`)
  const open = css.indexOf('{', start + selector.length)
  if (open < 0) throw new Error(`CSS 블록을 찾지 못했습니다: ${selector}`)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error(`CSS 블록이 닫히지 않았습니다: ${selector}`)
}

function variables(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)]
      .map(match => [match[1], match[2].toLowerCase()]),
  )
}

function parseHex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match) throw new Error(`6자리 HEX 색상이 필요합니다: ${value}`)
  return [0, 2, 4].map(offset => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255)
}

function luminance(value) {
  const channels = parseHex(value).map(channel => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground, background) {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const baseTokens = variables(extractBlock(':root'))
const lightVariableOffset = css.indexOf('[data-theme="light"] {')
const lightTokens = { ...baseTokens, ...variables(extractBlock('[data-theme="light"]', lightVariableOffset)) }
const failures = []
const results = []

function assertContrast(label, foreground, background, minimum = MIN_RATIO) {
  const ratio = contrast(foreground, background)
  results.push({ label, foreground, background, ratio })
  if (ratio + Number.EPSILON < minimum) {
    failures.push(`${label}: ${foreground} / ${background} = ${ratio.toFixed(2)}:1 (최소 ${minimum}:1)`)
  }
}

for (const surface of ['surface-800', 'surface-900', 'surface-950']) {
  for (const text of ['text-primary', 'text-secondary', 'surface-50']) {
    if (!lightTokens[text] || !lightTokens[surface]) throw new Error(`밝은 모드 토큰이 없습니다: ${text}/${surface}`)
    assertContrast(`light ${text} on ${surface}`, lightTokens[text], lightTokens[surface])
  }
}
assertContrast('기본 버튼 --ink on --brand', lightTokens.ink, lightTokens.brand)

function ruleColor(fragment) {
  const start = css.indexOf(fragment)
  if (start < 0) throw new Error(`전역 대비 규칙을 찾지 못했습니다: ${fragment}`)
  const open = css.indexOf('{', start + fragment.length)
  const close = css.indexOf('}', open + 1)
  const match = css.slice(open + 1, close).match(/\bcolor\s*:\s*(#[0-9a-fA-F]{6})/)
  if (!match) throw new Error(`전역 대비 규칙에 HEX 글자색이 없습니다: ${fragment}`)
  return match[1].toLowerCase()
}

const globalFamilies = [
  ['text-slate-', 'neutral'],
  ['text-cyan-', 'blue'],
  ['text-violet-', 'violet'],
  ['text-emerald-', 'green'],
  ['text-amber-', 'amber'],
  ['text-rose-', 'rose'],
  ['text-white', 'white/black'],
]

for (const [classFragment, label] of globalFamilies) {
  const foreground = ruleColor(`[data-theme="light"] [class*="${classFragment}"]`)
  for (const surface of ['surface-800', 'surface-900', 'surface-950']) {
    assertContrast(`light 전역 ${label} text on ${surface}`, foreground, lightTokens[surface])
  }
}

const widgetCss = fs.readFileSync(path.join(projectRoot, 'src/components/widget/widgetTimedSchedule.css'), 'utf8')
for (const tone of ['violet', 'teal', 'amber', 'blue']) {
  const block = widgetCss.match(new RegExp(`\\.wts-${tone}\\{([^}]+)\\}`))?.[1]
  const foreground = block?.match(/--wts-text:\s*(#[0-9a-fA-F]{6})/)?.[1]
  const background = block?.match(/--wts-soft:\s*(#[0-9a-fA-F]{6})/)?.[1]
  if (!foreground || !background) throw new Error(`위젯 일정 색상 토큰이 없습니다: ${tone}`)
  assertContrast(`widget ${tone} range label`, foreground, background)
  assertContrast(`widget ${tone} point label`, foreground, '#fffdf5')
}

if (failures.length) {
  console.error(`FAIL 테마 글자 대비 ${failures.length}건`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

const lowest = results.reduce((current, item) => item.ratio < current.ratio ? item : current)
console.log(`PASS 밝은 모드 WCAG AA 글자 대비 ${results.length}개 조합`)
console.log(`PASS 최저 대비 ${lowest.ratio.toFixed(2)}:1 (${lowest.label})`)
