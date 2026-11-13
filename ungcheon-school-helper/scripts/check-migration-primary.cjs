'use strict'
process.env.TZ='Asia/Seoul'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {fixture}=require('./migration-tracking-fixture.cjs'),{repoFixture}=require('./migration-replica-fixture.cjs')
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
function setup(seed){
  const f=fixture();for(const name of ['MigrationServing','MigrationBackend','MigrationPrimary','MigrationReturn'])new vm.Script(fs.readFileSync(path.join(__dirname,'../server/'+name+'.gs'),'utf8'),{filename:name}).runInContext(f.ctx)
  f.book.getSheetByName('교원명렬').appendRow(['teacher-1','Synthetic Teacher','교사','Test','Math',''])
  f.book.getSheetByName('교원명렬정보').appendRow([1,'Synthetic','Synthetic','2026-11-13',1])
  if(seed)seed(f);f.enable()
  const ref=f.ctx.migrationFreezeBaseline_(f.book),source=f.ctx.migrationReplicaSource_(f.book,ref),repo=repoFixture(f.ctx),cache=new Map()
  f.ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})}
  for(let i=0;i<100;i++)if(f.ctx.migrationRunReplica_(repo,source,ref,{maxSteps:40}).status==='IDLE')break
  while(f.ctx.migrationServingStep_(repo,ref).status!=='IDLE'){}
  const config={schemaVersion:1,sourceBookId:f.book.getId(),projectId:'ungcheon-school-helper',schoolId:'synthetic-primary',baselineRef:ref,preparedAt:Date.now()-700000,notBefore:Date.now()-100000,deploymentVersion:999,sourceFingerprint:'a'.repeat(64)}
  f.ctx.migrationOperationsSaveConfig_(config);f.ctx.migrationPrimaryRepository_=()=>repo
  const prepared=f.ctx.migrationPreparePrimary_(config,config)
  function drain(){const c=f.ctx.migrationPrimaryConfig_();c.preparedAt-=700000;c.notBefore-=700000;f.ctx.migrationPrimarySave_(c);return f.ctx.migrationFreezePrimarySource_()}
  function activate(){drain();while(f.ctx.migrationVerifyPrimaryStep_().status!=='COMPLETE'){};return f.ctx.migrationActivatePrimary_()}
  function backup(force=false){for(let i=0;i<50;i++){const r=f.ctx.migrationBackupStep_(force);if(r.status==='COMPLETE')return r}throw Error('backup did not finish')}
  function returnToSheets(){f.ctx.migrationBeginReturn_();for(let i=0;i<50;i++){const r=f.ctx.migrationCompleteReturn_();if(r.activeBackend==='SHEETS')return r}throw Error('return did not finish')}
  return {...f,repo,ref,config,prepared,cache,drain,activate,backup,returnToSheets,root:()=>f.ctx.migrationPrimaryRoot_(repo,f.ctx.migrationPrimaryConfig_()).data}
}
const create={action:'addLink',operationId:'synthetic-primary-create',department:'Test',title:'Synthetic',url:'https://example.com',registeredBy:'Synthetic Teacher'}
test('cutover rejects early activation and incomplete parity; queued Sheets writer is fenced',()=>{
  const f=setup();assert.throws(()=>f.ctx.migrationFreezePrimarySource_(),e=>e.code==='MIGRATION_DRAIN_NOT_FINISHED')
  f.drain();assert.throws(()=>f.ctx.migrationActivatePrimary_(),e=>e.code==='MIGRATION_VERIFICATION_INCOMPLETE')
  const rows=f.book.getSheetByName('공유링크').getLastRow();assert.equal(f.post(create).ok,false)
  assert.throws(()=>f.ctx.migrationGatedRoute_(create,{name:'Synthetic Teacher'},()=>{throw Error('must not execute')}),e=>e.code==='MIGRATION_WRITE_PAUSED')
  assert.equal(f.book.getSheetByName('공유링크').getLastRow(),rows)
})
test('production dispatcher writes only Firestore and atomically retains exact retry receipt',()=>{
  const f=setup();assert.equal(f.activate().activeBackend,'FIRESTORE');const events=f.book.events.length,properties=JSON.stringify([...f.properties])
  const first=f.post(create);assert.equal(first.ok,true,first.error);assert.deepEqual(f.post(create),first);assert.equal(f.root().revision,1)
  assert.equal(f.post({...create,title:'different'}).ok,false);assert.equal(f.post({...create,staffToken:'bad'}).ok,false)
  assert.equal(f.post({action:'listLinks'}).data.length,1);assert.equal(f.book.events.length,events);assert.equal(JSON.stringify([...f.properties]),properties)
  const remove={action:'deleteLink',id:first.data.id,operationId:'synthetic-primary-delete',adminPassword:'synthetic-admin'}
  assert.equal(f.post(remove).ok,true);assert.equal(f.post(remove).ok,true);assert.equal(f.post({...remove,adminPassword:'bad'}).ok,false)
  assert.equal(f.root().revision,2);assert.equal(f.post({action:'listLinks'}).data.length,0)
})
test('new deployed source can refresh only an unactivated preparation and restarts its drain barrier',()=>{
  const f=setup(),old=f.ctx.migrationPrimaryConfig_(),next=f.ctx.migrationPreparePrimary_(f.config,{...f.config,sourceFingerprint:'b'.repeat(64),deploymentVersion:1000})
  assert.notEqual(next.epoch,old.epoch);assert.ok(next.notBefore>=old.notBefore);assert.equal(next.sourceFingerprint,'b'.repeat(64))
  f.drain();assert.throws(()=>f.ctx.migrationPreparePrimary_(f.config,{...f.config,sourceFingerprint:'c'.repeat(64),deploymentVersion:1001}),e=>e.code==='MIGRATION_PRIMARY_SETUP_CONFLICT')
})
test('lost atomic commit acknowledgement is resolved from receipt; precommit failure leaves root intact',()=>{
  const f=setup();f.activate();let once=false
  f.repo.setFault((when,writes)=>{if(!once&&when==='after'&&writes.some(x=>x.path.includes('/primaryReceipts/'))){once=true;throw Error('lost acknowledgement')}})
  assert.equal(f.post(create).ok,true);f.repo.setFault(null);assert.equal(f.root().revision,1)
  f.repo.setFault((when,writes)=>{if(when==='before'&&writes.some(x=>x.path.includes('/primaryReceipts/')))throw Error('network failure')})
  assert.equal(f.post({...create,operationId:'synthetic-precommit-fail',title:'Different'}).ok,false);f.repo.setFault(null)
  assert.equal(f.root().revision,1);assert.equal(f.post({action:'listLinks'}).data.length,1)
})
test('cached immutable payload avoids document reads, notices changed heads and survives eviction/corruption',()=>{
  const f=setup();f.activate();f.post(create);f.post({action:'listLinks'});let before=f.repo.metrics.gets
  assert.equal(f.post({action:'listLinks'}).data.length,1);assert.equal(f.repo.metrics.gets-before,1,'only current root is read')
  for(const k of f.cache.keys())f.cache.set(k,'corrupt')
  assert.equal(f.post({action:'listLinks'}).data.length,1)
  assert.equal(f.post({...create,operationId:'synthetic-cache-create-2',title:'Second',url:'https://example.com/second'}).ok,true);assert.equal(f.post({action:'listLinks'}).data.length,2)
  f.cache.clear();assert.equal(f.post({action:'listLinks'}).data.length,2)
  f.repo.setFault((when)=>{if(when==='get')throw Error('offline')});assert.equal(f.post({action:'listLinks'}).ok,false,'never stale Sheets fallback')
})
test('all real staff authentication uses the primary roster and retains existing sessions',()=>{
  const f=setup();new vm.Script(fs.readFileSync(path.join(__dirname,'../server/StaffAuth.gs'),'utf8')).runInContext(f.ctx)
  f.properties.set('UNG_MOBILE_SHARED_PASSWORD_HASH',f.ctx.sha256_('SYNTHETIC_SHARED_ONLY'))
  const login=f.post({action:'staffLogin',name:'Synthetic Teacher',password:'SYNTHETIC_SHARED_ONLY'});assert.equal(login.ok,true)
  const token=login.data.token;f.activate()
  assert.equal(f.post({...create,staffToken:token}).ok,true)
  // Changing only the stale shadow cannot revoke or introduce primary identities.
  f.book.getSheetByName('교원명렬').getRange(2,2).setValue('Stale Shadow Teacher')
  assert.equal(f.post({action:'staffSession',staffToken:token}).ok,true)
  assert.equal(f.post({action:'staffLogin',name:'Stale Shadow Teacher',password:'SYNTHETIC_SHARED_ONLY'}).ok,false)
  assert.equal(f.post({action:'staffSession',staffToken:'bad'}).ok,false)
})
test('mobile token and contract 3 still work through the production switch without full student data',()=>{
  const f=setup();const token=f.ctx.mobileCreateSession_('Synthetic Teacher').accessToken
  f.ctx.Utilities.formatDate=(date,zone,format)=>{assert.equal(zone,'Asia/Seoul');const day=new Date(date.getTime()+9*3600000).toISOString().slice(0,10);return format==='yyyyMMdd'?day.replaceAll('-',''):day}
  const empty={getName:()=> '2026.11.13',getDataRange:()=>({getValues:()=>[['']],getDisplayValues:()=>[['']],getMergedRanges:()=>[],getRow:()=>1,getColumn:()=>1})}
  f.ctx.SpreadsheetApp.openById=()=>({getSheets:()=>[empty],getSheetByName:()=>empty})
  const body={action:'getMobileScheduleBundle',viewerName:'Synthetic Teacher',accessToken:token,fromDate:'2026-11-13',toDate:'2026-11-13'}
  const before=f.post(body);assert.equal(before.ok,true,before.error);f.activate();const after=f.post(body);assert.equal(after.ok,true,after.error)
  const scrub=x=>JSON.parse(JSON.stringify(x,(k,v)=>['servedAt','fetchedAt','lastAttemptAt','lastSuccessAt'].includes(k)?'<time>':v))
  assert.deepEqual(scrub(after),scrub(before));assert.equal(after.data.contractVersion,3)
  assert.equal(f.post({...body,accessToken:'invalid'}).code,'MOBILE_SESSION_EXPIRED')
  assert.equal(f.post({action:'getMobileAttendanceRoster',viewerName:'Synthetic Teacher',accessToken:'invalid',date:'2026-11-13',period:1}).code,'MOBILE_SESSION_EXPIRED')
})
test('bulk rows, metadata and natural-key changes back up and return without losing post-cutover data',()=>{
  const f=setup();f.activate()
  const first=f.post(create);assert.equal(first.ok,true)
  assert.equal(f.post({action:'replaceStudentRoster',operationId:'synthetic-bulk-students',adminPassword:'synthetic-admin',sourceFileName:'synthetic',students:[{studentId:'00123',grade:3,classNumber:1,number:2,name:'Synthetic Student'}]}).ok,true)
  assert.equal(f.post({action:'saveCommitteeMembers',operationId:'synthetic-committee',committeeId:'synthetic-committee',committeeName:'Test',updatedBy:'Synthetic Teacher',members:[{name:'Synthetic Teacher',role:'member',source:'direct'}]}).ok,true)
  f.backup();assert.equal(f.book.getSheetByName('공유링크').getLastRow(),2)
  assert.equal(f.post({action:'deleteLink',id:first.data.id,operationId:'synthetic-return-delete',adminPassword:'synthetic-admin'}).ok,true)
  const before=f.post({action:'getStudentRoster'});f.returnToSheets();assert.equal(f.ctx.migrationPrimaryConfig_().phase,'SHEETS_RETURNED')
  assert.deepEqual(f.post({action:'getStudentRoster'}),before);assert.equal(f.post({action:'listLinks'}).data.length,0)
  assert.equal(f.post({...create,operationId:'synthetic-after-return'}).ok,true);assert.equal(f.book.getSheetByName('공유링크').getLastRow(),2)
  assert.equal(f.ctx.migrationOperationsState_().invalidated,true)
})
test('partial Sheets backup never switches serving; retry reconstructs complete data and freeze rejects writes',()=>{
  const f=setup();f.activate();f.post(create);let failed=false
  f.book.setFault((kind,sheet)=>{if(!failed&&kind==='after-write'&&sheet==='공유링크'){failed=true;return true}return false})
  assert.throws(()=>f.backup(),/injected/);assert.equal(f.ctx.migrationPrimaryConfig_().phase,'FIRESTORE')
  assert.equal(f.post({action:'listLinks'}).data.length,1);f.book.setFault(null);f.backup()
  f.ctx.migrationBeginReturn_();assert.equal(f.post({...create,operationId:'synthetic-frozen-write'}).ok,false)
  const before=f.repo.metrics.writes;assert.equal(f.post({action:'listLinks'}).data.length,1);assert.equal(f.repo.metrics.writes,before)
  f.returnToSheets();assert.equal(f.post({action:'listLinks'}).data.length,1)
})
test('return compares typed values and rechecks every resource after the freeze even if already backed up',()=>{
  const f=setup(g=>{const date=vm.runInContext("new Date('2026-11-12T15:00:00.000Z')",g.ctx);g.book.getSheetByName('공유링크').appendRow(['typed-row','00012','TRUE','https://example.com','',false,date])})
  f.activate();f.backup();f.book.getSheetByName('공유링크').getRange(2,2).setValue(12)
  f.returnToSheets();assert.equal(f.book.getSheetByName('공유링크').getRange(2,2).getValues()[0][0],'00012')
  assert.equal(f.book.getSheetByName('공유링크').getRange(2,6).getValues()[0][0],false)
  assert.equal(f.book.getSheetByName('공유링크').getRange(2,7).getValues()[0][0].toISOString(),'2026-11-12T15:00:00.000Z')
})
test('Sheets return escapes literal apostrophes and formula-like strings without changing their values',()=>{
  const f=setup(),strings=["'literal","''literal",'=1+1','00012','TRUE','2026-11-13','한글']
  const capture={schemaVersion:1,resource:'links',present:true,headers:['id','value'],records:strings.map((v,i)=>({sourceId:'literal-'+i,sortOrder:i,payload:f.ctx.migrationEncode_({cells:['literal-'+i,v],formulas:['','']}),isDeleted:false}))}
  // Use a dedicated synthetic catalog sheet so the assertion includes removal
  // of obsolete old columns, as well as Google-style quote interpretation.
  f.ctx.migrationWithSourceLock_(()=>f.ctx.migrationWriteCaptureToSheet_(f.book,capture))
  const actual=f.ctx.migrationCaptureResource_(f.book,f.store,'links')
  assert.equal(f.ctx.migrationContentDigest_(actual),f.ctx.migrationContentDigest_(capture))
})
console.log(`Migration primary: ${passed} groups passed.`)
