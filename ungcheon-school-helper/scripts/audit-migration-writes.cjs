'use strict'
// Static evidence only. Do not execute business functions or collect user data.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const sheetMethods = new Set(['setValue','setValues','appendRow','clear','clearContent','clearContents','deleteRow','deleteRows','insertSheet','insertColumnsAfter','setNumberFormat','copyTo','setName'])
const propertyMethods = new Set(['setProperty','setProperties','deleteProperty','deleteAllProperties'])
const functions = []
for (const file of ['Code.gs','StaffAuth.gs']) {
  const source = fs.readFileSync(path.join(root,'server',file),'utf8')
  const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.name) continue
    const calls = new Set(), sheetWrites = new Set(), propertyWrites = new Set(), candidateSheetConstants = new Set()
    let acquiresScriptLock = false, flushesSheets = false
    function visit(n) {
      if (ts.isIdentifier(n) && /_SHEET$/.test(n.text)) candidateSheetConstants.add(n.text)
      if (ts.isCallExpression(n)) {
        if (ts.isIdentifier(n.expression)) calls.add(n.expression.text)
        if (ts.isPropertyAccessExpression(n.expression)) {
          const method = n.expression.name.text
          if (sheetMethods.has(method)) sheetWrites.add(method)
          if (propertyMethods.has(method)) propertyWrites.add(method)
          if (method === 'getScriptLock') acquiresScriptLock = true
          if (method === 'flush' && n.expression.expression.getText(ast) === 'SpreadsheetApp') flushesSheets = true
        }
      }
      ts.forEachChild(n,visit)
    }
    visit(node)
    functions.push({name:node.name.text,file,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,calls:[...calls],sheetWrites:[...sheetWrites],propertyWrites:[...propertyWrites],candidateSheetConstants:[...candidateSheetConstants],acquiresScriptLock,flushesSheets})
  }
}
const byName = new Map()
for (const f of functions) byName.set(f.name,f)
function reachable(name) {
  const seen = new Set()
  function walk(n) {if(seen.has(n) || !byName.has(n)) return;seen.add(n);for(const called of byName.get(n).calls) walk(called)}
  walk(name);return [...seen].map(n=>byName.get(n))
}
const effective=[...byName.values()]
const duplicateDefinitions=[...new Set(functions.map(f=>f.name))].filter(name=>functions.filter(f=>f.name===name).length>1).map(name=>({name,definitions:functions.filter(f=>f.name===name).map(f=>({file:f.file,line:f.line})),effectiveLine:byName.get(name).line}))
const report={
  baseline:'80f12b0179e55d1b46106d3e3c7ebca18a2afc1b',sourceOnly:true,
  files:['server/Code.gs','server/StaffAuth.gs'],
  internalWriterDeclaration:{source:'user',date:'2026-11-13',value:'업무도우미에서만 수정',externalInputSheetsExcluded:true},
  duplicateDefinitions,
  directSheetWriters:effective.filter(f=>f.sheetWrites.length).map(({calls,...f})=>({...f,reachableLockFunctions:reachable(f.name).filter(c=>c.acquiresScriptLock).map(c=>c.name)})),
  propertyOnlyWriters:effective.filter(f=>f.propertyWrites.length&&!f.sheetWrites.length).map(({calls,...f})=>f),
  lockFunctions:effective.filter(f=>f.acquiresScriptLock).map(f=>({name:f.name,file:f.file,line:f.line,nestedLockCandidates:reachable(f.name).filter(c=>c.name!==f.name&&c.acquiresScriptLock).map(c=>c.name)})),
  readRouteMutationCandidates:['getStaffRoster','getSyncManifest'],
  integrationRequirements:[
    'Authenticate and validate before preparing a journal entry; retain all existing authorization checks.',
    'Track schema/notice/roster repair writes, not just explicitly named save actions.',
    'Replace every participating legacy script lock with one execution-aware common lock; do not wrap existing locks blindly.',
    'Keep credential/session property writes outside migration payloads; do not export or reset them.',
    'Persist intent before source writes; uncertain source outcomes require inspection, never automatic source replay.',
    'Capture bounded affected resources or row IDs; no full-workbook download per save.',
    'Inventory live triggers separately; static reachability and user declaration do not prove trigger absence.'
  ],
  limitations:['Potential writes are conservative static matches, not a proof of runtime execution.','Candidate sheet constants may include reads; aliases and dynamic dispatch require manual review.','The last duplicate definition is reported; duplicate declarations are not rewritten.','No live tracking, source mutation, trigger installation or backend switch is performed.']
}
console.log(JSON.stringify(report,null,2))
