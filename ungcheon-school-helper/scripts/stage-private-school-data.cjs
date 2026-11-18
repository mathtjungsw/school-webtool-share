'use strict'

// Copy only the four approved data groups from a pinned Firestore snapshot.
// Operational records and all credentials stay in memory. Output is metadata only.
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const repo = 'mathtjungsw/ungcheon-school-data'
const project = 'projects/ungcheon-school-helper/databases/(default)/documents'
const school = project + '/schools/ungcheon/'
const base = 'https://firestore.googleapis.com/v1/' + project
const main = 'cf3c4093d4f060e7539fad70e630e0c7deb2b810'
const root = path.resolve(__dirname, '..')
const resources = [
  'staffMeta', 'staff', 'studentsMeta', 'students',
  'teacherTimetableMeta', 'teacherRows', 'studentTimetableMeta', 'studentRows',
]
const groups = ['staffRoster', 'studentRoster', 'timetable', 'studentTimetable']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const revision = /^[a-f0-9]{40}$/

function github(endpoint, method, payload) {
  const child = spawnSync('gh', ['api', '--method', method || 'GET', 'repos/' + repo + endpoint,
    ...(payload ? ['--input', '-'] : [])], {
    input: payload && JSON.stringify(payload),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
  })
  if (child.status !== 0) throw new Error('GitHub ' + (method || 'GET') + ' request failed')
  return JSON.parse(child.stdout)
}

function codeContext() {
  const context = vm.createContext({
    Date,
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, text) => [...Buffer.from(hash(text), 'hex')] },
  })
  for (const name of ['FirestoreRepository', 'MigrationAdmin', 'MigrationCapture',
    'MigrationReplication', 'MigrationServing', 'MigrationBackend', 'Code', 'PrivateSchoolData']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'server', name + '.gs'), 'utf8'), context, { filename: name })
  }
  return context
}

function oldSnapshotFile(relative, exported) {
  const file = 'ungcheon-school-helper/' + relative
  const previous = execFileSync('git', ['show', main + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 })
  const output = ts.transpileModule(previous + '\nexport const stagingData = ' + exported + '\n', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const exportedModule = {}
  vm.runInNewContext(output, { exports: exportedModule })
  assert.ok(Array.isArray(exportedModule.stagingData) && exportedModule.stagingData.length)
  return exportedModule.stagingData
}

async function exportSnapshot(context) {
  const credential = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8')).tokens.default
  const refreshed = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: credential.client_id, client_secret: credential.client_secret,
      refresh_token: credential.refresh_token, grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(35000),
  })
  if (!refreshed.ok) throw new Error('Google authorization could not be refreshed')
  const authorization = 'Bearer ' + (await refreshed.json()).access_token
  const request = async (suffix, data) => {
    const response = await fetch(base + suffix, {
      method: data ? 'POST' : 'GET',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: data && JSON.stringify(data),
      signal: AbortSignal.timeout(45000),
    })
    if (!response.ok) throw new Error('Firestore read failed with HTTP ' + response.status)
    return response.json()
  }
  const convert = document => {
    assert.ok(document?.name?.startsWith(school))
    return { path: document.name.slice(school.length), data: context.migrationDecode_({ mapValue: { fields: document.fields } }) }
  }
  const collection = '/schools/ungcheon/primaryEpochs'
  const candidates = await request(collection + '?pageSize=100&mask.fieldPaths=phase&mask.fieldPaths=sourceOfTruth')
  assert.ok(!candidates.nextPageToken)
  const selected = candidates.documents
    .filter(doc => doc.fields.phase.stringValue === 'PRIMARY' && doc.fields.sourceOfTruth.stringValue === 'FIRESTORE')
  assert.equal(selected.length, 1)
  const identity = selected[0].name.split('/').at(-1)
  assert.match(identity, /^[a-f0-9]{64}$/)
  const getRoot = async () => convert(await request(collection + '/' + identity)).data
  const current = await getRoot()
  assert.equal(current.phase, 'PRIMARY')
  const heads = current.resources.filter(head => resources.includes(head.resource))
  assert.equal(heads.length, resources.length)
  assert.ok(heads.every(head => /^[a-f0-9]{64}$/.test(head.digest)))
  const snapshot = new Map()
  async function batchGet(paths) {
    for (let start = 0; start < paths.length; start += 40) {
      const page = paths.slice(start, start + 40)
      const response = await request(':batchGet', { documents: page.map(name => school + name) })
      assert.ok(Array.isArray(response) && response.length === page.length)
      for (const item of response) {
        const doc = convert(item.found)
        assert.ok(page.includes(doc.path))
        snapshot.set(doc.path, doc)
      }
    }
  }
  const manifests = heads.map(head => 'servingResources/' + head.digest)
  await batchGet(manifests)
  const chunks = [...new Set(manifests.flatMap(name => {
    const refs = snapshot.get(name).data.chunkRefs
    assert.ok(Array.isArray(refs) && refs.every(ref => /^[a-f0-9]{64}$/.test(ref)))
    return refs.map(ref => 'servingChunks/' + ref)
  }))]
  await batchGet(chunks)
  const reader = { resource: name => {
    const head = heads.find(item => item.resource === name)
    assert.ok(head, 'Only approved resource groups may be read')
    return context.migrationReadServingResource_({
      get: name => snapshot.get(name),
      batchGet: names => names.map(name => snapshot.get(name)),
    }, head)
  } }
  const sourceBook = context.migrationSnapshotBook_(reader, 'restricted-export', false).book
  context.migrationSourceBook_ = () => sourceBook
  const data = Object.fromEntries(groups.map(group => {
    const method = 'get' + group[0].toUpperCase() + group.slice(1) + '_'
    return [group, context[method]()]
  }))
  const counts = {
    staffRoster: data.staffRoster?.members.length, studentRoster: data.studentRoster?.students.length,
    timetable: data.timetable?.teachers.length, studentTimetable: data.studentTimetable?.students.length,
  }
  assert.ok(Object.values(counts).every(count => Number.isSafeInteger(count) && count > 0))
  data.timetable.pulledLessons = oldSnapshotFile('src/data/pulledLessons2026.ts', 'PULLED_LESSONS_2026')
  data.studentTimetable.helpClassSchedules = oldSnapshotFile('src/services/helpClassSchedule.ts', 'HELP_CLASS_SCHEDULES')
  Object.values(data).forEach(value => context.privateSchoolValidateInput_({ timetable: value }))

  const unchanged = async () => {
    const latest = await getRoot()
    const active = new Map(latest.resources.map(item => [item.resource, item.digest]))
    if (latest.phase !== 'PRIMARY' || heads.some(item => active.get(item.resource) !== item.digest)) {
      throw new Error('Operating timetable or roster changed during staging. Capture again before activation.')
    }
  }
  await unchanged()
  return { data, counts, sourceRevision: current.revision, unchanged }
}

const assertPrivate = value => {
  assert.ok(value.full_name === repo && value.private === true && value.visibility === 'private',
    'Only the verified private destination is permitted')
}
function readStaged(group, commit) {
  const file = github('/contents/school/' + group + '.json?ref=' + commit)
  const payload = file.encoding === 'base64' ? file : github('/git/blobs/' + file.sha)
  assert.equal(payload.encoding, 'base64')
  return Buffer.from(payload.content, 'base64')
}
async function mainTask() {
  const metadata = github('')
  assertPrivate(metadata)
  if (!['--verify-source', '--stage', '--verify-staged'].includes(process.argv[2])) {
    throw new Error('Specify --verify-source, --stage, or --verify-staged')
  }
  const snapshot = await exportSnapshot(codeContext())
  console.log('Verified Firestore snapshots', JSON.stringify({
    revision: snapshot.sourceRevision, groups: snapshot.counts,
    pulledLessons: snapshot.data.timetable.pulledLessons.length,
    helpClassSchedules: snapshot.data.studentTimetable.helpClassSchedules.length,
  }))
  if (process.argv[2] === '--verify-source') return
  assert.match(metadata.default_branch, /^[\w.-]+$/)
  const branch = metadata.default_branch
  const contents = Object.fromEntries(groups.map(group => [group, Buffer.from(JSON.stringify(snapshot.data[group]))]))
  if (process.argv[2] === '--stage') {
    if (metadata.size === 0 && github('/branches').length === 0) {
      github('/contents/README.md', 'PUT', { message: 'Initialize private school data repository',
        content: Buffer.from('# 웅천고 업무도우미 운영 자료\n\n업무도우미 서버 전용 비공개 저장소입니다.\n', 'utf8').toString('base64') })
    }
    assertPrivate(github(''))
    const parent = github('/git/ref/heads/' + branch).object.sha
    assert.match(parent, revision)
    const baseTree = github('/git/commits/' + parent).tree.sha
    const tree = groups.map(group => {
      const blob = github('/git/blobs', 'POST', { content: contents[group].toString('base64'), encoding: 'base64' })
      assert.match(blob.sha, revision)
      return { path: 'school/' + group + '.json', mode: '100644', type: 'blob', sha: blob.sha }
    })
    const prepared = github('/git/trees', 'POST', { base_tree: baseTree, tree })
    const commit = github('/git/commits', 'POST', {
      message: 'Stage verified school data', tree: prepared.sha, parents: [parent],
    }).sha
    assert.match(commit, revision)
    for (const group of groups) assert.equal(hash(readStaged(group, commit)), hash(contents[group]), group + ' readback mismatch')
    await snapshot.unchanged()
    assertPrivate(github(''))
    assert.equal(github('/git/ref/heads/' + branch).object.sha, parent, 'Private branch advanced')
    const confirmed = github('/git/refs/heads/' + branch, 'PATCH', { sha: commit, force: false })
    assert.equal(confirmed.object.sha, commit)
  }
  const commit = github('/git/ref/heads/' + branch).object.sha
  for (const group of groups) assert.equal(hash(readStaged(group, commit)), hash(contents[group]), group + ' active readback mismatch')
  await snapshot.unchanged()
  console.log('Verified private GitHub readback', commit)
}

mainTask().catch(error => {
  // Do not print remote bodies or assertion operands.
  console.error(error.name === 'AssertionError' ? 'Private staging invariant failed at ' +
    (error.stack.split('\n').find(line => line.includes('stage-private-school-data.cjs'))?.trim() || 'validation') : error.message)
  process.exitCode = 1
})
