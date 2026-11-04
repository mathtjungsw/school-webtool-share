const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const source=fs.readFileSync('electron/main/staff-transport.ts','utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const requests=[],timers=new Map();let next=0,cleared=0,nodeCalls=0,respond=()=>({ok:true,status:200,json:async()=>({ok:true,data:{synthetic:true}})})
const moduleFixture={exports:{}}
vm.runInNewContext(compiled,{module:moduleFixture,exports:moduleFixture.exports,require:name=>{assert.equal(name,'electron');return{net:{fetch:async(url,options)=>{requests.push({url,options});return respond(options)}}}},AbortController,Error,JSON,fetch:()=>{nodeCalls++;throw new TypeError('fetch failed')},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id},clearTimeout:id=>{assert.ok(timers.delete(id));cleared++}})
const {fetchStaffJson}=moduleFixture.exports
;(async()=>{
 const url='https://script.google.com/macros/s/synthetic/exec',payload={action:'staffLogin',name:'가상교사',password:'synthetic-secret'}
 assert.equal((await fetchStaffJson(url,payload)).ok,true)
 const first=requests[0];assert.equal(first.url,url);assert.equal(first.options.method,'POST');assert.equal(first.options.redirect,'follow');assert.equal(first.options.credentials,'omit');assert.equal(first.options.cache,'no-store');assert.deepEqual(JSON.parse(first.options.body),payload);assert.ok(!first.url.includes(payload.password))
 respond=()=>{throw new TypeError('fetch failed with confidential details')};await assert.rejects(()=>fetchStaffJson(url,payload),e=>e.message.includes('프록시')&&!e.message.includes('confidential'));assert.equal(requests.length,2,'Failed login POST must not automatically repeat')
 respond=()=>({ok:false,status:403,json:async()=>{throw Error('must not read proxy body')}});await assert.rejects(()=>fetchStaffJson(url,payload),/HTTP 403/)
 respond=()=>({ok:true,status:200,json:async()=>{throw Error('HTML response')}});await assert.rejects(()=>fetchStaffJson(url,payload),/응답을 확인하지 못/)
 respond=()=>({ok:true,status:200,json:async()=>null});await assert.rejects(()=>fetchStaffJson(url,payload),/응답을 확인하지 못/)
 respond=()=>({ok:true,status:200,json:async()=>({ok:false,error:'비밀번호를 확인해 주세요.'})});assert.equal((await fetchStaffJson(url,payload)).error,'비밀번호를 확인해 주세요.')
 respond=options=>({ok:true,status:200,json:async()=>{assert.equal(timers.size,1);[...timers.values()][0].fn();assert.equal(options.signal.aborted,true);throw Error('body aborted')}});await assert.rejects(()=>fetchStaffJson(url,payload),/응답이 지연/)
 respond=()=>{assert.equal([...timers.values()][0].ms,90000);return{ok:true,status:200,json:async()=>({ok:true,data:{}})}};await fetchStaffJson(url,{action:'caseDocument'})
 assert.equal(nodeCalls,0);assert.equal(timers.size,0);assert.equal(cleared,requests.length)
 assert.match(fs.readFileSync('electron/main/staff-auth.ts','utf8'),/await fetchStaffJson\(endpoint\(\), payload\)/)
 assert.doesNotMatch(source,/NODE_TLS_REJECT_UNAUTHORIZED|setCertificateVerifyProc|rejectUnauthorized|await fetch\(endpoint/)
 console.log('PASS Chromium authentication transport, no Node fetch, POST-only secret, one attempt, HTTP/HTML/timeout distinction, body deadline, timer cleanup and unchanged credential rejection')
})().catch(error=>{console.error(error);process.exitCode=1})
