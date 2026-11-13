'use strict'
const assert=require('node:assert/strict'),{fixture}=require('./migration-tracking-fixture.cjs'),{repoFixture}=require('./migration-replica-fixture.cjs')
let passed=0
function test(name,fn){fn();passed++;console.log('PASS '+name)}
const key='SYNTHETIC_BASELINE_JOB'
function finish(f){for(let i=0;i<500;i++){const r=f.ctx.migrationBaselineStep_(f.book,key);assert.equal(f.held(),false);if(r.status==='COMPLETE')return r}throw Error('did not finish')}
test('interleaved writes preserve one R0 and replay deltas to the current state',()=>{
  const f=fixture();f.enable()
  const hashes=f.ctx.migrationWithSourceLock_(()=>Object.fromEntries(f.ctx.migrationCatalog_().map(x=>[x.resource,f.ctx.migrationHash_(f.ctx.migrationCaptureResource_(f.book,f.store,x.resource))])))
  assert.equal(f.ctx.migrationBaselineStep_(f.book,key).baseRevision,0)
  assert.equal(f.post({action:'addLink',operationId:'during-r0-capture',title:'Synthetic',url:'https://example.com',department:'Test'}).ok,true)
  const result=finish(f),source=f.ctx.migrationReplicaSource_(f.book,result.baselineRef),base=source.baseline()
  for(const head of base.descriptor.resources)assert.equal(head.afterDigest,hashes[head.resource])
  assert.equal(base.descriptor.revision,0);assert.equal(finish(f).baselineRef,result.baselineRef)
  const repo=repoFixture(f.ctx);for(let i=0;i<150;i++){if(f.ctx.migrationRunReplica_(repo,source,result.baselineRef,{maxSteps:40}).status==='IDLE')break}
  const current=f.ctx.migrationReadReplica_(repo,result.baselineRef)
  assert.equal(current.appliedRevision,1);assert.equal(current.resources.links.records.length,1)
})
test('a later uncertain operation still provides a valid R0 before-image',()=>{
  const f=fixture();f.enable();f.ctx.migrationBaselineStep_(f.book,key)
  let saved=false;f.book.setFault((kind,sheet)=>{if(kind==='after-write'&&sheet==='공유링크')saved=true;return saved&&kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1'})
  assert.equal(f.post({action:'addLink',operationId:'uncertain-during-copy',title:'Synthetic',url:'https://example.com',department:'Test'}).ok,true);f.book.setFault(null)
  const result=finish(f),source=f.ctx.migrationReplicaSource_(f.book,result.baselineRef)
  assert.equal(source.baseline().descriptor.resources.find(x=>x.resource==='links').count,0)
  assert.equal(source.planAt(1).blockedRevision,1)
})
test('interrupted capture resumes, and paging holds only one page per invocation',()=>{
  const f=fixture();for(let i=0;i<130;i++)f.book.getSheetByName('공유링크').appendRow(['s'+i,'Test','Synthetic','https://example.com','','Synthetic','2026-11-13'])
  f.enable();f.ctx.migrationBaselineStep_(f.book,key)
  const before=f.properties.get(key);f.book.setFault((kind,sheet)=>kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1')
  assert.throws(()=>f.ctx.migrationBaselineStep_(f.book,key));assert.equal(f.properties.get(key),before);assert.equal(f.held(),false);f.book.setFault(null)
  const result=finish(f),source=f.ctx.migrationReplicaSource_(f.book,result.baselineRef),base=source.baseline()
  assert.equal(base.descriptor.resources.find(x=>x.resource==='links').count,130)
  const rows=base.pageRefs.flatMap((_,i)=>source.page(base,i)).filter(x=>x.resource==='links')
  assert.equal(rows.length,130);assert.ok(base.descriptor.pageCounts.every(n=>n<=50))
})
console.log(`Migration baseline: ${passed} groups passed; synthetic sources only.`)
