const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const helperPath = path.join(root, 'electron', 'main', 'schoolinfo-achievement.ts')
const datasetPath = path.join(root, 'resources', 'curriculum', 'achievement-standard-subject-prefixes.json')

const compiled = ts.transpileModule(fs.readFileSync(helperPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: helperPath,
}).outputText
const helperModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(require, helperModule, helperModule.exports)

const {
  findAchievementStandardRecord,
  findAchievementStandardCodes,
  hasAchievementStandardCode,
} = helperModule.exports
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'))

const record = (name, grade) => {
  const found = findAchievementStandardRecord(dataset, name, grade)
  assert.ok(found, `${grade}학년 ${name} 코드 매핑이 없습니다.`)
  return found
}

const art = record('미술', 1)
const information = record('정보', 2)
const geometry = record('기하', 2)
const literature = record('문학', 2)

// 대괄호 유무, 코드 중간 줄바꿈/HTML 줄바꿈, 전각 문자와 유니코드 하이픈을 허용한다.
for (const sample of [
  '[12미01-01]',
  '성취기준 12미01-01 내용',
  '［12미01－01］',
  '12\n미01—01',
  '12<br>미01‑01',
]) assert.equal(hasAchievementStandardCode(sample, art), true, `미술 긍정 예시 실패: ${sample}`)

assert.equal(hasAchievementStandardCode('[12\n문학04-01]', literature), true)
assert.equal(hasAchievementStandardCode('12<br />문학04–01', literature), true)
assert.deepEqual(
  findAchievementStandardCodes('[12문학04-01] / 12\n문학04—01 / [12문학05-02]', literature),
  ['12문학04-01', '12문학05-02'],
  '발견 코드는 정규화하고 중복 제거해야 합니다.',
)
assert.equal(hasAchievementStandardCode('[12기하99-99]', geometry), true, '뒤 영역·기준 번호는 식별에 사용하지 않아야 합니다.')

// 접두부가 더 긴 다른 과목, 일반 문장, 불완전 코드는 절대 일치시키지 않는다.
for (const sample of [
  '[12미영01-01]',
  '[12미적Ⅰ01-01]',
  '미술의 기하학적 구도를 평가한다.',
  '112미01-01',
  '[12미A1-01]',
  '[12미01]',
]) assert.equal(hasAchievementStandardCode(sample, art), false, `미술 충돌 예시 오탐: ${sample}`)

for (const sample of ['[12정치01-01]', '[12정보01-01]', '정치 정보를 분석한다.']) {
  assert.equal(hasAchievementStandardCode(sample, information), false, `정보 충돌 예시 오탐: ${sample}`)
}

// 동일 과목명이 두 교육과정에 있으면 현재 학년의 교육과정으로 선택한다.
assert.equal(record('확률과 통계', 2).curriculumRevision, '2022')
assert.equal(record('확률과 통계', 3).curriculumRevision, '2015')
assert.equal(findAchievementStandardRecord(dataset, '프로그래밍', 3).status, 'no-coded-standards-in-source')
assert.equal(hasAchievementStandardCode('[12정보04-01]', record('프로그래밍', 3)), false)

// 공식 예시 코드 전체와 접두부 포함 관계가 있는 모든 과목 쌍을 회귀 검사한다.
const verified = dataset.records.filter((item) => item.status === 'verified')
for (const item of verified) {
  for (const code of item.exampleCodes ?? []) {
    assert.equal(hasAchievementStandardCode(`[${code}]`, item), true, `${item.officialSubjectName} 예시 코드 불일치: ${code}`)
  }
}

let collisionChecks = 0
for (const shorter of verified) {
  for (const longer of verified) {
    if (shorter === longer || !shorter.codePrefix || !longer.codePrefix) continue
    const shortPrefix = shorter.codePrefix.normalize('NFKC')
    const longPrefix = longer.codePrefix.normalize('NFKC')
    if (!longPrefix.startsWith(shortPrefix) || longPrefix === shortPrefix) continue
    const longerExample = longer.exampleCodes?.[0]
    if (!longerExample) continue
    collisionChecks += 1
    assert.equal(
      hasAchievementStandardCode(`[${longerExample}]`, shorter),
      false,
      `${shorter.officialSubjectName}(${shorter.codePrefix})가 ${longer.officialSubjectName}(${longer.codePrefix}) 코드를 오탐했습니다.`,
    )
  }
}

console.log(JSON.stringify({
  ok: true,
  verifiedRecords: verified.length,
  exampleCodesChecked: verified.reduce((sum, item) => sum + (item.exampleCodes?.length ?? 0), 0),
  prefixCollisionChecks: collisionChecks,
}, null, 2))
