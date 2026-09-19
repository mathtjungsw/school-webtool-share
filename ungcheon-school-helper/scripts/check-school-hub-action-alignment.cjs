const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const electron = fs.readFileSync(path.join(root, 'electron/main/index.ts'), 'utf8')
const service = fs.readFileSync(path.join(root, 'src/services/schoolHub.ts'), 'utf8')
const server = fs.readFileSync(path.join(root, 'server/Code.gs'), 'utf8')

const required = ['getTimetableOverrides', 'saveTimetableOverride', 'deactivateTimetableOverride']
for (const action of required) {
  if (!electron.includes(`'${action}'`)) throw new Error(`Electron HUB_ACTIONS 누락: ${action}`)
  if (!service.includes(`action: '${action}'`)) throw new Error(`schoolHub 서비스 요청 누락: ${action}`)
  if (!server.includes(`action === '${action}'`)) throw new Error(`Apps Script 라우트 누락: ${action}`)
}

const readBlock = electron.match(/const HUB_READ_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
if (!readBlock.includes("'getTimetableOverrides'")) throw new Error('getTimetableOverrides 읽기 허용 목록 누락')
if (!electron.includes("code: 'LOCAL_ACTION_BLOCKED'")) throw new Error('로컬 요청 차단 오류 코드 누락')
console.log('PASS 일일시간표 예외 요청의 렌더러·Electron·Apps Script 액션 정합성')
