'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib')
const {makeBook}=require('./migration-sheet-fixture.cjs')
const root=path.resolve(__dirname,'..');let passed=0
const {fixture}=require('./migration-tracking-fixture.cjs')
function test(name,f){f();passed++;console.log('PASS '+name)}
test('disabled mode preserves legacy writes and pure reads never allocate revisions',()=>{
  const f=fixture();assert.equal(f.post({action:'addLink',department:'Test',title:'Link',url:'https://example.com',registeredBy:'Synthetic'}).ok,true);assert.equal(f.journal().length,0)
  f.enable();const n=f.locks();assert.equal(f.post({action:'listLinks'}).ok,true);assert.equal(f.locks(),n);assert.equal(f.journal().length,0)
})
test('real dispatcher records private before-images and changed rows without reading unrelated row bodies',()=>{
  const f=fixture();f.enable();f.book.events.length=0
  const result=f.post({action:'addLink',operationId:'synthetic-link-1',department:'Test',title:'Link',url:'https://example.com',registeredBy:'Synthetic'})
  assert.equal(result.ok,true);const row=f.journal()[0];assert.equal(row.phase,'APPLIED');assert.deepEqual(row.touched.map(t=>t.resource),['links'])
  const delta=f.store.readBlob(row.evidence[0].deltaRef);assert.equal(delta.puts.length,1);assert.equal(delta.deletes.length,0)
  assert.equal(f.store.readBlob(row.touched[0].beforeRef).records.length,0)
  assert.equal(f.book.events.some(e=>e.kind==='read-values'&&e.sheet==='학생명렬'&&(e.row>1||e.rows>1)),false)
  assert.equal(f.held(),false)
})
test('same request replay uses stored response; changed payload and wrong credentials cannot reuse it',()=>{
  const f=fixture();f.enable();const request={action:'addNotice',operationId:'synthetic-notice-1',adminPassword:'synthetic-admin',title:'Notice',body:'Hello',level:'normal',date:'2026-11-13'}
  const first=f.post(request);assert.equal(first.ok,true);assert.deepEqual(f.post(request),first);assert.equal(f.journal().length,1)
  assert.equal(f.post({...request,body:'Changed'}).ok,false)
  assert.match(f.post({...request,adminPassword:'bad'}).error,/ADMIN_REQUIRED/)
  assert.equal(f.post({...request,staffToken:'bad'}).ok,false)
})
test('completed deletion retries after row disappearance and records tombstones',()=>{
  const f=fixture();f.book.getSheetByName('공유링크').appendRow(['row-1','Test','Link','https://example.com','','Synthetic','2026-11-13']);f.enable()
  const request={action:'deleteLink',id:'row-1',operationId:'synthetic-delete-1',adminPassword:'synthetic-admin'}
  assert.equal(f.post(request).ok,true);assert.equal(f.post(request).ok,true)
  const row=f.journal()[0],delta=f.store.readBlob(row.evidence[0].deltaRef);assert.equal(delta.deletes[0].sourceId,'row-1');assert.equal(delta.puts.length,0)
})
test('journal reservation failure stops the source write; partial source failure is not replayed',()=>{
  const f=fixture();f.enable();f.book.setFault((kind,sheet)=>kind==='before-write'&&sheet==='_UNG_MIG_JOURNAL_V1')
  const request={action:'addLink',operationId:'synthetic-fault-1',department:'Test',title:'Link',url:'https://example.com'}
  assert.equal(f.post(request).ok,false);assert.equal(f.book.getSheetByName('공유링크').getLastRow(),1)
  f.book.setFault(null);assert.equal(f.store.status().highWater,1)
  // A lost reservation consumes its revision; the next successful reservation is 2.
  f.book.setFault((kind,sheet)=>kind==='after-write'&&sheet==='공유링크')
  assert.equal(f.post({...request,operationId:'synthetic-fault-2'}).ok,false);assert.equal(f.book.getSheetByName('공유링크').getLastRow(),2)
  f.book.setFault(null);assert.equal(f.post({...request,operationId:'synthetic-fault-2'}).ok,false);assert.equal(f.book.getSheetByName('공유링크').getLastRow(),2)
  assert.equal(f.journal()[0].revision,2)
})
test('failure after source save retains success and leaves a durable pending journal',()=>{
  const f=fixture();f.enable();let sourceSaved=false
  f.book.setFault((kind,sheet)=>{if(kind==='after-write'&&sheet==='공유링크')sourceSaved=true;return sourceSaved&&kind==='before-write'&&sheet==='_UNG_MIG_BLOBS_V1'})
  const request={action:'addLink',operationId:'synthetic-outbox-1',department:'Test',title:'Link',url:'https://example.com'}
  assert.equal(f.post(request).ok,true);f.book.setFault(null);assert.equal(f.journal()[0].phase,'PREPARED');assert.equal(f.post(request).ok,false)
  assert.equal(f.book.getSheetByName('공유링크').getLastRow(),2)
})
test('persistent UUID mapping survives edits and row moves; ambiguous keys are rejected',()=>{
  const f=fixture(),s=f.book.getSheetByName('업무체크응답');s.appendRow(['check-1','Synthetic A','[]','first','2026-11-13']);s.appendRow(['check-2','Synthetic B','[]','second','2026-11-13'])
  f.ctx.migrationWithSourceLock_(()=>{
    const a=f.ctx.migrationCaptureResource_(f.book,f.store,'checklistResponses');const rows=s.getRange(2,1,2,5).getValues();rows.reverse();rows[0][3]='edited';s.getRange(2,1,2,5).setValues(rows)
    const b=f.ctx.migrationCaptureResource_(f.book,f.store,'checklistResponses');assert.equal(a.records[0].sourceId,b.records[1].sourceId);assert.equal(a.records[1].sourceId,b.records[0].sourceId)
    const delta=f.ctx.migrationResourceDelta_(a,b,1);assert.equal(delta.puts.length,2);assert.equal(delta.deletes.length,0)
    s.appendRow(rows[0]);assert.throws(()=>f.ctx.migrationCaptureResource_(f.book,f.store,'checklistResponses'),e=>e.code==='MIGRATION_AMBIGUOUS_SOURCE_ID')
  })
})
test('real legacy locks nest under the common route lock without reacquiring',()=>{
  const f=fixture();f.enable();const before=f.locks()
  const result=f.post({action:'saveCommitteeMembers',operationId:'synthetic-committee-1',committeeId:'committee-test',committeeName:'Test committee',updatedBy:'Synthetic',members:[{name:'Synthetic A',role:'member',source:'direct'}]})
  assert.equal(result.ok,true);assert.equal(f.locks(),before+1);assert.equal(f.held(),false)
})
test('before-image/blob corruption is detected and incomplete captures cannot be completed',()=>{
  const f=fixture();f.enable();assert.equal(f.post({action:'addLink',operationId:'synthetic-corrupt-1',department:'Test',title:'Link',url:'https://example.com'}).ok,true)
  const ref=f.journal()[0].touched[0].beforeRef,s=f.book.getSheetByName('_UNG_MIG_BLOBS_V1'),cell=s.getRange(2,1,s.getLastRow()-1,1).createTextFinder(ref).matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll()[0]
  s.getRange(cell.getRow(),4).setValue('z1:bad');assert.throws(()=>f.store.readBlob(ref))
})
test('untracked direct writes and malformed activation fail closed',()=>{
  const f=fixture();f.enable()
  assert.throws(()=>f.ctx.addLink_({department:'Test',title:'Link',url:'https://example.com'}),e=>e.code==='MIGRATION_UNTRACKED_WRITE')
  assert.equal(f.book.getSheetByName('공유링크').getLastRow(),1)
  f.properties.set('UNG_MIGRATION_TRACKING_V1','invalid')
  assert.equal(f.post({action:'addLink',department:'Test',title:'Link',url:'https://example.com'}).ok,false)
  assert.equal(f.journal().length,0)
})
test('large unused reservation tail is reported without growing or reading beyond the grid',()=>{
  const f=fixture(),s=f.book.getSheetByName('_UNG_MIG_JOURNAL_V1')
  f.book.getSheetByName('_UNG_MIG_META_V1').getRange(2,3).setValue(1200)
  const rows=s.getMaxRows(),status=f.store.status()
  assert.equal(status.highWater,1200);assert.equal(status.reservationGaps,1200);assert.equal(s.getMaxRows(),rows)
  assert.equal(f.ctx.migrationInitializeStore_(f.book).highWater,1200,'Re-initialization must never reset the revision')
})
test('real bulk roster route captures both rows and metadata in one revision',()=>{
  const f=fixture();f.enable()
  const response=f.post({action:'replaceStaffRoster',operationId:'synthetic-roster-bulk',adminPassword:'synthetic-admin',sourceFileName:'synthetic',members:[{id:'synthetic-staff-1',name:'Synthetic A',displayOrder:1},{id:'synthetic-staff-2',name:'Synthetic B',displayOrder:2}]})
  assert.equal(response.ok,true)
  assert.equal(f.journal().length,1)
  assert.deepEqual(f.journal()[0].touched.map(t=>t.resource).sort(),['staff','staffMeta'])
  assert.equal(f.journal()[0].phase,'APPLIED')
  assert.equal(f.held(),false)
})
test('legacy maintenance on a credential route journals only source data, never credentials',()=>{
  const f=fixture();f.enable()
  f.properties.delete('UNG_MIGRATION_SCHEMA_ALL_V1')
  f.ctx.ensureReleaseNotices_=()=>f.ctx.sourceBook_().getSheetByName('공지').appendRow(['synthetic-maintenance','Synthetic','Maintenance','info','2026-11-13',''])
  const response=f.post({action:'registerNeisSyncDevice',operationId:'synthetic-device-register',adminPassword:'synthetic-admin',deviceId:'synthetic-device-id-1234567890',registeredBy:'Synthetic'})
  assert.equal(response.ok,true);assert.ok(response.data.token)
  const record=f.journal()[0];assert.equal(record.phase,'APPLIED');assert.equal(record.replayable,false);assert.equal(record.receiptRef,null)
  const stored=JSON.stringify(f.book.getSheets().filter(s=>s.getName().startsWith('_UNG_MIG_')).map(s=>s.getDataRange().getValues()))
  assert.equal(stored.includes(response.data.token),false);assert.equal(stored.includes('synthetic-admin'),false)
})
test('identity mappings persist across adapter instances and reject aliasing two keys to one UUID',()=>{
  const f=fixture(),s=f.book.getSheetByName('업무체크응답');s.appendRow(['check-1','Synthetic A','[]','first','2026-11-13']);s.appendRow(['check-2','Synthetic B','[]','second','2026-11-13'])
  f.ctx.migrationWithSourceLock_(()=>{
    const first=f.ctx.migrationCaptureResource_(f.book,f.store,'checklistResponses')
    const second=f.ctx.migrationCaptureResource_(f.book,f.ctx.migrationSheetsStore_(f.book),'checklistResponses')
    assert.equal(first.records[0].sourceId,second.records[0].sourceId)
    const map=f.book.getSheetByName('_UNG_MIG_IDS_checklistResponses');map.getRange(3,2).setValue(map.getRange(2,2).getValues()[0][0])
    assert.throws(()=>f.ctx.migrationCaptureResource_(f.book,f.store,'checklistResponses'),e=>e.code==='MIGRATION_ID_MAP_CORRUPT')
  })
})
console.log(`Migration tracking: ${passed} integration groups passed; synthetic Sheets adapter, no live source changed.`)
