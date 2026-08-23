const fs = require('node:fs')
const path = require('node:path')

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

if (!sidebarSource.includes("from '../config/navigationRegistry'") || !sidebarSource.includes('NAVIGATION_ITEMS')) {
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
