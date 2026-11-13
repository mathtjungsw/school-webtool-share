'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{fixture}=require('./migration-tracking-fixture.cjs'),{repoFixture}=require('./migration-replica-fixture.cjs')
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
function setup(){
  const f=fixture();new vm.Script(fs.readFileSync(path.join(__dirname,'../server/MigrationServing.gs'),'utf8')).runInContext(f.ctx)
  f.enable();const ref=f.ctx.migrationFreezeBaseline_(f.book),source=f.ctx.migrationReplicaSource_(f.book,ref),repo=repoFixture(f.ctx)
  const archive=()=>{for(let i=0;i<100;i++)if(f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:40}).status==='IDLE')return;throw Error('archive did not converge')}
  const serve=()=>{for(let i=0;i<100;i++)if(f.ctx.migrationServingStep_(repo,ref).status==='IDLE')return;throw Error('serving did not converge')}
  const reader=()=>f.ctx.migrationServingReader_(repo,ref)
  return {...f,ref,source,repo,archive,serve,reader,root:'servingEpochs/'+ref}
}
const add=(f,id='synthetic-serving-create')=>f.post({action:'addLink',operationId:id,title:'Synthetic serving',url:'https://example.com/'+id,department:'Test'})
test('unpublished archives are invisible; baseline and only changed resources become readable',()=>{
  const f=setup();assert.equal(f.ctx.migrationServingStep_(f.repo,f.ref).status,'WAITING_FOR_ARCHIVE');assert.throws(f.reader)
  f.archive();f.serve();assert.equal(f.reader().resource('links').records.length,0)
  assert.equal(add(f).ok,true);f.archive();const result=f.ctx.migrationServingStep_(f.repo,f.ref)
  assert.equal(result.resourcesChanged,1);assert.equal(f.reader().resource('links').records.length,1);f.serve()
  const writes=f.repo.metrics.writes;f.serve();assert.equal(f.repo.metrics.writes,writes)
})
test('readers pin one revision, reuse only requested resources and isolate caller edits',()=>{
  const f=setup();f.archive();f.serve();const reader=f.reader(),gets=f.repo.metrics.gets
  reader.resource('links');const first=f.repo.metrics.gets;assert.ok(first>gets);reader.resource('links');assert.equal(f.repo.metrics.gets,first)
  add(f);f.archive();f.serve();assert.equal(reader.resource('links').records.length,0)
  const next=f.reader(),capture=next.resource('links');capture.records[0].sourceId='caller-edit';assert.notEqual(next.resource('links').records[0].sourceId,'caller-edit')
  assert.equal(next.revision,1);assert.equal(reader.revision,0)
})
test('failed staging and lost publish responses resume without changing the source or exposing partial data',()=>{
  for(const point of ['before','after']){
    const f=setup();f.archive();f.serve();add(f);f.archive();let failed=false
    f.repo.setFault((when,writes)=>{if(!failed&&when===point&&Array.isArray(writes)&&writes.some(x=>x.path===f.root)){failed=true;throw f.ctx.migrationError_('MIGRATION_TRANSPORT_FAILED',true)}})
    assert.throws(()=>f.ctx.migrationServingStep_(f.repo,f.ref));f.repo.setFault(null)
    if(point==='before')assert.equal(f.reader().revision,0)
    f.serve();assert.equal(f.reader().revision,1);assert.equal(f.journal().length,1)
  }
})
test('delete, restore and ordering match the verified archive exactly',()=>{
  const f=setup();f.archive();f.serve();const a=add(f).data;add(f,'synthetic-serving-second')
  assert.equal(f.post({action:'deleteLink',operationId:'synthetic-serving-delete',id:a.id,adminPassword:'synthetic-admin'}).ok,true)
  f.archive();f.serve();const expected=f.ctx.migrationReadReplica_(f.repo,f.ref)
  for(const name of Object.keys(expected.resources))assert.equal(f.ctx.migrationHash_(f.reader().resource(name)),f.ctx.migrationHash_(expected.resources[name]))
  assert.equal(f.reader().resource('links').records.length,1)
})
test('corrupt immutable chunks are rejected rather than served',()=>{
  const f=setup();add(f);f.archive();f.serve();const head=f.repo.docs.get(f.root).data.resources.find(x=>x.resource==='links')
  const manifest=f.repo.docs.get('servingResources/'+head.digest).data,chunk=f.repo.docs.get('servingChunks/'+manifest.chunkRefs[0])
  chunk.data.records[0].sourceId='corrupt';assert.throws(()=>f.reader().resource('links'),e=>e.code==='MIGRATION_SERVING_CORRUPT')
})
test('batchGet restores request order and rejects duplicate, missing and foreign responses',()=>{
  const f=setup(),config={enabled:true,projectId:'demo-ungcheon',schoolId:'synthetic',environment:'EMULATOR'},prefix='projects/demo-ungcheon/databases/(default)/documents/schools/synthetic/'
  let mode='valid'
  const repo=f.ctx.migrationRepository_(config,(method,url,body)=>{
    assert.equal(method,'post');assert.ok(url.endsWith(':batchGet'));assert.equal(body.documents.length,2)
    const first={found:{name:prefix+'synthetic/a',fields:f.ctx.migrationEncode_({marker:'a'}).mapValue.fields,updateTime:'1'}},second={missing:prefix+'synthetic/b'}
    return {status:200,text:JSON.stringify(mode==='duplicate'?[first,first]:mode==='missing'?[first]:mode==='foreign'?[first,{missing:prefix+'synthetic/other'}]:[second,first])}
  })
  const result=repo.batchGet(['synthetic/a','synthetic/b']);assert.equal(result[0].data.marker,'a');assert.equal(result[1],null)
  for(mode of ['duplicate','missing','foreign'])assert.throws(()=>repo.batchGet(['synthetic/a','synthetic/b']),e=>e.code==='MIGRATION_INVALID_RESPONSE')
})
console.log(`Migration serving: ${passed} groups passed; no live backend switch.`)
