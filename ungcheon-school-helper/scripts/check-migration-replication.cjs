'use strict'
const assert=require('node:assert/strict'),{fixture}=require('./migration-tracking-fixture.cjs')
let passed=0
function test(name,fn){fn();passed++;console.log('PASS '+name)}
function repoFixture(ctx){
  const docs=new Map(),metrics={gets:0,writes:0,commits:0};let clock=0,fault=null
  const clone=x=>ctx.migrationDecode_(ctx.migrationEncode_(x))
  const repo={docs,metrics,setFault:f=>{fault=f},get(path){metrics.gets++;if(fault)fault('get',path);const d=docs.get(path);return d?{data:clone(d.data),updateTime:d.updateTime}:null},
    list(){throw Error('Worker must never list or download the full database')},
    commit(writes){
      if(fault)fault('before',writes)
      for(const w of writes){const d=docs.get(w.path);if((w.createOnly&&d)||(w.updateTime&&d?.updateTime!==w.updateTime))throw ctx.migrationError_('MIGRATION_FIRESTORE_CONFLICT')}
      for(const w of writes)docs.set(w.path,{data:clone(w.data),updateTime:String(++clock)})
      metrics.writes+=writes.length;metrics.commits++;if(fault)fault('after',writes)
    }}
  return repo
}
function setup(resources=['links']){
  const f=fixture();f.enable();const ref=f.ctx.migrationFreezeBaseline_(f.book,resources),source=f.ctx.migrationReplicaSource_(f.book,ref),repo=repoFixture(f.ctx)
  const step=()=>f.ctx.migrationReplicaStep_(repo,source,ref)
  const drain=()=>{for(let i=0;i<200;i++){const r=f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:3});if(r.status!=='BUDGET_EXHAUSTED')return r}throw Error('did not converge')}
  const read=()=>f.ctx.migrationReadReplica_(repo,ref)
  return {...f,ref,source,repo,step,drain,read,root:'replicaEpochs/'+ref}
}
const add=(f,id='synthetic-worker-create')=>f.post({action:'addLink',operationId:id,department:'Test',title:'Synthetic',url:'https://example.com/'+id})
test('baseline and deltas publish only after page readback; the idle worker writes nothing',()=>{
  const f=setup();assert.throws(f.read);assert.equal(f.drain().status,'IDLE');assert.equal(f.read().resources.links.records.length,0)
  assert.equal(add(f).ok,true)
  assert.equal(f.step().stage,'RUN_CREATED');assert.equal(f.step().stage,'PAGE_STAGED');assert.equal(f.read().resources.links.records.length,0)
  assert.equal(f.step().stage,'PAGE_VERIFIED');assert.equal(f.read().resources.links.records.length,0)
  assert.equal(f.step().stage,'PUBLISHED');assert.equal(f.read().resources.links.records.length,1)
  const count=f.repo.metrics.writes;assert.equal(f.drain().status,'IDLE');assert.equal(f.repo.metrics.writes,count)
})
test('deletions and a multi-resource operation are reconstructed with exact order and metadata',()=>{
  const f=setup(['links','notices']);f.drain();const added=add(f);assert.equal(added.ok,true)
  f.ctx.ensureReleaseNotices_=()=>f.ctx.sourceBook_().getSheetByName('공지').appendRow(['synthetic-notice','Synthetic','Notice','info','2026-11-13',''])
  const row=f.book.getSheetByName('공유링크').getRange(2,1).getValues()[0][0]
  assert.equal(f.post({action:'deleteLink',id:row,adminPassword:'synthetic-admin',operationId:'synthetic-worker-delete'}).ok,true)
  assert.equal(f.journal()[1].touched.length,2);assert.equal(f.drain().status,'IDLE')
  const result=f.read();assert.equal(result.resources.links.records.length,0);assert.equal(result.tombstones.links[row],2);assert.equal(result.resources.notices.records.length,1)
  f.ctx.migrationWithSourceLock_(()=>{for(const r of ['links','notices'])assert.equal(f.ctx.migrationHash_(result.resources[r]),f.ctx.migrationHash_(f.ctx.migrationCaptureResource_(f.book,f.store,r)))})
})
test('lost commit responses at every write boundary resume without duplicate pages or publication',()=>{
  for(const stage of ['INITIALIZED','RUN_CREATED','PAGE_STAGED','PAGE_VERIFIED','PUBLISHED']){
    const f=setup();f.drain();add(f)
    if(stage==='INITIALIZED'){f.repo.docs.clear()}
    let fired=false
    f.repo.setFault((when,writes)=>{
      if(when!=='after'||fired)return
      const d=writes.at(-1).data
      const actual=writes.length===2&&writes[0].path.includes('/pages/')?'PAGE_STAGED':d.phase==='COPYING_BASELINE'?'INITIALIZED':writes.length===2&&d.phase==='MIRRORING'?'PUBLISHED':d.phase==='STAGING'&&d.nextPage===0?'RUN_CREATED':'PAGE_VERIFIED'
      if(actual===stage){fired=true;throw f.ctx.migrationError_('MIGRATION_TRANSPORT_FAILED',true)}
    })
    let result
    for(let i=0;i<30&&!fired;i++)result=f.ctx.migrationRunReplica_(f.repo,f.source,f.ref,{maxSteps:1})
    assert.equal(fired,true,stage);assert.equal(result.status,'RETRY_LATER');f.repo.setFault(null);assert.equal(f.drain().status,'IDLE');assert.equal(f.read().resources.links.records.length,1)
  }
})
test('pending operations block the global cursor and explicit historical recovery never replays the source',()=>{
  const f=setup();f.drain();add(f)
  let sourceSaved=false
  f.book.setFault((kind,sheet)=>{if(kind==='after-write'&&sheet==='공유링크')sourceSaved=true;return sourceSaved&&kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1'})
  assert.equal(add(f,'synthetic-worker-uncertain').ok,true);f.book.setFault(null);assert.equal(f.journal()[1].phase,'PREPARED')
  const id=f.book.getSheetByName('공유링크').getRange(3,1).getValues()[0][0]
  assert.equal(f.post({action:'deleteLink',id,adminPassword:'synthetic-admin',operationId:'synthetic-worker-later-delete'}).ok,true)
  assert.equal(f.drain().status,'NEEDS_REVIEW');assert.equal(f.read().appliedRevision,1)
  const plan=f.ctx.migrationReviewPlan_(f.book,2);assert.equal(plan.changes[0].source,'NEXT_BEFORE_IMAGE');const journal=f.journal()[1]
  assert.throws(()=>f.ctx.migrationConfirmReview_(f.book,plan.planRef,'AUTOMATIC',f.ctx.migrationHash_('Synthetic Admin')))
  const before=JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues())
  assert.equal(f.ctx.migrationConfirmReview_(f.book,plan.planRef,'ACCEPT_OBSERVED_SOURCE',f.ctx.migrationHash_('Synthetic Admin')).accepted,true)
  assert.deepEqual(f.journal()[1],journal);assert.equal(JSON.stringify(f.book.getSheetByName('공유링크').getDataRange().getValues()),before)
  assert.equal(f.store.status().resolvedCount,1);assert.equal(f.drain().status,'IDLE');assert.equal(f.read().resources.links.records.length,1);assert.equal(f.read().tombstones.links[id],3)
  assert.equal(add(f,'synthetic-worker-uncertain').ok,false,'Recovery must not manufacture a success receipt')
  assert.equal(f.ctx.migrationConfirmReview_(f.book,plan.planRef,'ACCEPT_OBSERVED_SOURCE',f.ctx.migrationHash_('Synthetic Admin')).duplicate,true)
})
test('recovery plans reject source changes and revision advances before acceptance',()=>{
  const f=setup();let saved=false;f.book.setFault((kind,sheet)=>{if(kind==='after-write'&&sheet==='공유링크')saved=true;return saved&&kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1'})
  add(f);f.book.setFault(null)
  const plan=f.ctx.migrationReviewPlan_(f.book,1);assert.equal(plan.changes[0].source,'CURRENT_SOURCE')
  f.book.getSheetByName('공유링크').getRange(2,3).setValue('untracked synthetic edit')
  assert.throws(()=>f.ctx.migrationConfirmReview_(f.book,plan.planRef,'ACCEPT_OBSERVED_SOURCE',f.ctx.migrationHash_('Admin')),e=>e.code==='MIGRATION_REVIEW_STALE')
  const fresh=f.ctx.migrationReviewPlan_(f.book,1);add(f,'synthetic-worker-next')
  assert.throws(()=>f.ctx.migrationConfirmReview_(f.book,fresh.planRef,'ACCEPT_OBSERVED_SOURCE',f.ctx.migrationHash_('Admin')),e=>e.code==='MIGRATION_REVIEW_STALE')
  assert.throws(()=>f.ctx.migrationFreezeBaseline_(f.book,['links']),e=>e.code==='MIGRATION_SOURCE_REVIEW_REQUIRED')
})
test('reservation gaps advance without reading current source rows and never reuse revisions',()=>{
  const f=setup();f.drain();f.book.setFault((kind,sheet)=>kind==='before-write'&&sheet==='_UNG_MIG_JOURNAL_V1');assert.equal(add(f).ok,false);f.book.setFault(null)
  assert.equal(add(f,'synthetic-worker-after-gap').ok,true);assert.equal(f.journal()[0].revision,2)
  f.book.events.length=0;assert.equal(f.drain().status,'IDLE');assert.equal(f.read().appliedRevision,2)
  assert.equal(f.book.events.some(e=>e.sheet==='공유링크'&&e.kind==='read-values'),false)
})
test('corrupt staged pages, checkpoints and publication chains never appear verified',()=>{
  const f=setup();f.drain();add(f);f.step();f.step()
  const path=f.root+'/operations/r1/pages/p0';f.repo.docs.get(path).data.entries[0].record.sourceId='corrupt'
  assert.throws(f.step,e=>e.code==='MIGRATION_REPLICA_PAGE_CORRUPT');assert.equal(f.read().appliedRevision,0)
  const g=setup();g.drain();add(g);g.drain();g.repo.docs.get(g.root).data.chainHash='0'.repeat(64)
  assert.throws(g.read,e=>e.code==='MIGRATION_REPLICA_CHAIN_MISMATCH')
})
test('source digest conflicts block before publishing a later operation',()=>{
  const f=setup();f.drain();add(f);f.drain()
  f.book.getSheetByName('공유링크').getRange(2,3).setValue('untracked synthetic edit');add(f,'synthetic-worker-drift')
  assert.throws(f.step,e=>e.code==='MIGRATION_REPLICA_CHAIN_MISMATCH');assert.equal(f.read().appliedRevision,1)
})
test('a competing worker publication between reads is observed safely',()=>{
  const f=setup();f.drain();add(f);f.step();f.step();f.step()
  const get=f.repo.get;let raced=false
  f.repo.get=path=>{const value=get(path);if(path===f.root&&!raced){raced=true;f.step()}return value}
  assert.equal(f.step().stage,'OBSERVED_PUBLICATION');f.repo.get=get;assert.equal(f.drain().status,'IDLE');assert.equal(f.read().resources.links.records.length,1)
})
test('work budgets are enforced and existing page bodies are not downloaded on every tick',()=>{
  const f=fixture();f.enable();for(let i=0;i<105;i++)f.book.getSheetByName('공유링크').appendRow(['synthetic-'+i,'Test','Title','https://example.com','','Synthetic','2026-11-13'])
  const ref=f.ctx.migrationFreezeBaseline_(f.book,['links']),source=f.ctx.migrationReplicaSource_(f.book,ref),repo=repoFixture(f.ctx)
  f.book.events.length=0;let result
  for(let i=0;i<25;i++){result=f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:1});assert.ok(result.steps<=1);if(result.status==='IDLE')break}
  assert.equal(result.status,'IDLE');assert.equal(f.ctx.migrationReadReplica_(repo,ref).resources.links.records.length,105)
  assert.equal(f.book.events.some(e=>e.sheet==='공유링크'&&e.kind==='read-values'),false)
  assert.throws(()=>f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:0}))
})
test('tracking must be active for baseline creation and every replication tick',()=>{
  const f=fixture();assert.throws(()=>f.ctx.migrationFreezeBaseline_(f.book,['links']),e=>e.code==='MIGRATION_TRACKING_REQUIRED')
  const g=setup();g.drain();g.properties.delete('UNG_MIGRATION_TRACKING_V1');const written=g.repo.metrics.writes
  assert.throws(g.step,e=>e.code==='MIGRATION_TRACKING_REQUIRED');assert.equal(g.repo.metrics.writes,written)
})
console.log(`Migration replication: ${passed} groups passed; synthetic sources only.`)
module.exports={repoFixture}
