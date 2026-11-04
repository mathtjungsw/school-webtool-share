const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),Module=require('node:module')
const {Worker}=require('node:worker_threads'),ts=require('typescript')
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
function loadTs(file){const m=new Module(path.resolve(file),module);m.filename=path.resolve(file);m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,m.filename);return m.exports}
const {gradeResult,matchingApplication}=loadTs('src/features/private/domain.ts')
const row=(credit,rank,group='국어')=>({credit,rank,group,subject:'합성 과목'})
assert.equal(gradeResult([row(3,2),row(2,4)],false,9).average,'2.80')
assert.equal(gradeResult([row(3,2),row(2,4),row(9,null)],false,9).average,'2.80')
assert.equal(gradeResult([row(null,2)],false,9).pending.length,1)
assert.equal(gradeResult([row(1,null)],false,9).average,null)
assert.equal(gradeResult([row(1.5,2),row(.5,4)],false,9).average,'2.50')
assert.equal(gradeResult([row(3,2,'체육')],false,9).average,'2.00')
assert.equal(gradeResult([row(3,2,'체육')],true,9).average,null)
assert.equal(gradeResult([row(3,7)],false,5).pending.length,1)
assert.equal(gradeResult([row(3,2,'사회(역사/도덕 포함)')],true,9).average,'2.00')
assert.equal(matchingApplication({university:'B대',department:'가상학과',type:'종합',result:'불'},'B대','','','합'),false)
console.log('PASS weighted averages, missing ranks/credits, decimal credits, scope, scale and same-application predicates')
function parse(file,kind){return new Promise((resolve,reject)=>{const w=new Worker(path.resolve('out/main/privacyParser.js'),{workerData:{bytes:new Uint8Array(fs.readFileSync(file)),kind,title:path.basename(file)}});w.on('error',reject);w.on('message',m=>{if(m.data!==undefined){void w.terminate();resolve(m.data)}if(m.error){void w.terminate();reject(new Error(m.error))}})})}
async function main(){
 const {startPreviewBackend}=loadTs('electron/main/preview-backend.ts')
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ungcheon-auth-test-'))
 const config=path.join(dir,'config.json'),salt='synthetic-test-salt',password='test-only-secret'
 fs.writeFileSync(config,JSON.stringify({salt,verifier:crypto.scryptSync(password,salt,32).toString('hex'),names:['테스트교사'],documents:[]}))
 const service=await startPreviewBackend(config)
 const req=async payload=>(await fetch(service.url,{method:'POST',body:JSON.stringify(payload)})).json()
 try{
  assert.equal((await req({action:'caseLibrary'})).ok,false)
  assert.equal((await req({action:'staffLogin',name:'테스트교사',password:'wrong'})).ok,false)
  assert.equal((await req({action:'staffLogin',name:'미등록',password})).ok,false)
  const login=await req({action:'staffLogin',name:'테스트교사',password});assert.equal(login.ok,true)
  assert.equal((await req({action:'caseLibrary',staffToken:login.data.token})).ok,true)
  await req({action:'staffLogout',staffToken:login.data.token})
  assert.equal((await req({action:'caseLibrary',staffToken:login.data.token})).ok,false)
  console.log('PASS isolated HTTP authentication, wrong/unregistered credentials, protected library and logout revocation')
 }finally{service.close();for(const file of [config,config+'.sessions'])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir)}
 if(process.argv.includes('--samples')){
  for(const [file,kind] of [['C:/MYBOX/검토중/1학년.xlsx','xlsx'],['C:/MYBOX/검토중/2학년.xlsx','xlsx'],['C:/MYBOX/검토중/4세대 나이스 시스템.pdf','grade'],['C:/MYBOX/검토중/4세대 나이스 시스템(1).pdf','grade']]){
   const rows=await parse(file,kind);assert.ok(rows.length>0,'No grade rows: '+path.basename(file));console.log('LOCAL sample shape:',kind,'rows',rows.length,'student groups',new Set(rows.map(r=>r.student)).size,'ranked rows',rows.filter(r=>r.rank!==null).length)
  }
  const cfg=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'Codex/ungcheon-preview/server-config.json'),'utf8'))
  for(const d of cfg.documents){const book=await parse(d.path,'cases');assert.equal(book.cases.length,39);assert.equal(new Set(book.cases.map(c=>c.number)).size,39);assert.ok(book.cases.reduce((n,c)=>n+c.applications.length,0)>150,'Support table rows missing');console.log('LOCAL book structure:',d.id,'cases',book.cases.length,'pages',book.pageCount,'application rows',book.cases.reduce((n,c)=>n+c.applications.length,0))}
 }
 const configFiles=['src','electron','out'].filter(dir=>fs.existsSync(dir)).flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(f=>typeof f==='string'&&/\.(?:ts|tsx|js|json)$/.test(f)).map(f=>path.join(dir,f)))
 assert.ok(!configFiles.some(f=>/우수 사례.*\.pdf$/.test(f)))
 console.log('PASS preview checks')
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
