const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar')
const base=path.resolve('release/win-unpacked'),archive=path.join(base,'resources/app.asar')
const cfgPath=path.join(process.env.LOCALAPPDATA,'Codex/ungcheon-preview/server-config.json')
const cfg=fs.existsSync(cfgPath)?JSON.parse(fs.readFileSync(cfgPath,'utf8')):{documents:[]}
const sourcePaths=cfg.documents.map(d=>d.path)
const sampleDirectory=process.env.UNGCHEON_PREVIEW_SAMPLE_DIRECTORY
if(sampleDirectory)for(const name of fs.readdirSync(sampleDirectory)){
 if(/\.(?:pdf|xlsx)$/i.test(name))sourcePaths.push(path.join(sampleDirectory,name))
}
const forbiddenNames=sourcePaths.map(file=>path.basename(file))
const hashes=new Set(sourcePaths.map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')))
let count=0
const check=(name,buffer)=>{
 assert.ok(!forbiddenNames.includes(path.basename(name)),'Private source filename found in package')
 assert.ok(!/(?:우수.?사례.*\.pdf|(?:^|[/\\])[12]학년\.xlsx|4세대.*나이스.*\.pdf)$/i.test(name),'Confidential example file found in package')
 assert.ok(!/(?:server-config\.json|staff-session\.bin|\.sessions)$/.test(name),'Private configuration/session file found in package')
 if(/\.(?:pdf|xlsx|bin)$/i.test(name))assert.ok(!hashes.has(crypto.createHash('sha256').update(buffer).digest('hex')),'Original private document found in package')
 if(/\.(?:js|json|html|txt|ya?ml)$/i.test(name)){
  const text=buffer.toString('utf8')
  if(cfg.verifier)assert.ok(!text.includes(cfg.verifier),'Private verifier found in package')
  if(cfg.salt)assert.ok(!text.includes(cfg.salt),'Private salt found in package')
  for(const file of sourcePaths)assert.ok(!text.includes(file)&&!text.includes(file.replace(/\\/g,'/')),'Private source path found in package')
  if(process.env.UNGCHEON_PREVIEW_TEST_PASSWORD)assert.ok(!text.includes(process.env.UNGCHEON_PREVIEW_TEST_PASSWORD),'Operational password found in package')
 }
 count++
}
const entries=asar.listPackage(archive)
for(let name of entries){name=name.replace(/^[/\\]/,'');const info=asar.statFile(archive,name);if(info.files||info.link)continue;check(name,asar.extractFile(archive,name))}
for(const name of fs.readdirSync(path.join(base,'resources'),{recursive:true})){
 const file=path.join(base,'resources',name);if(fs.statSync(file).isFile()&&!name.endsWith('app.asar'))check(name,fs.readFileSync(file))
}
const packed=JSON.parse(asar.extractFile(archive,'package.json').toString())
const expected=JSON.parse(fs.readFileSync('package.json','utf8'))
assert.equal(packed.version,expected.version)
if(packed.build)assert.equal(packed.build.appId,expected.build.appId)
assert.ok(entries.some(name=>name.replace(/\\/g,'/').endsWith('/out/main/privacyParser.js')))
assert.ok(entries.some(name=>name.replace(/\\/g,'/').endsWith('/out/renderer/private.html')))
console.log('PASS package inspection:',count,'files; private PDF/XLSX sources/configuration/password not bundled; package identity and local entrypoints present')
