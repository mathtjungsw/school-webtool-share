'use strict'

// Read-only source checks. Never execute a server entry point or print source,
// ScriptProperties, credentials, or an authenticated API response.
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')

// Exact canonical definitions reviewed for the v1.1.30 desktop/server release.
// A later edit to one of these functions/constants must update this digest in a
// separately reviewed release instead of silently bypassing main comparison.
const APPROVED_RELEASE_FUNCTIONS = new Map([
  ['ensureSheets_', '316f5d604f04003c725880c3768930d9013c13e4f2804c6b76b6407e3d9fcf6b'],
  ['ensureStaffChecklistSheets_', 'a186550b6777846752f147c6f0d1a2f8204f0c3e9d6b0da8b9c69cfab6bff791'],
  ['listStaffChecklists_', 'd2855ab95e4b83a4ee6fc1715546fb7d2f97f742c51731997c31f6a30003ed16'],
  ['addStaffChecklist_', 'f372dd8644b8ef5b11566998de3b74d61af46e0d540d9bb970b752971986d15b'],
  ['updateStaffChecklist_', '7413f20056161178c4544e7fc65effcbbf79e0c0f8e076c2dd0d7cf3b0316234'],
  ['migrateStaffName1_1_30_', '88d49fc9ec576eaba90238b85c25d6beb242561cd39acad0bad4bdd22bed05c6'],
])
const APPROVED_RELEASE_CONSTANTS = new Map([
  ['STAFF_NAME_MIGRATION_1_1_30_KEY', 'f12ca58e4a42dbe9223711be35c2062c4efbf37b1f65e52526c1de94fccbbbb9'],
  ['STAFF_ASSIGNMENTS_2026', 'de5d7c481216a980c3215a6b2f17bb5aeaa6d12fd112afac2ef19238fef91850'],
])
function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex') }
function isApprovedReleaseDefinition(info, name, kind) {
  const approved = kind === 'function' ? APPROVED_RELEASE_FUNCTIONS : APPROVED_RELEASE_CONSTANTS
  const definitions = kind === 'function' ? info.functionDefinitions : info.constantDefinitions
  return approved.get(name) === sha256(definitions.get(name))
}

function blocked(message) { throw new Error(`Deployment blocked: ${message}`) }
const sourcePrinter = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })
function canonicalNode(node, ast) { return sourcePrinter.printNode(ts.EmitHint.Unspecified, node, ast).trim() }
// Integration changes may add mobile helpers, revise routing, and merge notices.
// Everything else must preserve the desktop definition approved in origin/main.
function isIntegrationFunction(name) { return name.startsWith('mobile') || ['doGet', 'doPost', 'getMobileScheduleBundle_'].includes(name) }
function isIntegrationConstant(name) { return name.startsWith('MOBILE_') || name === 'RELEASE_NOTES' }
function literal(node) {
  if (!node) return undefined
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) blocked('non-literal release notice')
    return [property.name.text, literal(property.initializer)]
  }))
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
    const values = literal(node.expression.expression)
    if (Array.isArray(values)) return values.join(literal(node.arguments[0]))
  }
  return undefined
}
function inspectSource(source, label) {
  if (typeof source !== 'string' || !source.trim()) blocked(`${label}: Code.gs missing`)
  try { new vm.Script(source, { filename: 'Code.gs' }) } catch { blocked(`${label}: Code.gs syntax check failed`) }
  const ast = ts.createSourceFile('Code.gs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const functions = new Map()
  const functionDefinitions = new Map()
  const duplicateFunctions = new Set()
  const constants = new Map()
  const constantDefinitions = new Map()
  const actions = new Set()
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (functions.has(node.name.text)) duplicateFunctions.add(node.name.text)
      functions.set(node.name.text, node.getText(ast))
      functionDefinitions.set(node.name.text, canonicalNode(node, ast))
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const value = literal(declaration.initializer)
          if (value === undefined) blocked(`${label}: executable top-level initializer is not allowed`)
          constants.set(declaration.name.text, value)
          constantDefinitions.set(declaration.name.text, JSON.stringify({
            declarationKind: node.declarationList.flags & ts.NodeFlags.BlockScoped,
            value,
            source: canonicalNode(declaration, ast)
          }))
        }
      }
    } else if (!ts.isEmptyStatement(node)) blocked(`${label}: executable top-level statement is not allowed`)
  }
  function walk(node) {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind)) {
      if (ts.isIdentifier(node.left) && node.left.text === 'action' && ts.isStringLiteralLike(node.right)) actions.add(node.right.text)
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      if (method === 'deleteAllProperties') blocked(`${label}: blanket ScriptProperties deletion is forbidden`)
      if (method === 'setProperties' && literal(node.arguments[1]) === true) blocked(`${label}: ScriptProperties replacement is forbidden`)
      if (method === 'deleteProperty' && /MOBILE_SHARED_PASSWORD|MOBILE_SESSION_PROPERTY_PREFIX/.test(node.arguments[0]?.getText(ast) || '')) blocked(`${label}: protected mobile property deletion is forbidden`)
    }
    ts.forEachChild(node, walk)
  }
  walk(ast)
  const notes = constants.get('RELEASE_NOTES')
  if (!Array.isArray(notes) || !notes.length) blocked(`${label}: literal RELEASE_NOTES are required`)
  return { source, functions, functionDefinitions, duplicateFunctions, constants, constantDefinitions, actions, notes, serviceVersion: constants.get('MOBILE_SERVICE_VERSION') }
}
function requireFunction(info, name) {
  const value = info.functions.get(name)
  if (!value) blocked(`required function missing: ${name}`)
  return value
}
function assertSessionPreservation(info) {
  // Synthetic properties only: no real password or live session is read.
  const prefix = info.constants.get('MOBILE_SESSION_PROPERTY_PREFIX')
  const passwordKey = info.constants.get('MOBILE_SHARED_PASSWORD_HASH_PROPERTY')
  const now = Date.now()
  const activeValue = JSON.stringify({ viewerName: 'guard-viewer', expiresAt: now + 3600000 })
  const properties = new Map([[passwordKey, 'guard-hash'], [prefix + 'active', activeValue], [prefix + 'expired', JSON.stringify({ expiresAt: now - 1 })], ['unrelated', 'keep']])
  const api = {
    getProperties: () => Object.fromEntries(properties),
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => { properties.set(key, value); return api },
    deleteProperty: key => { properties.delete(key); return api },
    deleteAllProperties: () => blocked('session initialization deleted all properties'),
    setProperties: () => blocked('session initialization replaced properties')
  }
  const sandbox = { PropertiesService: { getScriptProperties: () => api }, Utilities: { getUuid: () => 'guard-session' }, sha256_: () => 'new-session-hash' }
  const code = `const MOBILE_SESSION_PROPERTY_PREFIX=${JSON.stringify(prefix)}; const MOBILE_SESSION_HOURS=72;\n${requireFunction(info, 'mobileCreateSession_')}\nmobileCreateSession_('guard-viewer');`
  let result
  try { result = vm.runInNewContext(code, sandbox, { timeout: 1000 }) } catch { blocked('72-hour session lifecycle check failed') }
  if (properties.get(passwordKey) !== 'guard-hash' || properties.get(prefix + 'active') !== activeValue || properties.get('unrelated') !== 'keep') blocked('session creation removed existing credentials or active sessions')
  const hours = (Date.parse(result?.expiresAt) - now) / 3600000
  if (!result?.verified || !result?.accessToken || hours < 71.99 || hours > 72.01) blocked('session lifetime must remain 72 hours')
}
function validateContract(info) {
  for (const name of info.duplicateFunctions) if (name.startsWith('mobile') || name === 'getMobileScheduleBundle_' || name === 'doPost') blocked(`duplicate mobile entry point: ${name}`)
  if (!Number.isInteger(info.serviceVersion) || info.serviceVersion < 43) blocked('MOBILE_SERVICE_VERSION must be the v1.1.30 integrated version (43 or newer)')
  if (info.constants.get('MOBILE_SESSION_HOURS') !== 72) blocked('MOBILE_SESSION_HOURS must remain 72')
  if (info.constants.get('MOBILE_SHARED_PASSWORD_HASH_PROPERTY') !== 'UNG_MOBILE_SHARED_PASSWORD_HASH' || info.constants.get('MOBILE_SESSION_PROPERTY_PREFIX') !== 'UNG_MOBILE_SESSION_') blocked('existing mobile credential property names must be preserved')
  for (const name of ['verifyMobileViewer', 'getMobileScheduleBundle']) if (!info.actions.has(name)) blocked(`mobile action missing: ${name}`)
  const post = requireFunction(info, 'doPost')
  if (!/mobileAssertViewer_/.test(post) || !/mobileSharedPasswordHash_/.test(post) || !/mobileCreateSession_/.test(post)) blocked('name/password login route is incomplete')
  if (post.indexOf("action === 'getMobileScheduleBundle'") > post.indexOf('ensureSheets_(') && post.includes('ensureSheets_(')) blocked('mobile action must precede full desktop sheet initialization')
  const bundle = requireFunction(info, 'getMobileScheduleBundle_')
  if (!/mobileAssertAccess_\s*\(\s*body\s*\)/.test(bundle)) blocked('mobile bundle must require its existing login session')
  if (!/contractVersion\s*:\s*3\b/.test(bundle) || !/sourceStatus\s*:\s*sourceStatus/.test(bundle)) blocked('contractVersion 3/sourceStatus response missing')
  for (const key of ['weekly', 'creative', 'gateDuty', 'mealDuty', 'timetable', 'committee', 'changes', 'meals']) {
    if (!new RegExp(`mobileLoadSource_\\(sourceStatus,\\s*['"]${key}['"]`).test(bundle)) blocked(`independent sourceStatus loader missing: ${key}`)
  }
  if (!/meals\s*:\s*meals/.test(bundle) || !/todayMeals\s*:\s*todayMeals/.test(bundle) || !/mobileSharedMealsInRange_\([^;\n]*fromDate[^;\n]*toDate/.test(bundle)) blocked('range meals/legacy todayMeals contract missing')
  if (!/todayKey/.test(bundle) || !/cacheKey[^\n]*todayKey/.test(bundle)) blocked('mobile cache key must include the Korea date')
  const load = requireFunction(info, 'mobileLoadSource_')
  for (const state of ['fresh', 'empty', 'unavailable']) if (!load.includes(`'${state}'`)) blocked(`sourceStatus state missing: ${state}`)
  const meals = requireFunction(info, 'mobileSharedMealsInRange_')
  if (!/readObjects_\(NEIS_MEALS_SHEET\)/.test(meals) || !/dateKey\s*>=\s*fromKey/.test(meals) || !/dateKey\s*<=\s*toKey/.test(meals)) blocked('shared NEIS meal date range filtering missing')
  for (const [name, body] of info.functions) {
    if (!name.startsWith('mobile') && name !== 'getMobileScheduleBundle_') continue
    if (/UrlFetchApp|open\.neis\.go\.kr|NEIS_SCHEDULE_SHEET|NEIS_CLASS_TIMETABLE_SHEET|getStudentRoster_|getStudentTimetable_|getNeisSnapshot_/.test(body)) blocked(`forbidden mobile data/API dependency in ${name}`)
  }
  if (/\b(?:studentRoster|studentTimetable|studentTimetables|neisSchedule|neisClassTimetable|classTimetable|students)\s*:/.test(bundle)) blocked('forbidden student/NEIS field in mobile response')
  for (const key of ['v1.1.24', 'v1.1.25']) if (!info.notes.some(note => note.key === key)) blocked(`desktop release note missing: ${key}`)
  assertSessionPreservation(info)
}
function compareDesktopDefinitions(local, baseline, label, main) {
  for (const name of baseline.functions.keys()) {
    if (isIntegrationFunction(name)) continue
    const authority = main?.functionDefinitions.has(name) ? main : baseline
    if (local.functionDefinitions.get(name) !== authority.functionDefinitions.get(name)
      && !isApprovedReleaseDefinition(local, name, 'function')) blocked(`${label}: protected desktop function changed: ${name}`)
  }
  for (const name of baseline.constants.keys()) {
    if (isIntegrationConstant(name)) continue
    if (!local.constants.has(name)) blocked(`${label}: protected desktop constant removed: ${name}`)
    const authority = main?.constantDefinitions.has(name) ? main : baseline
    if (local.constantDefinitions.get(name) !== authority.constantDefinitions.get(name)
      && !isApprovedReleaseDefinition(local, name, 'constant')) blocked(`${label}: protected desktop constant changed: ${name}`)
  }
}
function compareBaseline(local, baselineSource, label, deployed, main = null) {
  const baseline = inspectSource(baselineSource, label)
  for (const name of baseline.functions.keys()) if (!local.functions.has(name)) blocked(`${label}: existing desktop/mobile function removed: ${name}`)
  for (const action of baseline.actions) if (!local.actions.has(action)) blocked(`${label}: existing action removed: ${action}`)
  compareDesktopDefinitions(local, baseline, label, main)
  for (const note of baseline.notes) {
    const matching = local.notes.filter(candidate => candidate.key === note.key)
    if (!matching.length) blocked(`${label}: release note removed: ${note.key}`)
    const combinedBody = matching.map(candidate => candidate.body).join('\n')
    for (const line of String(note.body || '').split('\n').filter(Boolean)) if (!combinedBody.includes(line)) blocked(`${label}: release note content removed: ${note.key}`)
  }
  if (Number.isInteger(baseline.serviceVersion)) {
    if (local.serviceVersion < baseline.serviceVersion) blocked(`${label}: mobile service version downgrade`)
    if (deployed && local.serviceVersion === baseline.serviceVersion && local.source.replace(/\r\n/g, '\n').trimEnd() !== baseline.source.replace(/\r\n/g, '\n').trimEnd()) blocked(`${label}: changed deployed code requires a newer MOBILE_SERVICE_VERSION`)
    for (const key of ['MOBILE_SESSION_HOURS', 'MOBILE_SHARED_PASSWORD_HASH_PROPERTY', 'MOBILE_SESSION_PROPERTY_PREFIX']) if (local.constants.get(key) !== baseline.constants.get(key)) blocked(`${label}: protected login constant changed: ${key}`)
  }
}
function validate(input) {
  const local = inspectSource(input.localSource, 'local')
  validateContract(local)
  const baselines = input.baselines || []
  const mainBaselines = baselines.filter(baseline => baseline.role === 'origin-main' || baseline.label === 'origin/main')
  if (mainBaselines.length > 1) blocked('ambiguous origin/main source baseline')
  const main = mainBaselines.length ? inspectSource(mainBaselines[0].source, 'origin/main') : null
  for (const baseline of baselines) compareBaseline(local, baseline.source, baseline.label || 'baseline', baseline.deployed === true, main)
  if (main) {
    // Three-way policy: main is authoritative for existing desktop definitions;
    // remote-only definitions must be kept unchanged, never silently discarded.
    // A new local desktop definition not found in either source needs main review.
    const knownFunctions = new Set()
    const knownConstants = new Set()
    for (const baseline of baselines) {
      const info = inspectSource(baseline.source, baseline.label || 'baseline')
      for (const name of info.functions.keys()) knownFunctions.add(name)
      for (const name of info.constants.keys()) knownConstants.add(name)
    }
    for (const name of local.functions.keys()) if (!isIntegrationFunction(name) && !knownFunctions.has(name)
      && !isApprovedReleaseDefinition(local, name, 'function')) blocked(`unreviewed desktop function added outside origin/main: ${name}`)
    for (const name of local.constants.keys()) if (!isIntegrationConstant(name) && !knownConstants.has(name)
      && !isApprovedReleaseDefinition(local, name, 'constant')) blocked(`unreviewed desktop constant added outside origin/main: ${name}`)
  }
  return { ok: true, serviceVersion: local.serviceVersion, functions: local.functions.size, actions: local.actions.size, releaseNotes: local.notes.length, baselineCount: baselines.length, desktopBodyProtection: Boolean(main) }
}
module.exports = { inspectSource, validate, compareBaseline, validateContract, compareDesktopDefinitions }
if (require.main === module) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
    process.stdout.write(JSON.stringify(validate(input)))
  } catch (error) {
    // Only our explicit, source-free messages may reach logs.
    process.stderr.write(error?.message?.startsWith('Deployment blocked:') ? error.message : 'Deployment blocked: source validation failed')
    process.exitCode = 1
  }
}
