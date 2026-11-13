'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{fixture}=require('./migration-tracking-fixture.cjs')
const f=fixture();new vm.Script(fs.readFileSync(path.join(__dirname,'../server/MigrationOwner.gs'),'utf8')).runInContext(f.ctx)
const identity={scriptId:'synthetic-script',deploymentId:'synthetic-fixed',book:f.book}
const version=vm.runInContext('MOBILE_SERVICE_VERSION',f.ctx)
const content={files:[{name:'Code',type:'SERVER_JS',source:`const MOBILE_SERVICE_VERSION = ${version};`},{name:'MigrationOwner',type:'SERVER_JS',source:'synthetic'}]}
let writes=0,reads=0,triggers=[]
f.ctx.migrationProductionIdentity_=()=>identity
f.ctx.migrationOwnerApi_=(_,p)=>p.startsWith('/deployments/')?{deploymentId:identity.deploymentId,deploymentConfig:{versionNumber:999}}:content
f.ctx.migrationOperationsRepository_=()=>({get(){reads++;return null},commit(){writes++}})
f.ctx.ScriptApp={getProjectTriggers:()=>triggers,newTrigger:handler=>({timeBased(){return this},everyMinutes(n){assert.equal(n,5);return this},create(){triggers.push({getHandlerFunction:()=>handler})}})}
const properties=JSON.stringify([...f.properties]),rows=JSON.stringify(f.book.events)
assert.equal(f.ctx.authorizeMigrationConnection().ok,true);assert.equal(writes,0);assert.equal(reads,1)
assert.equal(JSON.stringify([...f.properties]),properties);assert.equal(JSON.stringify(f.book.events),rows)
const verified=f.ctx.migrationOwnerEvidence_(identity);assert.equal(verified.deploymentVersion,999)
f.ctx.migrationOwnerApi_=(_,p)=>p.startsWith('/deployments/')?{deploymentId:identity.deploymentId,deploymentConfig:{versionNumber:999}}:p.includes('?')?content:{files:[]}
assert.throws(()=>f.ctx.prepareMigrationProduction(),e=>e.code==='MIGRATION_DEPLOYMENT_HEAD_DIFFERS');assert.equal(JSON.stringify([...f.properties]),properties)
f.ctx.migrationOwnerEvidence_=()=>verified;f.ctx.migrationOperationsConfig_=()=>({...verified,sourceFingerprint:'0'.repeat(64)})
assert.throws(()=>f.ctx.activateMigrationProduction(),e=>e.code==='MIGRATION_DEPLOYMENT_CODE_DIFFERS')
f.ctx.migrationOperationsContext_=()=>({config:{baselineRef:null}})
f.ctx.installMigrationReplicationTrigger();f.ctx.installMigrationReplicationTrigger();assert.equal(triggers.length,1)
f.ctx.migrationOperationsState_=()=>({paused:true});f.ctx.migrationFreezeConfiguredBaseline_=()=>{throw Error('paused worker must not capture')}
f.ctx.migrationReplicationTick()
console.log('Migration owner: read-only authorization, deployment mismatch barriers, idempotent trigger and paused worker passed.')
