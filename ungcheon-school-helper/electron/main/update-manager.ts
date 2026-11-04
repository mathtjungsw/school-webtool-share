import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import type { AppUpdater } from 'electron-updater'
export function registerUpdateManager(updater: AppUpdater, open:()=>void, trusted:(e:Electron.IpcMainInvokeEvent)=>boolean){
  const preview=app.getVersion().includes('-preview.')
  let state:any={phase:preview?'preview':'idle',currentVersion:app.getVersion(),targetVersion:'',progress:null,revision:0,checkedAt:null}
  let checking=false,lastCheck=0,lastToast='';let installing=false
  const send=(patch:any)=>{state={...state,...patch,revision:state.revision+1};BrowserWindow.getAllWindows().forEach(w=>w.webContents.send('preview:update',state))}
  const toast=(key:string,body:string)=>{if(lastToast===key)return;lastToast=key;if(Notification.isSupported()){const n=new Notification({title:'웅천고 업무도우미 업데이트',body});n.on('click',open);n.show()}}
  updater.on('checking-for-update',()=>send({phase:'checking'}))
  updater.on('update-available',(info)=>{send({phase:'available',targetVersion:info.version});toast(info.version+':available','새 버전이 있습니다. 다운로드 후 설치해 주세요.')})
  updater.on('download-progress',p=>send({phase:'downloading',progress:p.percent}))
  updater.on('update-downloaded',info=>{send({phase:'ready',targetVersion:info.version,progress:100});toast(info.version+':ready','설치 준비가 완료되었습니다. 지금 설치를 눌러 주세요.')})
  updater.on('update-not-available',()=>send({phase:'current',checkedAt:Date.now()}))
  updater.on('error',()=>send({phase:'error',error:'업데이트를 확인하거나 내려받지 못했습니다. 연결을 확인하고 다시 시도하세요.'}))
  const check=async()=>{if(preview)return state;if(checking)return state;checking=true;try{lastCheck=Date.now();await updater.checkForUpdatesAndNotify()}finally{checking=false}return state}
  const timer=setInterval(()=>{if(!preview&&Date.now()-lastCheck>=6*3600000)void check().catch(()=>undefined)},60000);timer.unref()
  ipcMain.handle('preview:update',async(e,action:string)=>{
    if(!trusted(e))throw new Error('허용되지 않은 화면입니다.')
    if(action==='snapshot')return state
    if(action==='simulate' && preview){send({phase:'available',targetVersion:'1.1.39-preview.1',simulated:true});setTimeout(()=>send({phase:'downloading',progress:45}),1000);setTimeout(()=>send({phase:'ready',progress:100}),2500);return state}

    if(action==='check')return check()
    if(action==='open'){open();return state}
    if(action==='install'){
      if(preview || state.phase!=='ready'||installing)throw new Error('설치 가능한 정식 업데이트가 없습니다.')
      installing=true;send({phase:'installing'});updater.quitAndInstall();return state
    }
    throw new Error('허용되지 않은 업데이트 요청입니다.')
  })
  return { snapshot:()=>state, check }
}
