const fs=require('fs'),ts=require('typescript'),assert=require('assert/strict'),{EventEmitter}=require('events')
const handlers=new Map(),windows=[[],[]],notifications=[]
class Notice{static isSupported(){return true}constructor(options){this.options=options}on(){return this}show(){notifications.push(this.options)}}
const electron={app:{getVersion:()=>'1.1.38'},ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},BrowserWindow:{getAllWindows:()=>windows.map(messages=>({webContents:{send:(_channel,state)=>messages.push({...state})}}))},Notification:Notice}
const js=ts.transpileModule(fs.readFileSync('electron/main/update-manager.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const moduleObject={exports:{}};new Function('require','exports','module',js)(name=>{if(name==='electron')return electron;throw Error('Unexpected dependency')},moduleObject.exports,moduleObject)
;(async()=>{
 const updater=new EventEmitter();let checks=0,resolveCheck
 const installs=[]
 updater.checkForUpdates=()=>{checks++;return new Promise(resolve=>{resolveCheck=resolve})}
 updater.quitAndInstall=(...args)=>installs.push(args)
 const manager=moduleObject.exports.registerUpdateManager(updater,()=>{},()=>true),invoke=action=>handlers.get('preview:update')({},action)
 await assert.rejects(()=>invoke('install'))
 const first=invoke('check'),second=invoke('check');assert.equal(checks,1);resolveCheck();await Promise.all([first,second])
 updater.emit('update-available',{version:'1.1.39'});updater.emit('update-available',{version:'1.1.39'});assert.equal(notifications.length,1)
 updater.emit('download-progress',{percent:37.5});assert.equal(manager.snapshot().progress,37.5);assert.equal(manager.snapshot().phase,'downloading')
 updater.emit('update-downloaded',{version:'1.1.39'});assert.equal(manager.snapshot().phase,'ready');assert.equal(manager.snapshot().progress,100);assert.equal(notifications.length,2)
 assert.deepEqual(windows[0].at(-1),windows[1].at(-1))
 await invoke('install-from-widget')
 assert.deepEqual(installs,[[true,true]])
 assert.equal(manager.snapshot().phase,'installing')
 await assert.rejects(()=>invoke('install'))
 assert.equal(installs.length,1)

 updater.emit('error', new Error('Installer launch failed'))
 assert.equal(manager.snapshot().phase,'error')
 assert.match(manager.snapshot().error,/설치를 시작하지 못했습니다/)
 const retry=invoke('check');assert.equal(checks,2);resolveCheck();await retry
 updater.emit('update-downloaded',{version:'1.1.39'})
 await invoke('install')
 assert.deepEqual(installs,[[true,true],[]])
 console.log('PASS updater: concurrent checks, download progress, shared state, direct widget install and restart flags, duplicate prevention, and retry after install error.')
})().catch(error=>{console.error(error.message);process.exitCode=1})
