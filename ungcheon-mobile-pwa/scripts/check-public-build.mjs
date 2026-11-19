import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const project = fileURLToPath(new URL('../', import.meta.url))
const directory = path.resolve(project, process.argv[2] || 'dist-hosting')
assert.ok(!existsSync(path.join(project, 'src/shared/pulledLessons2026.ts')), '공개 화면에 학교 당김수업을 내장할 수 없습니다.')

let scripts = 0
let usesSchoolApi = false
async function inspect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) { await inspect(file); continue }
    assert.ok(!/\.(?:xlsx?|csv|tsv|sqlite|db|bin|map)$/i.test(item.name), '공개 빌드에 허용되지 않은 데이터 파일이 있습니다.')
    if (/\.pdf$/i.test(item.name)) assert.equal(item.name, 'ungcheon-mobile-install-guide.pdf')
    if (!/\.(?:js|mjs|json|html)$/i.test(item.name)) continue
    const content = await readFile(file, 'utf8')
    // Runtime field names are expected. Populated school timetable records may never be shipped.
    for (const [row] of content.matchAll(/\{[^{}]{0,2400}(?:originalSlot|originalTeacherName)[^{}]{0,2400}\}/g)) {
      assert.ok(!/["']?teacherName["']?\s*:\s*["'][^"']+["']/.test(row), '공개 빌드에 교사별 수업 레코드가 있습니다.')
    }
    if (/\.m?js$/.test(item.name)) {
      scripts++
      usesSchoolApi ||= content.includes('script.google.com/macros/s/') && content.includes('verifyMobileViewer')
    }
  }
}
await inspect(directory)
assert.ok(scripts && usesSchoolApi, '운영 인증 API를 사용하는 모바일 화면이 필요합니다.')
console.log('PASS public mobile build: authenticated service, no static school workbooks or timetable records.')
