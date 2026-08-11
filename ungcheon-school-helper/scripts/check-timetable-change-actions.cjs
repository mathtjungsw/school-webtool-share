const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const serviceSource = fs.readFileSync(path.join(projectRoot, 'src/services/timetableChanges.ts'), 'utf8')
const electronSource = fs.readFileSync(path.join(projectRoot, 'electron/main/index.ts'), 'utf8')
const serverSource = fs.readFileSync(path.join(projectRoot, 'server/Code.gs'), 'utf8')

const actions = [...serviceSource.matchAll(/action:\s*'([^']+)'/g)].map(match => match[1])
const missingFromElectron = actions.filter(action => !electronSource.includes(`'${action}'`))
const missingFromServer = actions.filter(action => !serverSource.includes(`action === '${action}'`))

if (missingFromElectron.length || missingFromServer.length) {
  if (missingFromElectron.length) console.error(`Electron 허용 목록 누락: ${missingFromElectron.join(', ')}`)
  if (missingFromServer.length) console.error(`Apps Script 처리 목록 누락: ${missingFromServer.join(', ')}`)
  process.exit(1)
}

console.log(`PASS 교환·대강 공유 요청 허용 목록 일치 (${actions.length}개 작업)`)
