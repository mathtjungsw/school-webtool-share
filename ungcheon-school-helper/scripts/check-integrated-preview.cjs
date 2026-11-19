'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),xlsx=require('xlsx')
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file)
async function run(){
 const grade=require('../src/services/gradePreview.ts'),state=grade.defaultGradePreviewState();state.components[0].scores['1-2']={classNo:1,studentNo:2,studentName:'QA_STUDENT_10102',rawScore:83,status:'응시'}
 for(let i=3;i<=218;i++){const key='1-'+i;state.components[0].scores[key]={classNo:1,studentNo:i,studentName:'가상학생'+i,rawScore:i%101,status:'응시'}}
 for(const mode of ['settings','full']){
   const output=grade.exportRestoreWorkbook(state,'시험과목',mode),file=new File([Uint8Array.from(output.bytes)],output.name), wb=xlsx.read(await file.arrayBuffer(),{type:'array'});
   const restored=await grade.importRestoreWorkbook(file);assert.equal(restored.subjectName,'시험과목');const contains=Object.values(wb.Sheets).some(sheet=>Object.values(sheet).some(cell=>cell?.v==='QA_STUDENT_10102'));assert.equal(contains,mode==='full');assert.equal(wb.SheetNames.includes('SCORES'),mode==='full');assert.equal(Object.values(restored.state.components[0].scores).length,mode==='full'?217:0);if(mode==='full')assert.equal(Object.values(restored.state.components[0].scores)[0].rawScore,83)
 }
 console.log('PASS XLSX settings-only and full restore round trips, 217 synthetic student rows')
 const props=new Map([['UNG_PRIVATE_REPO','sample/school'],['UNG_PRIVATE_WRITE_TOKEN','writer'],['UNG_PRIVATE_READ_TOKEN','reader']]),cache=new Map(),rev='1'.repeat(40);let isPrivate=false,content='',writes=0;const propsApi={getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)};
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>propsApi},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},Utilities:{Charset:{UTF_8:'utf8'},base64Encode:t=>Buffer.from(t).toString('base64'),base64Decode:t=>Buffer.from(t,'base64'),newBlob:b=>({getDataAsString:()=>b.toString()})},UrlFetchApp:{fetch:(url,opts)=>{assert.equal(opts.followRedirects,false);let value;if(url.endsWith('/repos/sample/school')){value={private:isPrivate}}else if(opts.method==='put'){assert.equal(opts.headers.Authorization,'Bearer writer');content=JSON.parse(opts.payload).content;writes++;value={commit:{sha:rev}}}else{assert.equal(opts.headers.Authorization,'Bearer reader');assert.ok(url.endsWith('?ref='+rev));value={content,encoding:'base64',sha:'b'.repeat(40)}}return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)}}}})
 vm.runInContext(fs.readFileSync('server/PrivateSchoolData.gs','utf8'),ctx)
 const data={version:1,uploadedAt:'2026-11-18T00:00:00.000Z',members:[{name:'가상교사',position:'교사'}]}
 const newer={...data,version:2,uploadedAt:'2026-11-18T00:00:01.000Z'}
 assert.equal(ctx.privateSchoolRevision_('staffRoster'),'')
 props.set('UNG_PRIVATE_ACTIVE_COMMIT',rev)
 assert.throws(()=>ctx.privateSchoolPublish_('staffRoster',data))
 assert.equal(writes,0)
 isPrivate=true
 ctx.privateSchoolPublish_('staffRoster',data)
 assert.equal(writes,1)
 assert.equal(ctx.privateSchoolRead_('staffRoster').members[0].name,'가상교사')
 assert.equal(ctx.privateSchoolRevision_('staffRoster'),rev)
 assert.throws(()=>ctx.privateSchoolValidateInput_({students:[{name:'가상',원점수:80}]}))
 ctx.iso_=value=>value
 ctx.privateSchoolMetadata_=()=>data
 assert.equal(ctx.privateSchoolServe_('staffRoster',()=>newer).version,1)
 ctx.privateSchoolMetadata_=()=>newer
 assert.equal(ctx.privateSchoolServe_('staffRoster',()=>newer).version,2)
 ctx.migrationWithBackend_=()=>({response:newer})
 ctx.migrationPrimaryReader_=()=>({})
 const save=ctx.privateSchoolPublish_
 let published=null
 ctx.privateSchoolPublish_=(group,next)=>{published={group,next}}
 ctx.privateSchoolMirrorAfterWrite_({}, {}, {action:'replaceStaffRoster'}, {getContent:()=>JSON.stringify({ok:false})})
 assert.equal(published,null)
 ctx.privateSchoolMirrorAfterWrite_({}, {}, {action:'replaceStaffRoster'}, {getContent:()=>JSON.stringify({ok:true,data})})
 assert.equal(published,null)
 ctx.privateSchoolMirrorAfterWrite_({}, {}, {action:'replaceStaffRoster'}, {getContent:()=>JSON.stringify({ok:true,data:newer})})
 assert.equal(published?.next.version,2)
 ctx.privateSchoolPublish_=save
 console.log('PASS private-repository visibility, split credentials, pinned version, fresh Firestore fallback and post-commit mirroring')
 const pinnedRead=ctx.privateSchoolRead_
 ctx.privateSchoolRead_=()=>{throw Error('synthetic repository outage')}
 for(const group of ['timetable','studentTimetable']){
   let fallbackCalled=false
   assert.throws(()=>ctx.privateSchoolServe_(group,()=>{fallbackCalled=true;return {version:2}}),/추가 편성/)
   assert.equal(fallbackCalled,false)
 }
 assert.equal(ctx.privateSchoolServe_('staffRoster',()=>newer).version,2)
 ctx.privateSchoolRead_=()=>({...data,pulledLessons:[]})
 assert.ok(Array.isArray(ctx.privateSchoolServe_('timetable',()=>({...newer})).pulledLessons))
 assert.throws(()=>ctx.privateSchoolServe_('studentTimetable',()=>({...newer})),/누락/)
 ctx.privateSchoolRead_=pinnedRead
 let mirrorWrites=0,copy=data,available=false
 ctx.migrationWithSourceLock_=callback=>callback()
 ctx.migrationPrimaryConfig_=()=>({phase:'FIRESTORE',sourceBookId:'fixture'})
 ctx.migrationPrimaryRepository_=()=>({})
 ctx.migrationWithBackend_=(_reader,_id,_write,callback)=>({response:callback()})
 ctx.privateSchoolReaders_=()=>({staffRoster:()=>newer})
 ctx.requireAdmin_=value=>assert.equal(value,'fixture-admin')
 ctx.staffRequire_=body=>assert.equal(body.staffToken,'fixture-staff')
 ctx.privateSchoolRead_=()=>copy
 ctx.migrationHash_=value=>JSON.stringify(value)
 ctx.privateSchoolPublish_=(_group,current)=>{if(!available)throw Error('synthetic unavailable');mirrorWrites++;copy=current}
 const admin={adminPassword:'fixture-admin',staffToken:'fixture-staff',group:'staffRoster'}
 assert.throws(()=>ctx.privateSchoolRetryMirror_({...admin,adminPassword:''}))
 assert.throws(()=>ctx.privateSchoolRetryMirror_({...admin,staffToken:''}))
 assert.throws(()=>ctx.privateSchoolRetryMirror_({...admin,group:'unknown'}))
 assert.throws(()=>ctx.privateSchoolMirrorStatus_({adminPassword:''}))
 assert.equal(ctx.privateSchoolRetryMirror_(admin).state,'pending')
 assert.equal(ctx.privateSchoolMirrorStatus_(admin)[0].state,'pending')
 available=true
 assert.equal(ctx.privateSchoolRetryMirror_(admin).state,'current')
 assert.equal(ctx.privateSchoolRetryMirror_(admin).state,'current')
 assert.equal(mirrorWrites,1)
 assert.equal(ctx.privateSchoolMirrorStatus_(admin)[0].state,'current')
 copy={...newer,members:[]}
 assert.equal(ctx.privateSchoolRetryMirror_(admin).state,'current')
 assert.equal(mirrorWrites,2)
 ctx.privateSchoolMetadata_=()=>({...newer,version:3})
 assert.equal(ctx.privateSchoolMirrorStatus_(admin)[0].state,'pending')
 const head='2'.repeat(40)
 ctx.privateSchoolPublish_=save
 ctx.privateSchoolGit_=(endpoint,_writer,payload)=>{
   if(!endpoint)return {private:true,default_branch:'main'}
   if(payload)throw Error('synthetic lost write response')
   if(endpoint==='/git/ref/heads/main')return {object:{sha:head}}
   return {sha:'3'.repeat(40)}
 }
 ctx.privateSchoolReadAt_=(_group,commit)=>{assert.equal(commit,head);return newer}
 ctx.migrationHash_=value=>JSON.stringify(value)
 ctx.privateSchoolPublish_('staffRoster',newer)
 assert.equal(ctx.privateSchoolRevision_('staffRoster'),head)
 assert.throws(()=>ctx.privateSchoolPublish_('staffRoster',{...newer,version:3}),/lost write/)
 console.log('PASS complete supplemental data, administrator-only source retry, pending state, duplicate retry and lost GitHub acknowledgment')
 const path=require('node:path'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ung-auth-state-test-'));let restoreMode='ok',handler;const deadline=new Date(Date.now()+20000).toISOString();const electron={app:{getPath:()=>dir},safeStorage:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()},BrowserWindow:{getAllWindows:()=>[]},ipcMain:{handle:(_,fn)=>{handler=fn}}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('electron/main/staff-auth.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,require:name=>name==='electron'?electron:name==='./staff-transport'?{fetchStaffJson:async(_,req)=>{if(req.action==='staffSession' && restoreMode==='offline')throw Error('offline');if(restoreMode==='revoked')return {ok:false,code:'AUTH_REQUIRED'};return {ok:true,data:{name:'테스트교사',token:'test-session',expiresAt:deadline}}}}:require(name)});
 const create=()=>mod.exports.createStaffAuth(()=>'',()=>true);create();await handler({},'login',{name:'테스트교사',password:'test'});const sessionFile=path.join(dir,'staff-session.bin'),initial=fs.readFileSync(sessionFile);const restarted=create();restoreMode='offline';assert.equal((await handler({},'restore')).retryRequired,true);assert.equal(restarted.snapshot().authenticated,false);assert.deepEqual(fs.readFileSync(sessionFile),initial);restoreMode='ok';assert.equal((await handler({},'restore')).expiresAt,deadline);assert.equal(restarted.snapshot().authenticated,true);create();restoreMode='revoked';assert.equal((await handler({},'restore')).authenticated,false);assert.equal(fs.existsSync(sessionFile),false);fs.rmdirSync(dir);console.log('PASS blocked access during temporary disconnect, retry within original expiry and explicit server revocation')
}
run().catch(e=>{console.error(e);process.exitCode=1})
