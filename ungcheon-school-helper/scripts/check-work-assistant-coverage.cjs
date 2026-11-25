const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const registrySource = fs.readFileSync(path.join(projectRoot, 'src/config/navigationRegistry.ts'), 'utf8')
const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/Sidebar.tsx'), 'utf8')
const assistantSource = fs.readFileSync(path.join(projectRoot, 'src/services/workAssistantSearch.ts'), 'utf8')

const registryStart = registrySource.indexOf('export const NAVIGATION_ITEMS')
const registryEnd = registrySource.indexOf('\nexport const NAVIGATION_BY_ID')
if (registryStart < 0 || registryEnd < 0 || registryEnd <= registryStart) {
  throw new Error('navigationRegistry.ts의 NAVIGATION_ITEMS 목록을 찾지 못했습니다.')
}

const navigationSource = registrySource.slice(registryStart, registryEnd)
const navigationIds = [...navigationSource.matchAll(/\bid:\s*'([^']+)'/g)].map(match => match[1])
const navigationLabels = [...navigationSource.matchAll(/\blabel:\s*'([^']+)'/g)].map(match => match[1])
const duplicates = navigationIds.filter((id, index) => navigationIds.indexOf(id) !== index)

if (!navigationIds.length || navigationIds.length !== navigationLabels.length) {
  throw new Error('메뉴 id와 label 파싱 결과가 일치하지 않습니다.')
}
if (duplicates.length) {
  throw new Error(`중복된 메뉴 id가 있습니다: ${[...new Set(duplicates)].join(', ')}`)
}

if (!sidebarSource.includes("from '../config/navigationRegistry'") || !sidebarSource.includes('NAVIGATION_BY_ID')) {
  throw new Error('Sidebar.tsx가 공통 메뉴 레지스트리를 사용하지 않습니다.')
}
if (!assistantSource.includes("from '../config/navigationRegistry'") || !assistantSource.includes('.filter(item => !detailedPages.has(item.id))')) {
  throw new Error('업무 도우미가 공통 메뉴 레지스트리의 자동 기본 안내를 생성하지 않습니다.')
}

const knownPages = new Set(navigationIds)
const detailedPages = [...assistantSource.matchAll(/\bpage:\s*'([^']+)'/g)].map(match => match[1])
const unknownPages = [...new Set(detailedPages)].filter(page => !knownPages.has(page))
if (unknownPages.length) {
  throw new Error(`업무 도우미 전문 안내가 없는 메뉴를 가리킵니다: ${unknownPages.join(', ')}`)
}

console.log(`PASS 사이드바·검색도우미 공통 메뉴 레지스트리 (${navigationIds.length}개 메뉴)`)
console.log(`PASS 기존 전문 안내 ${detailedPages.length}개 유지 + 새 메뉴 자동 기본 안내`)

const settingsSource = fs.readFileSync(path.join(projectRoot, 'src/pages/UngcheonSettingsPage.tsx'), 'utf8')
const mobileUrl = 'https://ungcheon-school-helper-mobile.web.app/'
const githubEntry = fs.readFileSync(path.join(projectRoot, '../mobile/index.html'), 'utf8')
if (!githubEntry.includes('url=' + mobileUrl) || !githubEntry.includes('href="' + mobileUrl + '"')) {
  throw new Error('GitHub 안내 주소가 공식 모바일 일정으로 연결되어야 합니다.')
}
if (!settingsSource.includes(`const MOBILE_SCHEDULE_URL = '${mobileUrl}'`) || !settingsSource.includes('openExternal(MOBILE_SCHEDULE_URL)')) {
  throw new Error('환경설정의 모바일 일정 연결이 공식 고정 주소를 사용하지 않습니다.')
}
const mobileEntry = assistantSource.match(/id: 'mobile-schedule-pwa'[\s\S]*?\n  },/)?.[0] ?? ''
for (const required of ["page: 'settings'", mobileUrl, '공통 비밀번호', '72시간', '읽기 전용', '홈 화면에 추가', '개인 일정·개인 업무']) {
  if (!mobileEntry.includes(required)) throw new Error(`모바일 일정 검색 안내가 누락되었습니다: ${required}`)
}
console.log('PASS 모바일 일정 공식 주소·환경설정 검색 경로·로그인 및 설치 안내')

function loadTs(source, imports) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, key => imports[key])
  return exports
}

const registry = loadTs(registrySource, { 'lucide-react': require('lucide-react') })
const preferences = loadTs(fs.readFileSync(path.join(projectRoot, 'src/services/navigationPreferences.ts'), 'utf8'), {
  '../config/navigationRegistry': registry,
})
const { restoreShortcuts, availableMenus } = preferences
assert.deepEqual(
  restoreShortcuts(undefined, ['staff_tasks', 'calendar', 'calendar', 'old-menu'], ['attendance_print', 'calendar', 'executive_live_classes'], ['calendar', 'staff_tasks']),
  ['calendar', 'staff_tasks', 'attendance_print'],
)
assert.deepEqual(restoreShortcuts([], ['calendar'], ['staff_tasks'], []), [], 'A deliberately empty saved list stays empty')
assert.equal(restoreShortcuts(undefined, undefined, undefined, undefined).length, 5)
assert.deepEqual(restoreShortcuts(undefined, [], [], []), [])
const ordinary = availableMenus([], ['gyeongnam_curriculum'], [], false, false).map(item => item.id)
for (const id of ['gyeongnam_curriculum', 'admin_center', 'executive_live_classes', 'feature_overview', 'file_parser']) {
  assert.ok(!ordinary.includes(id), 'Unexpected ordinary menu: ' + id)
}
const admin = availableMenus([], [], ['file_parser'], true, true).map(item => item.id)
for (const id of ['gyeongnam_curriculum', 'admin_center', 'executive_live_classes', 'file_parser']) assert.ok(admin.includes(id))
for (const item of registry.NAVIGATION_ITEMS) {
  assert.ok(item.description.trim())
  assert.ok(fs.existsSync(path.join(projectRoot, 'src/assets/function-previews', item.preview + '.webp')))
}
console.log('PASS 기존 고정·즐겨찾기 순서 통합, 숨김·권한 보존과 기능별 설명·그림 연결')
