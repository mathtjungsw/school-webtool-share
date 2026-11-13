'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{fixture}=require('./migration-tracking-fixture.cjs')
const f=fixture();new vm.Script(fs.readFileSync(path.join(__dirname,'../server/MigrationOwner.gs'),'utf8')).runInContext(f.ctx)
const identity={scriptId:'synthetic-script',deploymentId:'synthetic-fixed',book:f.book}
const version=vm.runInContext('MOBILE_SERVICE_VERSION',f.ctx)
const evidence={schemaVersion:1,scriptId:identity.scriptId,deploymentId:identity.deploymentId,serviceVersion:version,deploymentVersion:999,
  releaseId:f.ctx.migrationOwnerReleaseId_(),sourceFingerprint:'1'.repeat(64),headMatchesDeployment:true,verifiedAt:Date.now()}
let recorded=null,healthy=true
let writes=0,reads=0,triggers=[]
f.ctx.migrationProductionIdentity_=()=>identity
f.ctx.migrationOperationsRepository_=()=>({get(){reads++;return recorded?{data:recorded}:null},commit(){writes++}})
f.ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:healthy,data:{service:'UngcheonSchoolHub',version}})})}
f.ctx.ScriptApp={getProjectTriggers:()=>triggers,newTrigger:handler=>({timeBased(){return this},everyMinutes(n){assert.equal(n,5);return this},create(){triggers.push({getHandlerFunction:()=>handler})}})}
const properties=JSON.stringify([...f.properties]),rows=JSON.stringify(f.book.events)
assert.equal(f.ctx.authorizeMigrationConnection().ok,true);assert.equal(writes,0);assert.equal(reads,1)
assert.equal(JSON.stringify([...f.properties]),properties);assert.equal(JSON.stringify(f.book.events),rows)
assert.throws(()=>f.ctx.prepareMigrationProduction(),e=>e.code==='MIGRATION_INVALID_DEPLOYMENT_RECORD')
recorded=evidence;const verified=f.ctx.migrationOwnerEvidence_(identity);assert.equal(verified.deploymentVersion,999)
for(const change of [{verifiedAt:Date.now()-3600001},{verifiedAt:Date.now()+60000},{releaseId:'old-release'},{headMatchesDeployment:false},{scriptId:'another-script'},{serviceVersion:version-1}]){
  recorded={...evidence,...change};assert.throws(()=>f.ctx.prepareMigrationProduction(),e=>e.code==='MIGRATION_INVALID_DEPLOYMENT_RECORD')
}
recorded=evidence;healthy=false;assert.throws(()=>f.ctx.prepareMigrationProduction(),e=>e.code==='MIGRATION_DEPLOYMENT_HEALTH_FAILED');healthy=true
assert.equal(JSON.stringify([...f.properties]),properties)
f.ctx.migrationOwnerEvidence_=()=>verified;f.ctx.migrationOperationsConfig_=()=>({...verified,sourceFingerprint:'0'.repeat(64)})
assert.throws(()=>f.ctx.activateMigrationProduction(),e=>e.code==='MIGRATION_DEPLOYMENT_CODE_DIFFERS')
f.ctx.migrationOperationsContext_=()=>({config:{baselineRef:null}})
f.ctx.installMigrationReplicationTrigger();f.ctx.installMigrationReplicationTrigger();assert.equal(triggers.length,1)
f.ctx.migrationOperationsState_=()=>({paused:true});f.ctx.migrationFreezeConfiguredBaseline_=()=>{throw Error('paused worker must not capture')}
f.ctx.migrationReplicationTick()
const g=fixture();new vm.Script(fs.readFileSync(path.join(__dirname,'../server/MigrationOwner.gs'),'utf8')).runInContext(g.ctx)
const old={projectId:'ungcheon-school-helper',schoolId:'ungcheon',deploymentVersion:999,sourceFingerprint:'1'.repeat(64)}
g.ctx.migrationProductionIdentity_=()=>({book:g.book});g.ctx.migrationOperationsRepository_=()=>({get:()=>null})
g.ctx.migrationPrepareOperations_(g.book,old);const original=g.ctx.migrationOperationsConfig_()
g.ctx.migrationOwnerEvidence_=()=>({...old,deploymentVersion:1000,sourceFingerprint:'2'.repeat(64)})
g.ctx.refreshMigrationPreparedDeployment();const refreshed=g.ctx.migrationOperationsConfig_()
assert.equal(refreshed.deploymentVersion,1000);assert.ok(refreshed.notBefore>=original.notBefore);assert.equal(refreshed.baselineRef,null)
g.enable();assert.throws(()=>g.ctx.refreshMigrationPreparedDeployment(),e=>e.code==='MIGRATION_REFRESH_NOT_ALLOWED')
console.log('Migration owner: read-only authorization, deployment mismatch barriers, idempotent trigger and paused worker passed.')
