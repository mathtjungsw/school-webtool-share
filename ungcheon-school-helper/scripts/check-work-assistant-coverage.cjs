const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/Sidebar.tsx'), 'utf8')
const assistantSource = fs.readFileSync(path.join(projectRoot, 'src/services/workAssistantSearch.ts'), 'utf8')

const navStart = sidebarSource.indexOf('const NAV:')
const navEnd = sidebarSource.indexOf('\nexport default function Sidebar')
if (navStart < 0 || navEnd < 0 || navEnd <= navStart) {
  throw new Error('Sidebar.tsx의 NAV 목록을 찾지 못했습니다.')
}

const navSource = sidebarSource.slice(navStart, navEnd)
const navPages = [...navSource.matchAll(/\bid:\s*'([^']+)'/g)].map(match => match[1])
const assistantPages = new Set(
  [...assistantSource.matchAll(/\bpage:\s*'([^']+)'/g)].map(match => match[1]),
)
const missingPages = [...new Set(navPages)].filter(page => !assistantPages.has(page))

if (missingPages.length > 0) {
  console.error('검색 도우미에 등록되지 않은 사이드바 메뉴가 있습니다:')
  for (const page of missingPages) console.error(`- ${page}`)
  console.error('src/services/workAssistantSearch.ts에 해당 메뉴의 안내를 추가해 주세요.')
  process.exit(1)
}

console.log(`PASS 검색 도우미 메뉴 누락 없음 (${new Set(navPages).size}개 메뉴)`)
