import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('privateTool',{
  call:(action:string,args?:unknown)=>ipcRenderer.invoke('private:call',action,args),
  progress:(callback:(p:number)=>void)=>{const listener=(_event:unknown,p:number)=>callback(p);ipcRenderer.on('private:progress',listener);return()=>ipcRenderer.removeListener('private:progress',listener)},
})
