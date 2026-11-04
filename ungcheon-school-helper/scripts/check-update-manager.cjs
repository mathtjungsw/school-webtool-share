const fs=require('fs'),ts=require('typescript'),assert=require('assert/strict'),{EventEmitter}=require('events')
const handlers=new Map(),windows=[[],[]],notifications=[]
class Notice{static isSupported(){return true}constructor(options){this.options=options}on(){return this}show(){notifications.push(this.options)}}
const electron={app:{getVersion:()=>'1.1.38'},ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},BrowserWindow:{getAllWindows:()=>windows.map(messages=>({webContents:{send:(_channel,state)=>messages.push({...state})}}))},Notification:Notice}
const js=ts.transpileModule(fs.readFileSync('electron/main/update-manager.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const moduleObject={exports:{}};new Function('require','exports','module',js)(name=>{if(name==='electron')return electron;throw Error('Unexpected dependency')},moduleObject.exports,moduleObject)
;(async()=>{
 const updater=new EventEmitter();let checks=0,installs=0,resolveCheck
 updater.checkForUpdates=()=>{checks++;return new Promise(resolve=>{resolveCheck=resolve})};updater.quitAndInstall=()=>installs++
 const manager=moduleObject.exports.registerUpdateManager(updater,()=>{},()=>true),invoke=action=>handlers.get('preview:update')({},action)
 await assert.rejects(()=>invoke('install'))
 const first=invoke('check'),second=invoke('check');assert.equal(checks,1);resolveCheck();await Promise.all([first,second])
 updater.emit('update-available',{version:'1.1.39'});updater.emit('update-available',{version:'1.1.39'});assert.equal(notifications.length,1)
 updater.emit('download-progress',{percent:37.5});assert.equal(manager.snapshot().progress,37.5);assert.equal(manager.snapshot().phase,'downloading')
 updater.emit('update-downloaded',{version:'1.1.39'});assert.equal(manager.snapshot().phase,'ready');assert.equal(manager.snapshot().progress,100);assert.equal(notifications.length,2)
 assert.deepEqual(windows[0].at(-1),windows[1].at(-1))
 await invoke('install');assert.equal(installs,1);assert.equal(manager.snapshot().phase,'installing');await assert.rejects(()=>invoke('install'));assert.equal(installs,1)
 console.log('PASS updater: concurrent checks coalesced, real event progress, deduplicated notifications, main/widget shared state and ready-only single installation. No download or OS notification performed.')
})().catch(error=>{console.error(error.message);process.exitCode=1})
