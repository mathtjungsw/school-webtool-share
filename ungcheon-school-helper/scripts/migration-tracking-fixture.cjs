'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib')
const {makeBook}=require('./migration-sheet-fixture.cjs')
const root=path.resolve(__dirname,'..');
function fixture(){
  const book=makeBook(),properties=new Map();let held=false,locks=0
  const blob=(v,type)=>{const bytes=Buffer.isBuffer(v)?v:typeof v==='string'?Buffer.from(v):Buffer.from(v);return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString('utf8'),getContentType:()=>type||null}}
  const ctx=vm.createContext({console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:()=>crypto.randomUUID(),computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')],newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes())),'application/x-gzip'),ungzip:b=>{assert.equal(b.getContentType(),'application/x-gzip','Apps Script ungzip requires a gzip MIME type');return blob(zlib.gunzipSync(Buffer.from(b.getBytes())))},formatDate:d=>d.toISOString().slice(0,10)},
    SpreadsheetApp:{getActiveSpreadsheet:()=>book,flush:()=>book.flush()},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;locks++},releaseLock(){assert.equal(held,true);held=false}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k)})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({getContent:()=>text,setMimeType(){return this}})},
    CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  })
  for(const f of ['Code.gs','FirestoreRepository.gs','MigrationSync.gs','MigrationAdmin.gs','MigrationJournal.gs','MigrationStore.gs','MigrationCapture.gs','MigrationTracking.gs','MigrationReplication.gs','MigrationRecovery.gs','MigrationOperations.gs'])new vm.Script(fs.readFileSync(path.join(root,'server',f),'utf8'),{filename:f}).runInContext(ctx)
  // Keep initialization synthetic; mark historical one-off seed migrations complete.
  for(const name of ['STAFF_ASSIGNMENTS_2026_APPLIED_KEY','STAFF_NAME_MIGRATION_1_1_30_KEY','STAFF_ROSTER_MIGRATION_1_1_31_KEY','STAFF_ROSTER_FILE_ORDER_1_1_37_KEY','TIMETABLE_OVERRIDE_SEED_KEY','OFFICIAL_RELEASE_NOTICE_RESET_KEY'])properties.set(vm.runInContext(name,ctx),'true')
  ctx.ensureSheets_()
  // Current release notes are public repository content; clear them for small fixtures.
  const notices=book.getSheetByName('공지');if(notices.getLastRow()>1)notices.getRange(2,1,notices.getLastRow()-1,notices.getLastColumn()).clearContent()
  ctx.staffRequire_=body=>{if(body.staffToken!=='test-session')throw Error('AUTH_REQUIRED');if(body.viewerName&&body.viewerName!=='Synthetic Teacher')throw Error('AUTH_FORBIDDEN');return {name:'Synthetic Teacher'}}
  ctx.requireAdmin_=password=>{if(password!=='synthetic-admin')throw Error('ADMIN_REQUIRED')}
  ctx.isAdminPassword_=password=>password==='synthetic-admin'
  // Avoid release-note maintenance in ordinary fixture requests; test maintenance separately.
  ctx.ensureReleaseNotices_=()=>{}
  ctx.migrationInitializeStore_(book)
  const store=ctx.migrationSheetsStore_(book)
  function enable(){properties.set('UNG_MIGRATION_TRACKING_V1',JSON.stringify({schemaVersion:1,enabled:true,sourceBookId:book.getId()}))}
  function post(body){return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({staffToken:'test-session',...body})}}).getContent())}
  function journal(){return book.getSheetByName('_UNG_MIG_JOURNAL_V1').getDataRange().getValues().slice(1).filter(r=>r[1]).map(r=>JSON.parse(r[1]))}
  return {ctx,book,store,properties,enable,post,journal,held:()=>held,locks:()=>locks}
}
module.exports={fixture}
