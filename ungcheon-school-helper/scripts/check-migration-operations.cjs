'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {fixture}=require('./migration-tracking-fixture.cjs'),{repoFixture}=require('./migration-replica-fixture.cjs')
let passed=0
function test(name,fn){fn();passed++;console.log('PASS '+name)}
const admin={adminPassword:'synthetic-admin'}
const deployment={projectId:'ungcheon-school-helper',schoolId:'synthetic-operations',deploymentVersion:999,sourceFingerprint:'1'.repeat(64)}
function setup(activate=true,freeze=true){
  const f=fixture();f.ctx.__clock=Date.now();vm.runInContext('Date.now=function(){return __clock}',f.ctx)
  const repo=repoFixture(f.ctx);let connections=0
  f.ctx.migrationOperationsRepository_=()=>{connections++;return repo}
  f.ctx.migrationPrepareOperations_(f.book,deployment)
  if(activate){f.ctx.__clock+=600000;f.ctx.migrationActivatePreparedTracking_()}
  if(activate&&freeze){let result;for(let i=0;i<100;i++){result=f.ctx.migrationFreezeConfiguredBaseline_();if(result.status==='COMPLETE')break}assert.equal(result.status,'COMPLETE')}
  connections=0
  const call=(action,body={})=>f.post({action,...admin,...body})
  const drain=()=>{for(let i=0;i<100;i++){const r=call('runMigrationReplica');assert.equal(r.ok,true);if(r.data.status!=='BUDGET_EXHAUSTED')return r.data}throw Error('did not converge')}
  return {...f,repo,call,drain,connections:()=>connections}
}
const add=(f,id='synthetic-management-add')=>f.post({action:'addLink',department:'Test',title:'PRIVATE_SYNTHETIC_CONTENT',url:'https://example.com/'+id,operationId:id})
function uncertain(f){let saved=false;f.book.setFault((kind,sheet)=>{if(kind==='after-write'&&sheet==='공유링크')saved=true;return saved&&kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1'});assert.equal(add(f).ok,true);f.book.setFault(null)}

test('target access failure leaves staging and legacy service unchanged',()=>{
  const f=fixture();f.ctx.migrationOperationsRepository_=()=>({get(){throw f.ctx.migrationError_('MIGRATION_FIRESTORE_PERMISSION_DENIED')}})
  assert.throws(()=>f.ctx.migrationPrepareOperations_(f.book,deployment),e=>e.code==='MIGRATION_FIRESTORE_PERMISSION_DENIED')
  assert.equal(f.properties.has('UNG_MIGRATION_OPERATIONS_V1'),false);assert.equal(add(f).ok,true);assert.equal(f.journal().length,0)
})

test('owner setup is idempotent; draining serializes writes without stopping service or resetting secrets',()=>{
  const f=setup(false,false),before=JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues())
  f.properties.set('PRESERVED_SECRET','synthetic-secret');assert.equal(f.ctx.migrationPrepareOperations_(f.book,deployment).duplicate,true)
  assert.throws(()=>f.ctx.migrationPrepareOperations_(f.book,{...deployment,schoolId:'other'}),e=>e.code==='MIGRATION_SETUP_CONFLICT')
  assert.throws(()=>f.ctx.migrationActivatePreparedTracking_(),e=>e.code==='MIGRATION_DRAIN_NOT_FINISHED')
  assert.equal(JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues()),before)
  const locks=f.locks();assert.equal(add(f).ok,true);assert.ok(f.locks()>locks);assert.equal(f.journal().length,0)
  assert.equal(f.call('getMigrationStatus').data.phase,'DRAINING');assert.equal(f.connections(),0)
  f.ctx.__clock+=600000;assert.equal(f.ctx.migrationActivatePreparedTracking_().activated,true);assert.equal(f.ctx.migrationActivatePreparedTracking_().duplicate,true)
  assert.equal(f.properties.get('PRESERVED_SECRET'),'synthetic-secret');assert.equal(f.call('getMigrationStatus').data.activeBackend,'SHEETS')
})
test('a queued request rechecks activation after taking the lock',()=>{
  const f=setup(false,false);assert.equal(f.ctx.migrationWriteGateEnabled_(),true)
  const getLock=f.ctx.LockService.getScriptLock;let activated=false
  f.ctx.LockService.getScriptLock=()=>{const lock=getLock();return {...lock,waitLock(ms){if(!activated){activated=true;f.enable()}lock.waitLock(ms)}}}
  assert.equal(add(f).ok,true);assert.equal(f.journal().length,1);assert.equal(f.journal()[0].phase,'APPLIED');assert.equal(f.held(),false)
})
test('all management routes require staff and admin auth before source or Firestore access; GET is rejected',()=>{
  const f=setup(),actions=['getMigrationStatus','getMigrationInventory','runMigrationReplica','setMigrationReplicaPaused','prepareMigrationReview','confirmMigrationReview']
  f.book.events.length=0;const properties=JSON.stringify([...f.properties])
  for(const action of actions){
    assert.equal(f.call(action,{staffToken:'invalid',paused:true,revision:1}).ok,false)
    assert.equal(f.call(action,{adminPassword:'invalid',paused:true,revision:1}).ok,false)
    assert.equal(JSON.parse(f.ctx.doGet({parameter:{action,payload:JSON.stringify(admin)}}).getContent()).ok,false)
  }
  assert.equal(f.connections(),0);assert.equal(f.book.events.length,0);assert.equal(JSON.stringify([...f.properties]),properties)
})
test('manual work is bounded, uses only configured target, publishes counts, and idle requests do not write',()=>{
  const f=setup();assert.equal(add(f).ok,true)
  const first=f.call('runMigrationReplica',{maxSteps:99999,maxMillis:99999999,projectId:'attacker',sourceBookId:'other'})
  assert.equal(first.ok,true);assert.ok(first.data.steps<=2);assert.equal(f.drain().status,'IDLE')
  const writes=f.repo.metrics.writes;assert.equal(f.drain().status,'IDLE');assert.equal(f.repo.metrics.writes,writes)
  f.book.events.length=0;const status=f.call('getMigrationStatus').data
  assert.equal(status.verifiedRevision,1);assert.equal(status.pendingCount,0);assert.equal(status.resources.find(x=>x.resource==='links').replicaCount,1)
  assert.equal(status.cutoverReady,false);assert.equal(status.activeBackend,'SHEETS');assert.ok(!JSON.stringify(status).includes('PRIVATE_SYNTHETIC_CONTENT'))
  assert.equal(f.book.events.some(e=>e.sheet==='공유링크'&&e.kind==='read-values'),false)
})
test('pausing replication leaves source saving and change tracking active',()=>{
  const f=setup();f.drain();assert.equal(f.call('setMigrationReplicaPaused',{paused:true}).data.trackingContinues,true)
  const writes=f.repo.metrics.writes;assert.equal(add(f).ok,true);assert.equal(f.journal().length,1)
  assert.equal(f.call('runMigrationReplica').data.status,'PAUSED');assert.equal(f.repo.metrics.writes,writes)
  assert.equal(f.call('getMigrationStatus').data.phase,'PAUSED');assert.equal(f.call('setMigrationReplicaPaused',{paused:false}).ok,true)
  assert.equal(f.drain().status,'IDLE');assert.equal(f.call('getMigrationStatus').data.verifiedRevision,1)
})
test('worker leases suppress overlapping execution and expired executions can resume',()=>{
  const f=setup();f.ctx.migrationWithSourceLock_(()=>f.ctx.migrationOperationsSaveState_({schemaVersion:1,paused:false,lease:{id:'other',expiresAt:f.ctx.__clock+600000},lastRun:null}))
  assert.equal(f.call('runMigrationReplica').data.status,'BUSY');assert.equal(f.connections(),0)
  f.ctx.__clock+=600001;assert.equal(f.drain().status,'IDLE');assert.equal(f.ctx.migrationOperationsState_().lease,null)
})
test('pause arriving during a step stops the next step and survives lease cleanup',()=>{
  const f=setup();let paused=false
  f.repo.setFault(when=>{if(when==='before'&&!paused){paused=true;assert.equal(f.call('setMigrationReplicaPaused',{paused:true}).ok,true)}})
  assert.equal(f.call('runMigrationReplica').data.status,'PAUSED');assert.equal(f.repo.metrics.writes,1)
  assert.equal(f.ctx.migrationOperationsState_().paused,true);assert.equal(f.ctx.migrationOperationsState_().lease,null)
})
test('lost commit responses and opaque failures release leases without replay or leaking raw errors',()=>{
  const f=setup();let lost=false
  f.repo.setFault(when=>{if(when==='after'&&!lost){lost=true;throw f.ctx.migrationError_('MIGRATION_TRANSPORT_FAILED',true)}})
  assert.equal(f.call('runMigrationReplica').data.status,'RETRY_LATER');assert.equal(f.ctx.migrationOperationsState_().lease,null)
  f.repo.setFault(null);assert.equal(f.drain().status,'IDLE')
  f.repo.setFault(()=>{throw Error('PRIVATE_CREDENTIAL_RESPONSE')});const failed=f.call('runMigrationReplica')
  assert.equal(failed.data.status,'ERROR');assert.equal(failed.data.code,'MIGRATION_OPERATION_FAILED')
  assert.ok(!JSON.stringify(failed).includes('PRIVATE_CREDENTIAL_RESPONSE'));assert.ok(!JSON.stringify(f.ctx.migrationOperationsState_()).includes('PRIVATE_CREDENTIAL_RESPONSE'))
})
test('review challenges are bound to the authenticated reviewer, expire, and require explicit source confirmation',()=>{
  const f=setup();uncertain(f);const plan=f.call('prepareMigrationReview',{revision:1}).data
  assert.equal(f.call('getMigrationStatus').data.blockedRevision,1);assert.equal(plan.changes[0].count,1)
  assert.ok(!JSON.stringify(plan).includes('PRIVATE_SYNTHETIC_CONTENT'))
  const body={...admin,challengeRef:plan.challengeRef,decision:'ACCEPT_OBSERVED_SOURCE',sourceChecked:true}
  assert.throws(()=>f.ctx.migrationAdminConfirmReview_(body,{name:'Other synthetic teacher'}),e=>e.code==='MIGRATION_REVIEW_FORBIDDEN')
  assert.equal(f.call('confirmMigrationReview',{...body,sourceChecked:false}).ok,false)
  f.ctx.__clock+=600001;assert.match(f.call('confirmMigrationReview',body).error,/MIGRATION_REVIEW_EXPIRED/)
  assert.equal(f.store.status().pendingCount,1)
})
test('admin confirmation rejects stale plans and preserves source rows and original uncertain receipt',()=>{
  const f=setup();uncertain(f);const first=f.call('prepareMigrationReview',{revision:1}).data
  assert.equal(add(f,'synthetic-after-uncertain').ok,true)
  const confirm=ref=>f.call('confirmMigrationReview',{challengeRef:ref,decision:'ACCEPT_OBSERVED_SOURCE',sourceChecked:true,reviewerHash:'forged'})
  assert.match(confirm(first.challengeRef).error,/MIGRATION_REVIEW_STALE/)
  const fresh=f.call('prepareMigrationReview',{revision:1}).data;assert.equal(fresh.changes[0].source,'NEXT_BEFORE_IMAGE')
  const rows=JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues()),record=JSON.stringify(f.journal()[0])
  assert.equal(confirm(fresh.challengeRef).data.accepted,true);assert.equal(confirm(fresh.challengeRef).data.duplicate,true)
  assert.equal(JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues()),rows);assert.equal(JSON.stringify(f.journal()[0]),record)
  assert.equal(add(f).ok,false);assert.equal(f.drain().status,'IDLE');assert.equal(f.call('getMigrationStatus').data.errorCount,0)
})
test('management transport stays POST-only with sufficient timeout and never enables a client-supplied target',()=>{
  const root=path.resolve(__dirname,'..'),electron=fs.readFileSync(path.join(root,'electron/main/index.ts'),'utf8'),server=fs.readFileSync(path.join(root,'server/Code.gs'),'utf8')
  const allowed=electron.match(/const HUB_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1],reads=electron.match(/const HUB_READ_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1],long=electron.match(/const HUB_LARGE_DATA_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1]
  for(const action of ['getMigrationStatus','getMigrationInventory','runMigrationReplica','setMigrationReplicaPaused','prepareMigrationReview','confirmMigrationReview']){
    assert.ok(allowed.includes("'"+action+"'"));assert.ok(!reads.includes("'"+action+"'"));assert.ok(long.includes("'"+action+"'"));assert.ok(server.includes("action === '"+action+"'"))
  }
  assert.ok(!server.includes("action === 'migrationActivatePreparedTracking'"));assert.ok(!server.includes("action === 'migrationFreezeConfiguredBaseline'"))
})
test('rollback invalidation preserves history and source saving but forbids resuming the old replica',()=>{
  const f=setup();f.drain();const config=f.properties.get('UNG_MIGRATION_OPERATIONS_V1')
  assert.equal(f.ctx.migrationInvalidateReplica_().rebaseRequired,true);assert.equal(add(f).ok,true)
  assert.equal(f.call('getMigrationStatus').data.phase,'REBASE_REQUIRED');assert.equal(f.call('getMigrationStatus').data.canRun,false)
  assert.match(f.call('setMigrationReplicaPaused',{paused:false}).error,/MIGRATION_REPLICA_REBASE_REQUIRED/)
  assert.match(f.call('runMigrationReplica').error,/MIGRATION_REPLICA_REBASE_REQUIRED/)
  assert.throws(()=>f.ctx.migrationFreezeConfiguredBaseline_(),e=>e.code==='MIGRATION_REPLICA_REBASE_REQUIRED')
  assert.equal(f.properties.get('UNG_MIGRATION_OPERATIONS_V1'),config);assert.equal(f.journal().length,1)
})
console.log(`Migration operations: ${passed} groups passed; synthetic sources only.`)
