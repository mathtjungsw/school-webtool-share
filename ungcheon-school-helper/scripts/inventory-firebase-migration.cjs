'use strict'
// Source metadata only. Does not evaluate server code or read Google data.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const methods = new Set(['setValue', 'setValues', 'appendRow', 'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows', 'insertSheet', 'insertColumnsAfter', 'setProperty', 'setProperties', 'deleteProperty'])
const functions = []
const source = fs.readFileSync(path.join(root, 'server/Code.gs'), 'utf8')
const ast = ts.createSourceFile('Code.gs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
for (const node of ast.statements) {
  if (!ts.isFunctionDeclaration(node) || !node.name) continue
  const calls = new Set()
  const mutations = new Set()
  function visit(item) {
    if (ts.isCallExpression(item)) {
      if (ts.isIdentifier(item.expression)) calls.add(item.expression.text)
      if (ts.isPropertyAccessExpression(item.expression) && methods.has(item.expression.name.text)) mutations.add(item.expression.name.text)
    }
    ts.forEachChild(item, visit)
  }
  visit(node)
  functions.push({ name: node.name.text, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, calls: [...calls], mutations: [...mutations] })
}
const mutating = new Set(functions.filter(item => item.mutations.length).map(item => item.name))
let changed = true
while (changed) {
  changed = false
  for (const item of functions) if (!mutating.has(item.name) && item.calls.some(name => mutating.has(name))) { mutating.add(item.name); changed = true }
}
const actions = new Set()
const dispatcher = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'doPost')
function collectActions(node) {
  if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === 'action' && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isStringLiteral(node.right)) actions.add(node.right.text)
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'indexOf' && ts.isArrayLiteralExpression(node.expression.expression) && node.arguments.some(argument => ts.isIdentifier(argument) && argument.text === 'action')) {
    for (const value of node.expression.expression.elements) if (ts.isStringLiteral(value)) actions.add(value.text)
  }
  ts.forEachChild(node, collectActions)
}
collectActions(dispatcher)
const sheets = [...source.matchAll(/^const [A-Z_]+SHEET = '([^']+)';/gm)].map(item => item[1])
console.log(JSON.stringify({
  baseline: '80f12b0179e55d1b46106d3e3c7ebca18a2afc1b', sourceOnly: true,
  sheets, actions: [...actions].sort(),
  directMutations: functions.filter(item => item.mutations.length).map(({ calls, ...item }) => item),
  transitiveMutationFunctions: functions.filter(item => mutating.has(item.name)).map(item => ({ name: item.name, line: item.line })),
  limitations: ['Static call graph includes initialization and authentication writes.', 'Dynamic dispatch, external editors, triggers and external-sheet writers require separate inspection.', 'No production row counts, source revisions or payloads were inspected.'],
}, null, 2))
