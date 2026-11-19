const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ungcheon-vault-'))
  const native = process.versions.electron && process.argv.includes('--native') ? require('electron') : null
  if (native) {
    native.app.setPath('userData',root)
    native.app.setPath('sessionData',root)
    await native.app.whenReady()
    assert.ok(native.safeStorage.isEncryptionAvailable())
  }
  const listeners = new Map(), handlers = new Map(), frame = {}, sender = {mainFrame:frame}
  const event = {sender,senderFrame:frame}
  let teacher = 'fixtureA', available = true, notices = 0, finalWrites = 0, hold
  const electron = {
    ipcMain:{on:(name,fn)=>listeners.set(name,fn), handle:(name,fn)=>handlers.set(name,fn)},
    app:{getPath:()=>root,on:(name,fn)=>listeners.set(name,fn)},
    dialog:{showErrorBox:()=>{notices++}},
    safeStorage:{isEncryptionAvailable:()=>available,
      encryptString:value=>native ? native.safeStorage.encryptString(value) : Buffer.from(value).map(b=>b^0x65),
      decryptString:b=>native ? native.safeStorage.decryptString(b) : Buffer.from(b).map(n=>n^0x65).toString()}
  }
  const source = fs.readFileSync(path.join(__dirname,'../electron/main/grade-vault.ts'),'utf8')
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const exports = {}
  new Function('require','exports',code)(name => {
    if (name === 'electron') return electron
    if (name === 'node:fs') return {...fs,renameSync:(...args)=>{finalWrites++;return fs.renameSync(...args)}}
    if (name === 'node:fs/promises') return {...fs.promises,writeFile:async(...args)=>{
      if(hold) await hold()
      return fs.promises.writeFile(...args)
    }}
    return require(name)
  }, exports)
  const flush = exports.registerGradeVault(()=>({webContents:sender}),()=>teacher)
  const key = 'ungcheon-estimated-split-helper-v1:demo'
  const save = value => handlers.get('grade:queueSave')(event,key,value)
  const sync = (op,value) => {listeners.get('grade:vault')(event,op,key,value); return event.returnValue}
  try {
    const batch = [save('first'),save('middle'),save('last')]
    assert.equal(sync('get').value,'last')
    assert.deepEqual(await Promise.all(batch),[true,true,true])
    assert.equal(finalWrites,1)
    assert.equal(sync('get').value,'last')
    const dir = path.join(root,'grade-work',fs.readdirSync(path.join(root,'grade-work'))[0])
    const file = path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('.bin')))
    assert.equal(fs.readFileSync(file).includes(Buffer.from('last')),false)
    const waiting = save('old teacher final')
    teacher = 'fixtureB'
    assert.equal(sync('get').value,null)
    assert.equal(await waiting,true)
    teacher = 'fixtureA'
    assert.equal(sync('get').value,'old teacher final')
    const deleted = save('delete before disk write')
    assert.equal(sync('remove').ok,true)
    await deleted
    assert.equal(sync('get').value,null)
    let started,release
    const writing=new Promise(resolve=>{started=resolve})
    hold=()=>new Promise(resolve=>{release=resolve;started()})
    const stale=save('slow pending edit')
    await writing
    const last=save('replacement while writing')
    hold=null;release()
    assert.deepEqual(await Promise.all([stale,last]),[true,true])
    assert.equal(sync('get').value,'replacement while writing')
    hold=async()=>{throw Error('simulated storage failure')}
    assert.equal(await save('retry after disk error'),false)
    assert.equal(sync('get').value,'retry after disk error')
    hold=null
    assert.equal(await save('retry after disk error'),true)
    assert.equal(sync('get').value,'retry after disk error')
    const underway=new Promise(resolve=>{started=resolve})
    hold=()=>new Promise(resolve=>{release=resolve;started()})
    const older=save('older write in progress')
    await underway
    assert.equal(sync('set','latest explicit write').ok,true)
    hold=null;release();await older
    // A new serialized save only resolves after its distinct file is committed.
    await save('latest revision')
    assert.equal(sync('get').value,'latest revision')
    const quitting = save('most recent before quitting')
    available = false
    let blocked=false
    listeners.get('before-quit')({preventDefault(){blocked=true}})
    assert.ok(blocked && notices===1)
    available = true
    assert.equal(flush(),true)
    assert.equal(await quitting,true)
    assert.equal(sync('get').value,'most recent before quitting')
    assert.equal(await handlers.get('grade:queueSave')({...event,senderFrame:{}},key,'untrusted'),false)
    assert.equal(sync('get').value,'most recent before quitting')
    console.log('PASS grade vault write coalescing, read-through, encryption, teacher isolation, deletion, shutdown and failed shutdown recovery')
  } finally {
    if (native) {
      native.app.once('quit',()=>{try{fs.rmSync(root,{recursive:true,force:true})}catch{}})
      native.app.quit()
    } else fs.rmSync(root,{recursive:true,force:true})
  }
}
run().catch(error=>{console.error(error);process.exitCode=1})
