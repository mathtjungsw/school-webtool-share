'use strict'
process.env.TZ='Asia/Seoul'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{fixture}=require('./migration-tracking-fixture.cjs'),{repoFixture}=require('./migration-replica-fixture.cjs')
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
function setup(seed){
  const f=fixture();for(const name of ['MigrationServing','MigrationBackend'])new vm.Script(fs.readFileSync(path.join(__dirname,'../server/'+name+'.gs'),'utf8')).runInContext(f.ctx)
  if(seed)seed(f);f.enable();const ref=f.ctx.migrationFreezeBaseline_(f.book),source=f.ctx.migrationReplicaSource_(f.book,ref),repo=repoFixture(f.ctx)
  for(let i=0;i<100;i++)if(f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:40}).status==='IDLE')break
  while(f.ctx.migrationServingStep_(repo,ref).status!=='IDLE'){}
  const read=body=>f.ctx.migrationWithBackend_(f.ctx.migrationServingReader_(repo,ref),f.book.getId(),false,()=>f.ctx.doPost({postData:{contents:JSON.stringify({staffToken:'test-session',...body})}}))
  const write=(body,label='fixture')=>{const request={staffToken:'test-session',...body};return f.ctx.migrationRehearsal_(repo,ref,f.book.getId(),request,{name:'Synthetic Teacher'},()=>f.ctx.doPost({postData:{contents:JSON.stringify(request)}}),label)}
  return {...f,ref,repo,read,write}
}
const normalize=value=>JSON.parse(JSON.stringify(value,(key,val)=>key==='generatedAt'?'<time>':val))
test('actual mobile session checks and minimal schedule contract also use the pinned Firestore reader',()=>{
  const f=setup(g=>{g.book.getSheetByName('교원명렬').appendRow(['teacher-1','Synthetic Teacher','교사','Test','Math','']);g.book.getSheetByName('교원명렬정보').appendRow([1,'Synthetic','Synthetic','2026-11-13',1])})
  const token=f.ctx.mobileCreateSession_('Synthetic Teacher').accessToken
  f.ctx.Utilities.formatDate=(date,zone,format)=>{assert.equal(zone,'Asia/Seoul');const day=new Date(date.getTime()+9*3600000).toISOString().slice(0,10);return format==='yyyyMMdd'?day.replaceAll('-',''):day}
  // External input sources remain separate Sheets. Empty synthetic external
  // sources are deliberately not copied into the Firestore school snapshot.
  const empty={getName:()=> '2026.11.13',getDataRange:()=>({getValues:()=>[['']],getDisplayValues:()=>[['']],getMergedRanges:()=>[],getRow:()=>1,getColumn:()=>1})}
  f.ctx.SpreadsheetApp.openById=()=>({getSheets:()=>[empty],getSheetByName:()=>empty})
  const body={action:'getMobileScheduleBundle',viewerName:'Synthetic Teacher',accessToken:token,fromDate:'2026-11-13',toDate:'2026-11-13'}
  const original=f.post(body),preview=f.read(body),actual=JSON.parse(preview.response.getContent())
  assert.equal(original.ok,true,original.error);assert.equal(actual.ok,true,actual.error);assert.equal(actual.data.contractVersion,3)
  const scrub=x=>JSON.parse(JSON.stringify(x,(key,value)=>['servedAt','fetchedAt','lastAttemptAt','lastSuccessAt'].includes(key)?'<time>':value))
  assert.deepEqual(scrub(actual),scrub(original));assert.equal(Array.from(preview.loaded).includes('students'),false)
  const denied=f.read({...body,accessToken:'invalid'});assert.equal(JSON.parse(denied.response.getContent()).code,'MOBILE_SESSION_EXPIRED');assert.deepEqual(Array.from(denied.loaded),['staff','staffMeta'])
  assert.equal(f.ctx.sourceCacheEnabled_(),true)
})
test('actual PC read responses match Sheets and fetch only the requested resource',()=>{
  const f=setup(g=>g.book.getSheetByName('공유링크').appendRow(['id-1','Test','Synthetic','https://example.com','','Synthetic','2026-11-13']))
  for(const action of ['listLinks','listNotices','listFeatureRequests','getTimetable','getStudentTimetable','getStaffRoster','getStudentRoster','listStaffChecklists','listCommitteeState','listTimetableChanges','getTimetableOverrides','getNeisSnapshot','getSyncManifest']){
    const body={action,viewerName:'Synthetic Teacher'},expected=f.post(body),result=f.read(body),actual=JSON.parse(result.response.getContent())
    assert.equal(expected.ok,true,action+': '+expected.error);assert.deepEqual(normalize(actual),normalize(expected),action)
    if(action==='listLinks')assert.deepEqual(Array.from(result.loaded),['links'])
  }
  assert.equal(f.ctx.migrationBackendContext_,null);assert.equal(f.journal().length,0)
})
test('checklist writes persist their change notification version only inside the rehearsal root',()=>{
  const f=setup(g=>{g.book.getSheetByName('교원명렬').appendRow(['teacher-1','Synthetic Teacher','교사','Test','Math','']);g.book.getSheetByName('교원명렬정보').appendRow([1,'Synthetic','Synthetic','2026-11-13',1])})
  f.properties.set('UNG_SYNC_RESOURCE_staffChecklists','v:9:synthetic-existing')
  const before=JSON.stringify([...f.properties]),locks=f.locks()
  const result=f.write({action:'addStaffChecklist',operationId:'rehearsal-checklist-1',creatorName:'Synthetic Teacher',title:'Synthetic checklist',startDate:'2026-11-13',targetNames:['Synthetic Teacher'],items:['Synthetic item']})
  assert.equal(JSON.parse(result.response).ok,true,result.response)
  const reader=f.ctx.migrationRehearsalReader_(f.repo,f.ref,f.book.getId(),'fixture')
  const manifest=f.ctx.migrationWithBackend_(reader,f.book.getId(),false,()=>f.ctx.getSyncManifest_()).response
  assert.match(manifest.resources.staffChecklists,/^v:10:/)
  assert.equal(JSON.stringify([...f.properties]),before);assert.equal(f.locks(),locks)
  assert.equal(f.ctx.migrationServingReader_(f.repo,f.ref).resource('checklists').records.length,0)
})
test('native TRUE/FALSE display preserves timetable override change-detection hashes',()=>{
  const f=setup(g=>g.book.getSheetByName('일일시간표예외').appendRow(['synthetic-override','2026-11-13','3','',1,'clear','',0,'Synthetic',true,'Synthetic','2026-11-13','2026-11-13']))
  assert.deepEqual(normalize(JSON.parse(f.read({action:'getSyncManifest'}).response.getContent())),normalize(f.post({action:'getSyncManifest'})))
  const reader=f.ctx.migrationServingReader_(f.repo,f.ref),facade=f.ctx.migrationSnapshotBook_(reader,f.book.getId(),false)
  assert.equal(facade.book.getSheetByName('일일시간표예외').getRange(2,10).getDisplayValues()[0][0],'TRUE')
})
test('real create/update/delete rehearsal commits atomically without touching Sheets, properties or journal',()=>{
  const f=setup(),events=f.book.events.length,properties=JSON.stringify([...f.properties])
  const first=f.write({action:'addFeatureRequest',operationId:'rehearsal-create',requestType:'improvement',title:'Synthetic request',content:'Synthetic content',author:'Synthetic Teacher'})
  assert.equal(JSON.parse(first.response).ok,true,first.response);const id=JSON.parse(first.response).data.id
  const update=f.write({action:'updateFeatureRequest',operationId:'rehearsal-update',id,status:'completed',adminReply:'Synthetic',adminPassword:'synthetic-admin'})
  assert.equal(JSON.parse(update.response).ok,true,update.response)
  const reader=f.ctx.migrationRehearsalReader_(f.repo,f.ref,f.book.getId(),'fixture')
  const read=f.ctx.migrationWithBackend_(reader,f.book.getId(),false,()=>f.post({action:'listFeatureRequests'}))
  assert.equal(read.response.data.length,1);assert.equal(read.response.data[0].status,'completed')
  const remove=f.write({action:'deleteFeatureRequest',operationId:'rehearsal-delete',id,adminPassword:'synthetic-admin'})
  assert.equal(JSON.parse(remove.response).ok,true);assert.equal(remove.revision,3)
  assert.equal(f.book.events.length,events);assert.equal(JSON.stringify([...f.properties]),properties);assert.equal(f.journal().length,0)
  assert.equal(f.ctx.migrationServingReader_(f.repo,f.ref).resource('featureRequests').records.length,0)
  assert.equal(f.ctx.migrationRehearsalReader_(f.repo,f.ref,f.book.getId(),'fixture').resource('featureRequests').records.length,0)
})
test('lost commit response retries exactly once; bad authorization and changed payload cannot replay',()=>{
  const f=setup(),body={action:'addNotice',operationId:'rehearsal-notice',title:'Synthetic',body:'Synthetic body',date:'2026-11-13',adminPassword:'synthetic-admin'};let failed=false
  f.repo.setFault((when,writes)=>{if(!failed&&when==='after'&&writes.some(x=>x.path.includes('/rehearsalReceipts/'))){failed=true;throw Error('lost commit response')}})
  assert.throws(()=>f.write(body));f.repo.setFault(null)
  const replay=f.write(body);assert.equal(replay.replayed,true);assert.equal(replay.revision,1)
  assert.throws(()=>f.write({...body,adminPassword:'bad'}),/ADMIN_REQUIRED/)
  assert.throws(()=>f.write({...body,title:'Changed'}),e=>e.code==='MIGRATION_OPERATION_CONFLICT')
  assert.equal(f.journal().length,0)
})
test('concurrent atomic writer wins without lost data; the conflicted operation retries against the new root',()=>{
  const f=setup(),body={action:'addLink',operationId:'rehearsal-concurrent-a',title:'Synthetic A',url:'https://example.com/a',department:'Test'};let raced=false
  f.repo.setFault((when,writes)=>{if(!raced&&when==='before'&&writes.some(x=>x.path.includes('/rehearsalReceipts/'))){raced=true;f.repo.setFault(null);const other=f.write({...body,operationId:'rehearsal-concurrent-b',title:'Synthetic B',url:'https://example.com/b'});assert.equal(other.committed,true)}})
  assert.throws(()=>f.write(body),e=>e.code==='MIGRATION_FIRESTORE_CONFLICT')
  const reader=()=>f.ctx.migrationRehearsalReader_(f.repo,f.ref,f.book.getId(),'fixture')
  assert.equal(reader().resource('links').records.length,1);assert.equal(f.write(body).revision,2);assert.equal(reader().resource('links').records.length,2)
  assert.equal(f.write(body).replayed,true);assert.equal(f.ctx.migrationServingReader_(f.repo,f.ref).resource('links').records.length,0)
})
test('failed business request discards partial overlay and cannot escape to credentials or live caches',()=>{
  const f=setup(),properties=JSON.stringify([...f.properties]),reader=f.ctx.migrationServingReader_(f.repo,f.ref)
  assert.throws(()=>f.ctx.migrationWithBackend_(reader,f.book.getId(),false,()=>f.ctx.sourceBook_().getSheetByName('공유링크').appendRow(['bad'])),e=>e.code==='MIGRATION_READ_ONLY')
  assert.throws(()=>f.ctx.migrationWithBackend_(reader,f.book.getId(),true,()=>f.ctx.sourceProperties_().setProperty('UNG_ADMIN_PASSWORD_SHA256','forbidden')),e=>e.code==='MIGRATION_REHEARSAL_PROPERTY_FORBIDDEN')
  f.ctx.migrationWithBackend_(reader,f.book.getId(),true,()=>{f.ctx.touchSyncResource_('staffChecklists');assert.equal(f.ctx.sourceCacheEnabled_(),false);return {ok:true}})
  assert.equal(JSON.stringify([...f.properties]),properties)
  for(const action of ['initialSetup','verifyMobileViewer','registerNeisSyncDevice','changeExecutivePassword','previewMigrationRequest'])assert.equal(f.ctx.migrationPreviewActionAllowed_(action,true),false)
  assert.equal(f.ctx.migrationBackendContext_,null)
})
test('row ordering, blank rows, primitive types, formulas and stable natural keys survive reconstruction',()=>{
  const f=setup(g=>{const s=g.book.getSheetByName('업무체크응답');s.appendRow(['c-1','Synthetic Teacher','[]','memo','2026-11-13']);s.appendRow(['c-2','Another Teacher','[]','memo2','2026-11-13'])})
  const reader=f.ctx.migrationServingReader_(f.repo,f.ref),before=reader.resource('checklistResponses'),facade=f.ctx.migrationSnapshotBook_(reader,f.book.getId(),true)
  facade.book.getSheetByName('업무체크응답').deleteRow(2);facade.book.getSheetByName('업무체크응답').getRange(2,4).setValue('changed')
  const after=facade.changed()[0];assert.equal(after.records[0].sourceId,before.records[1].sourceId);assert.equal(after.records[0].sortOrder,0)
  assert.throws(()=>facade.book.getSheetByName('업무체크응답').getRange(2,4).setValue('=1+1'),e=>e.code==='MIGRATION_FORMULA_WRITE_UNSUPPORTED')
})
console.log(`Migration backend: ${passed} groups passed; primary remains Sheets.`)
