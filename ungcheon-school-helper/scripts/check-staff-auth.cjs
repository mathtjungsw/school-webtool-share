const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const props=new Map(),cache=new Map();const password='synthetic-secret'
const digest=v=>crypto.createHash('sha256').update(String(v)).digest('base64')
props.set('UNG_MOBILE_SHARED_PASSWORD_HASH',digest(password))
const context=vm.createContext({Date,JSON,Error,Number,String,Array,Object,Math,
 PropertiesService:{getScriptProperties:()=>({getProperties:()=>Object.fromEntries(props),getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(v,k)=>[...crypto.createHmac('sha256',k).update(v).digest()],base64Encode:b=>Buffer.from(b).toString('base64')},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
})
vm.runInContext(fs.readFileSync('server/Code.gs','utf8'),context)
vm.runInContext(fs.readFileSync('server/StaffAuth.gs','utf8'),context)
context.sha256_=digest;context.mobileAssertViewer_=name=>{if(name!=='테스트교사')throw new Error('invalid');return name}
const post=b=>context.doPost({postData:{contents:JSON.stringify(b)}})
for(const action of ['getStaffRoster','getStudentRoster','getStudentTimetable','getSyncManifest','listNotices','verifyAdmin','getWidgetAttendanceSummaries','caseLibrary','caseDocument'])assert.equal(post({action}).ok,false,action)
assert.equal(post({action:'staffLogin',name:'테스트교사',password:'wrong'}).ok,false)
assert.equal(post({action:'staffLogin',name:'미등록',password}).ok,false)
const login=post({action:'staffLogin',name:'테스트교사',password});assert.equal(login.ok,true);assert.ok(Math.abs(Date.parse(login.data.expiresAt)-Date.now()-120*3600000)<10000);const token=login.data.token
const pdf=Buffer.from('%PDF-synthetic-private-document'),revision=crypto.createHash('sha256').update(pdf).digest('hex');let corrupt=false
props.set('UNG_CASE_STORAGE_SPREADSHEET','synthetic-index')
context.Utilities.DigestAlgorithm={SHA_256:'sha256'}
context.Utilities.base64Decode=value=>[...Buffer.from(value,'base64')]
context.Utilities.computeDigest=(_,bytes)=>[...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()]
context.SpreadsheetApp={openById:id=>({getSheets:()=>[{getLastRow:()=>id==='synthetic-index'?2:1,getRange:()=>({getValues:()=>[['fixture','합성 자료집',revision,pdf.length,revision,'synthetic-book']],getDisplayValues:()=>[['b64:'+(corrupt?Buffer.from('corrupt'):pdf).toString('base64')]]})}]})}
const library=post({action:'caseLibrary',staffToken:token});assert.equal(library.ok,true);assert.equal(library.data[0].id,'fixture');assert.equal(library.data[0].spreadsheetId,undefined)
const document=post({action:'caseDocument',staffToken:token,id:'fixture'});assert.equal(document.ok,true);assert.equal(document.data.data,pdf.toString('base64'))
assert.equal(post({action:'caseDocument',staffToken:token,id:'other-document'}).ok,false)
corrupt=true;assert.equal(post({action:'caseDocument',staffToken:token,id:'fixture'}).ok,false)
assert.equal(post({action:'staffSession',staffToken:token}).ok,true)
assert.equal(post({action:'staffSession',staffToken:'forged'}).ok,false)
assert.equal(post({action:'staffSession',staffToken:token,viewerName:'다른교사'}).ok,false)
assert.ok(![...props.values()].some(v=>v===token||v.includes(password)))
assert.equal(post({action:'staffLogout',staffToken:token}).ok,true)
assert.equal(post({action:'staffSession',staffToken:token}).ok,false)
const second=post({action:'staffLogin',name:'테스트교사',password});assert.equal(second.ok,true)
props.set('UNG_MOBILE_SHARED_PASSWORD_HASH',digest('rotated-synthetic-secret'))
assert.equal(post({action:'staffSession',staffToken:second.data.token}).ok,false)
assert.equal(props.get('UNG_MOBILE_SHARED_PASSWORD_HASH'),digest('rotated-synthetic-secret'))
console.log('PASS 120-hour expiry contract, protected central documents, private pointer omission, byte-integrity rejection and password-change session invalidation')
console.log('PASS real Apps Script dispatcher: protected action rejection, credential checks, issued sessions, subject binding, hashed tokens and revocation')
// Use a synthetic identity; never copy operational login names into fixtures.
const extraName='추가로그인시험',extraHash=digest(extraName)
const originals=vm.runInContext('STAFF_ADDITIONAL_LOGIN_NAME_HASHES.slice()',context)
assert.ok(originals.every(v=>/^[A-Za-z0-9+/]{43}=$/.test(v)))
context.__extraHash=extraHash
vm.runInContext('STAFF_ADDITIONAL_LOGIN_NAME_HASHES.push(__extraHash)',context)
props.set('UNG_MOBILE_SHARED_PASSWORD_HASH',digest(password))
let rosterReads=0
context.mobileAssertViewer_=name=>{rosterReads++;if(name!=='테스트교사')throw new Error('Not in roster');return name}
assert.equal(post({action:'staffLogin',name:extraName,password:'wrong'}).ok,false)
const extra=post({action:'staffLogin',name:' '+extraName+' ',password});assert.equal(extra.ok,true)
assert.equal(extra.data.name,extraName);assert.ok(Math.abs(Date.parse(extra.data.expiresAt)-Date.now()-120*3600000)<10000)
assert.equal(post({action:'staffSession',staffToken:extra.data.token}).ok,true)
assert.equal(rosterReads,0,'Additional login must not require or change roster data')
// The mobile-only harness below checks the shared allowlist with the real membership function.
// This harness substitutes mobileAssertViewer_ to isolate desktop authentication.
assert.equal(post({action:'staffLogin',name:'미등록추가이름',password}).ok,false)
assert.equal(post({action:'staffSession',staffToken:extra.data.token,viewerName:'다른이름'}).ok,false)
vm.runInContext('STAFF_ADDITIONAL_LOGIN_NAME_HASHES.pop()',context)
assert.equal(post({action:'staffSession',staffToken:extra.data.token}).ok,false,'Removed allowlist identity must lose access')
assert.equal(post({action:'staffSession',staffToken:second.data.token}).ok,true,'Existing roster session must survive allowlist changes')
assert.equal(post({action:'staffLogout',staffToken:second.data.token}).ok,true)
console.log('PASS separate desktop login allowlist, required password, 120-hour session, no roster write/read for extra identity, existing session preservation and access removal')
