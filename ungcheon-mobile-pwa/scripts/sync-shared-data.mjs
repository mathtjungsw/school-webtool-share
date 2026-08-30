import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = path.resolve(root, '../ungcheon-school-helper')
const output = path.join(root, 'src/shared')
const manifestPath = path.join(output, 'source-manifest.json')
const files = [
  ['src/data/pulledLessons2026.ts', 'pulledLessons2026.ts'],
  ['src/services/ungcheonSchedule.ts', 'ungcheonSchedule.ts'],
]
// Git uses LF in its source repository while Windows checkouts may use CRLF.
// Validate content, not checkout-specific newline bytes, on both build hosts.
const sha256 = content => crypto.createHash('sha256').update(content.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
const hasDesktop = fs.existsSync(path.join(desktop, 'package.json'))
if (process.argv.includes('--write')) {
  if (!hasDesktop) throw new Error('최신 데스크톱 소스가 있는 통합 저장소에서만 동기화할 수 있습니다.')
  fs.mkdirSync(output, { recursive: true })
  const manifest = { desktopVersion: JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8')).version, files: {} }
  for (const [source, target] of files) {
    const content = fs.readFileSync(path.join(desktop, source))
    fs.writeFileSync(path.join(output, target), content)
    manifest.files[target] = { source, sha256: sha256(content) }
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
for (const [source, target] of files) {
  const content = fs.readFileSync(path.join(output, target))
  if (sha256(content) !== manifest.files[target]?.sha256) throw new Error(`공유 자료 무결성 불일치: ${target}`)
  if (hasDesktop && sha256(content) !== sha256(fs.readFileSync(path.join(desktop, source)))) throw new Error(`최신 데스크톱 자료와 불일치: ${target}. npm run sync:shared를 실행하세요.`)
}
console.log(`Shared timetable data verified (desktop ${manifest.desktopVersion}; ${files.length} allowed modules).`)
