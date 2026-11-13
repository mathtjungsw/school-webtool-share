'use strict'
// Regression comparison ONLY. Never imported by the deployment command/guard.
// The live deployment guard still receives the exact, unmodified source and must
// block protected accessor changes until the reviewed release is on main.
const assert=require('node:assert/strict')
const ts=require('typescript')
const {validate}=require('./apps-script-deploy-guard.cjs')
function businessView(source){
  source=source.replaceAll('(sourceCacheEnabled_() && CacheService.getScriptCache().get(cacheKey))','CacheService.getScriptCache().get(cacheKey)').replaceAll('if (sourceCacheEnabled_()) CacheService.getScriptCache().put(cacheKey,','CacheService.getScriptCache().put(cacheKey,');
  const ast=ts.createSourceFile('Code.gs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[]
  const expectedAccessors={
    sourceProperties_:"function sourceProperties_() { return typeof migrationBackendProperties_ === 'function' ? migrationBackendProperties_() : PropertiesService.getScriptProperties(); }",
    sourceCacheEnabled_:"function sourceCacheEnabled_() { return typeof migrationBackendContext_ === 'undefined' || !migrationBackendContext_; }",
    sourceBook_:"function sourceBook_() { return typeof migrationSourceBook_ === 'function' ? migrationSourceBook_() : SpreadsheetApp.getActiveSpreadsheet(); }",
    sourceLock_:"function sourceLock_() { return typeof migrationCompatibleLock_ === 'function' ? migrationCompatibleLock_() : LockService.getScriptLock(); }",
  }
  function walk(node){
    if(ts.isFunctionDeclaration(node)&&['ensureSheets_','ensureStaffChecklistSheets_'].includes(node.name?.text)){
      const kind=node.name.text==='ensureSheets_'?'ALL':'CHECKLISTS',statements=node.body.statements
      const expected=[`if (typeof migrationSchemaReady_ === 'function' && migrationSchemaReady_(book, MOBILE_SERVICE_VERSION, '${kind}')) return;`,
        `if (typeof migrationRememberSchema_ === 'function') migrationRememberSchema_(book, MOBILE_SERVICE_VERSION, '${kind}');`].map(x=>x.replace(/\s+/g,''))
      const cacheStatements=[...statements].filter(s=>/migrationSchemaReady_|migrationRememberSchema_/.test(s.getText(ast)))
      assert.ok(cacheStatements.length===0||cacheStatements.length===2,'Partial schema cache wrapper')
      if(cacheStatements.length){
        assert.equal(cacheStatements[0],statements[2]);assert.equal(cacheStatements[1],statements[statements.length-1])
        cacheStatements.forEach((s,i)=>{assert.equal(s.getText(ast).replace(/\s+/g,''),expected[i]);edits.push([s.getStart(ast),s.end,''])})
      }
    }
    if(ts.isFunctionDeclaration(node)&&expectedAccessors[node.name?.text]){
      assert.equal(node.getText(ast).replace(/\s+/g,''),expectedAccessors[node.name.text].replace(/\s+/g,''),'Unexpected migration accessor implementation')
      edits.push([node.getStart(ast),node.end,'']);return
    }
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.arguments.length===0){
      const replacement={sourceBook_:'SpreadsheetApp.getActiveSpreadsheet()',sourceLock_:'LockService.getScriptLock()',sourceProperties_:'PropertiesService.getScriptProperties()'}[node.expression.text]
      if(replacement)edits.push([node.getStart(ast),node.end,replacement])
    }
    ts.forEachChild(node,walk)
  }
  walk(ast)
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end)
  return source
}
function assertBusinessAndDeploymentBoundary(local,main){
  assert.equal(validate({localSource:businessView(local),baselines:[{source:businessView(main),role:'origin-main',label:'business-regression-view'}]}).desktopBodyProtection,true)
  try {
    validate({localSource:local,baselines:[{source:main,role:'origin-main',label:'origin/main'}]})
    return 'REVIEWED_MAIN_MATCH'
  } catch(error){
    assert.match(error.message,/protected desktop function changed:/)
    return 'DEPLOYMENT_BLOCKED_PENDING_MAIN_REVIEW'
  }
}
module.exports={assertBusinessAndDeploymentBoundary}
