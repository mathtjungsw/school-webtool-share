const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const feature = read('src/features/futureOperations/feature.ts')
const page = read('src/features/futureOperations/FutureOperationsPage.tsx')
const layout = read('src/components/Layout.tsx')
const publicMenuSources = [
  'src/components/Sidebar.tsx',
  'src/config/navigationRegistry.ts',
  'src/services/workAssistantSearch.ts',
].map(read).join('\n')

if (!/FEATURE_FUTURE_OPERATIONS\s*=\s*false/.test(feature)) {
  throw new Error('숨김 운영 기능 플래그가 false가 아닙니다.')
}
if (!/visible:\s*FEATURE_FUTURE_OPERATIONS/.test(feature)) {
  throw new Error('숨김 운영 메뉴가 기능 플래그를 따르지 않습니다.')
}

const expectedTabs = ['notifications', 'reservations', 'density', 'collections', 'duties', 'handover']
const missingTabs = expectedTabs.filter(id => !new RegExp(`id:\\s*'${id}'`).test(page))
if (missingTabs.length) {
  throw new Error(`숨김 운영 기능이 누락되었습니다: ${missingTabs.join(', ')}`)
}

if (/future_operations|future-operations|FutureOperationsPage|FUTURE_OPERATIONS_MENU/.test(publicMenuSources)) {
  throw new Error('숨김 운영 기능이 공개 메뉴·검색에 연결되어 있습니다.')
}
if (!layout.includes("import('../features/futureOperations/FutureOperationsPage')") || !layout.includes('future_operations: FutureOperationsPage')) {
  throw new Error('숨김 운영 기능이 시험판 번들에 포함되지 않았습니다.')
}

console.log(`PASS 숨김 운영 기능 ${expectedTabs.length}종 번들 포함·공개 메뉴 미노출`)
