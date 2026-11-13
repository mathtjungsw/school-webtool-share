'use strict'
// Fault-injection protocol checks. No production journal adapter or network calls.
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
let locks=0,releases=0,held=false,failLock=false,passed=0
const runtime=vm.createContext({
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],newBlob:s=>({getBytes:()=>Buffer.from(s)})},
  LockService:{getScriptLock:()=>({waitLock:()=>{if(failLock)throw Error('lock timeout');assert.equal(held,false);held=true;locks++},releaseLock:()=>{assert.equal(held,true);held=false;releases++}})},
})
for(const f of ['FirestoreRepository.gs','MigrationAdmin.gs','MigrationJournal.gs'])new vm.Script(fs.readFileSync(path.join(__dirname,'../server',f),'utf8'),{filename:f}).runInContext(runtime)
const clone=v=>JSON.parse(JSON.stringify(v))
const context={actorHash:'a'.repeat(64),requestHash:'b'.repeat(64),action:'saveCommitteeMembers',operationId:'synthetic-operation-1',resources:['committees']}
const evidence=[{resource:'committees',digest:'c'.repeat(64),count:1,snapshotRef:'synthetic/revision-1'}]
function test(name,f){f();assert.equal(held,false);assert.equal(locks,releases);passed++;console.log('PASS '+name)}
function code(f,c){assert.throws(f,e=>e.code===c&&!e.message.includes('SECRET'))}
function fixture(){
  const records=new Map(),events=[]
  let revision=0,writes=0,fault='',loadCount=0,value={id:'synthetic-row-1'}
  function trip(p){if(fault===p)throw Error('SECRET remote response')}
  const io={
    authorize(){events.push('authorize');trip('authorize')},
    validate(){events.push('validate');trip('validate')},
    load(key){events.push('load');trip('load');loadCount++;if(fault==='load-after-reserve'&&loadCount===2)trip(fault);return records.has(key)?clone(records.get(key)):null},
    reserve(intent){events.push('reserve');trip('reserve-before');const row=runtime.migrationPreparedOperation_(intent,++revision);records.set(intent.operationKey,clone(row));trip('reserve-after')},
    applySource(){events.push('source');writes++;trip('source');return value},
    flushSource(){events.push('flush');trip('flush')},
    captureAfter(){events.push('capture');trip('capture');return clone(evidence)},
    complete(record){events.push('complete');trip('complete-before');records.set(record.intent.operationKey,clone(record));trip('complete-after')},
  }
  return {io,records,events,setFault:f=>{fault=f},setValue:v=>{value=v},writes:()=>writes,run:(c=context)=>runtime.migrationExecuteTracked_(c,io)}
}
test('nested common locks acquire once and release after exceptions',()=>{
  const before=locks
  assert.throws(()=>runtime.migrationWithSourceLock_(()=>runtime.migrationWithSourceLock_(()=>{throw Error('expected')})))
  assert.equal(locks,before+1)
  runtime.migrationWithSourceLock_(()=>{})
  failLock=true;assert.throws(()=>runtime.migrationWithSourceLock_(()=>assert.fail('must not run')));failLock=false
})
test('durable intent precedes source; identical retry returns original result without applying again',()=>{
  const f=fixture();const first=f.run();assert.equal(first.status,'SOURCE_SAVED');assert.equal(first.revision,1)
  assert.deepEqual(f.events,['authorize','load','validate','reserve','load','source','flush','capture','complete','load'])
  const again=f.run();assert.equal(again.duplicate,true);assert.deepEqual(clone(again.value),{id:'synthetic-row-1'});assert.equal(f.writes(),1)
})
test('authorization is checked on initial and duplicate requests before journal/source access',()=>{
  const f=fixture();f.setFault('authorize');assert.throws(()=>f.run());assert.equal(f.records.size,0);assert.equal(f.writes(),0)
  f.setFault('');f.run();f.setFault('authorize');assert.throws(()=>f.run());assert.equal(f.writes(),1)
})
test('new invalid operations never reserve; completed delete can retry after its source row is gone',()=>{
  const f=fixture();f.setFault('validate');assert.throws(()=>f.run());assert.equal(f.records.size,0);assert.equal(f.writes(),0)
  f.setFault('');f.run();f.setFault('validate');assert.equal(f.run().duplicate,true);assert.equal(f.writes(),1)
})
test('same operation ID with altered content or resource scope conflicts; actor scopes stay separate',()=>{
  const f=fixture();f.run()
  code(()=>f.run({...context,requestHash:'d'.repeat(64)}),'MIGRATION_OPERATION_CONFLICT')
  code(()=>f.run({...context,resources:['staff']}),'MIGRATION_OPERATION_CONFLICT')
  assert.equal(f.run({...context,actorHash:'e'.repeat(64)}).revision,2);assert.equal(f.writes(),2)
})
test('nested tracked operations cannot allocate conflicting revisions inside an active mutation',()=>{
  const f=fixture(),inner=fixture()
  f.io.applySource=()=>{code(()=>inner.run(),'MIGRATION_NESTED_OPERATION');return {id:'synthetic-row-1'}}
  assert.equal(f.run().status,'SOURCE_SAVED');assert.equal(inner.records.size,0)
  assert.equal(inner.run({...context,operationId:'independent-next-operation'}).status,'SOURCE_SAVED')
})
test('intent failure before or after persistence never writes the source or exposes raw errors',()=>{
  for(const fault of ['reserve-before','reserve-after','load','load-after-reserve']){
    const f=fixture();f.setFault(fault)
    code(()=>f.run(),fault.startsWith('load')?'MIGRATION_JOURNAL_UNAVAILABLE':'MIGRATION_INTENT_NOT_CONFIRMED')
    assert.equal(f.writes(),0)
    if(f.records.size){f.setFault('');code(()=>f.run(),'MIGRATION_SOURCE_REVIEW_REQUIRED');assert.equal(f.writes(),0)}
  }
})
test('partial source write or flush failure remains uncertain and is never automatically replayed',()=>{
  for(const fault of ['source','flush']){
    const f=fixture();f.setFault(fault);code(()=>f.run(),'MIGRATION_SOURCE_OUTCOME_UNKNOWN');assert.equal(f.writes(),1)
    f.setFault('');code(()=>f.run(),'MIGRATION_SOURCE_REVIEW_REQUIRED');assert.equal(f.writes(),1)
  }
})
test('capture/journal failure after saved source preserves success and leaves durable review work',()=>{
  for(const fault of ['capture','complete-before']){
    const f=fixture();f.setFault(fault);const result=f.run()
    assert.equal(result.status,'SOURCE_SAVED_TRACKING_PENDING');assert.deepEqual(clone(result.value),{id:'synthetic-row-1'})
    assert.equal([...f.records.values()][0].phase,'PREPARED')
    f.setFault('');code(()=>f.run(),'MIGRATION_SOURCE_REVIEW_REQUIRED');assert.equal(f.writes(),1)
  }
})
test('lost completion response recovers original receipt on retry without a second source write',()=>{
  const f=fixture();f.setFault('complete-after');assert.equal(f.run().status,'SOURCE_SAVED_TRACKING_PENDING')
  f.setFault('');assert.equal(f.run().duplicate,true);assert.equal(f.writes(),1)
})
test('journal corruption, unsafe context and missing snapshot evidence cannot appear as tracked success',()=>{
  const f=fixture();f.run();[...f.records.values()][0].revision=900
  code(()=>f.run(),'MIGRATION_JOURNAL_CORRUPT')
  for(const change of [{resources:['staff','staff']},{resources:['attendance']},{actorHash:'name'},{operationId:'bad/id'}])code(()=>fixture().run({...context,...change}),'MIGRATION_INVALID_OPERATION')
  for(const invalid of [[],[null],[{...evidence[0],snapshotRef:'../source'}],[{...evidence[0],snapshotRef:'/'}],[{...evidence[0],digest:'bad'}]]){
    const g=fixture();g.io.captureAfter=()=>invalid;assert.equal(g.run().status,'SOURCE_SAVED_TRACKING_PENDING')
  }
})
test('credentials and oversized receipts are not persisted; source success remains intact',()=>{
  for(const value of [{nested:{staffToken:'SECRET'}},{password:'SECRET'},{data:'x'.repeat(45000)}]){
    const f=fixture();f.setValue(value);assert.equal(f.run().status,'SOURCE_SAVED_TRACKING_PENDING')
    const saved=JSON.stringify([...f.records.values()]);assert.equal(saved.includes('SECRET'),false);assert.equal(saved.includes('x'.repeat(100)),false)
  }
})
console.log(`Migration journal: ${passed} groups passed. Synthetic protocol only; live adapter and route integration are not enabled.`)
