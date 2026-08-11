const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const serviceSource = fs.readFileSync(path.join(projectRoot, 'src/services/timetableChanges.ts'), 'utf8')
const electronSource = fs.readFileSync(path.join(projectRoot, 'electron/main/index.ts'), 'utf8')
const serverSource = fs.readFileSync(path.join(projectRoot, 'server/Code.gs'), 'utf8')

const actions = [...serviceSource.matchAll(/action:\s*'([^']+)'/g)].map(match => match[1])
const electronAllowlistMatch = electronSource.match(/const HUB_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)
if (!electronAllowlistMatch) {
  console.error('Electron HUB_ACTIONS allowlist was not found.')
  process.exit(1)
}

const electronActions = new Set(
  [...electronAllowlistMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]),
)
const missingFromElectron = actions.filter(action => !electronActions.has(action))
const missingFromServer = actions.filter(action => !serverSource.includes(`action === '${action}'`))

if (missingFromElectron.length || missingFromServer.length) {
  if (missingFromElectron.length) console.error(`Electron HUB_ACTIONS missing: ${missingFromElectron.join(', ')}`)
  if (missingFromServer.length) console.error(`Apps Script handlers missing: ${missingFromServer.join(', ')}`)
  process.exit(1)
}

console.log(`PASS timetable change action allowlists match (${actions.length} actions)`)
