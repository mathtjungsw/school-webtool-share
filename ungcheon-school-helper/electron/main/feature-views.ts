import { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync, realpathSync, lstatSync } from 'fs'
import { join, basename, resolve } from 'path'
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'
import { Worker } from 'worker_threads'
export const TOOL_SITES: Record<string, string> = {
  mandatory_training_submit: 'https://script.google.com/macros/s/AKfycbxG52rulCO1jtpxtkus-YMkZrhxaTB4bXpP-2TxDtv37MTb9rAJWzspakNIK8U7GdFIWA/exec',
  mandatory_training_excel: 'https://script.google.com/macros/s/AKfycbxG52rulCO1jtpxtkus-YMkZrhxaTB4bXpP-2TxDtv37MTb9rAJWzspakNIK8U7GdFIWA/exec?x=%EC%A0%81%EA%B7%B9%ED%96%89%EC%A0%95',
  saenggibu_generator: 'https://ungcheon-tools.github.io/saenggibu/',
  ungcheon_library: 'https://script.google.com/macros/s/AKfycbx_uawLjhfejiIdd6mWV5D1TCULX-1K1BtINa-WWBOGkuWrw05KrpVHSIx43L2Qq_xw7A/exec',
  snu: 'https://snuarori.snu.ac.kr/', skku: 'https://webzine.skku.edu/skkuzine/', korea: 'https://www.korea.ac.kr/ko/562/subview.do',
  hanyang: 'https://www.hanyang.ac.kr/web/www/official_magazine', ajou: 'https://www.ajou.ac.kr/kr/ajou/webzine.do', dankook: 'https://webzine.dankook.ac.kr/',
  erica: 'https://www.hanyang.ac.kr/web/www/official_magazine', knu: 'https://webzine.knu.ac.kr/', pusan: 'https://www.pusan.ac.kr/kor/CMS/PdfViwerMgr/MoonList.do?mCode=MN126', jnu: 'https://ile.jnu.ac.kr/',
}
export function registerFeatureViews(main: () => BrowserWindow | null, auth: { snapshot: () => any; request: (p: any) => Promise<any> }) {
  const external = new Map<string, WebContentsView>()
  const loadedSites = new Map<string,string>()
  const slotFor = (id:string) => ['saenggibu_generator','ungcheon_library','mandatory_training_submit','mandatory_training_excel'].includes(id) ? id : 'university_webzines'
  let privateView: WebContentsView | null = null; let privateKind = ''; let active = ''; let epoch = 0; let caseUnlocked = false
  const workers = new Set<Worker>()
  const localRoot = join(process.env.LOCALAPPDATA || app.getPath('userData'), app.getName(), 'private')
  const root = (kind: string) => { const p=join(localRoot,kind); mkdirSync(p,{recursive:true}); if(lstatSync(p).isSymbolicLink() || realpathSync(p).toLowerCase()!==resolve(p).toLowerCase())throw new Error('로컬 저장 경로의 연결/리디렉션을 확인해 주세요.'); return p }
  const loadKey = (kind: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('이 PC에서 암호화 보관을 사용할 수 없습니다.')
    const file=join(root(kind),'key.bin')
    if (!existsSync(file)) writeFileSync(file,safeStorage.encryptString(randomBytes(32).toString('base64')))
    return Buffer.from(safeStorage.decryptString(readFileSync(file)),'base64')
  }
  const save = (kind: string, name: string, data: unknown) => {
    const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',loadKey(kind),iv)
    const content=Buffer.concat([iv,cipher.update(JSON.stringify(data),'utf8'),cipher.final(),cipher.getAuthTag()])
    const file=join(root(kind),name+'.bin'); writeFileSync(file+'.tmp',content); renameSync(file+'.tmp',file)
  }
  const load = (kind: string,name: string) => {
    const file=join(root(kind),name+'.bin'); if(!existsSync(file))return null
    const b=readFileSync(file); const decipher=createDecipheriv('aes-256-gcm',loadKey(kind),b.subarray(0,12)); decipher.setAuthTag(b.subarray(-16))
    return JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString('utf8'))
  }
  const terminate = () => { epoch++; workers.forEach(w=>void w.terminate()); workers.clear() }
  const closePrivate = () => { terminate(); caseUnlocked=false; if(privateView){ const v=privateView; privateView=null; main()?.contentView.removeChildView(v); v.webContents.close() } }
  const parse = (bytes: Uint8Array,kind: string,title: string) => new Promise<any>((resolveResult,reject)=> {
    const generation=epoch; const target=privateView
    const worker=new Worker(join(__dirname,'privacyParser.js'),{workerData:{bytes,kind,title,fileId:createHash('sha256').update(bytes).digest('hex')}}); workers.add(worker)
    worker.on('message',(m:any)=>{
      if(epoch!==generation){reject(new Error('작업이 취소되었습니다.'));return}
      if(m.progress!==undefined){target?.webContents.send('private:progress',m.progress);return}
      workers.delete(worker); void worker.terminate(); if(m.error)reject(new Error(m.error));else resolveResult(m.data)
    })
    worker.on('error',()=>{workers.delete(worker);reject(new Error('파일 판독 중 오류가 발생했습니다.'))})
    worker.on('exit',()=>{workers.delete(worker);if(epoch!==generation)reject(new Error('작업이 취소되었습니다.'))})
  })
  const host = (e: Electron.IpcMainInvokeEvent) => e.sender === main()?.webContents && e.senderFrame === e.sender.mainFrame
  const hide = () => { external.forEach(v=>v.setVisible(false)); privateView?.setVisible(false) }
  ipcMain.handle('feature:view',async(e,p:any)=> {
    if(!host(e))throw new Error('허용되지 않은 요청입니다.')
    if(p.action==='leave'){active='';hide();closePrivate();return true}
    if(!auth.snapshot().authenticated){hide();closePrivate();throw new Error('로그인이 필요합니다.')}
    if(p.action==='hide'){hide();return true}
    const id=String(p.id||''); const isPrivate=['average_grade_calculator','admission_success_cases'].includes(id)
    if(!isPrivate && !TOOL_SITES[id])throw new Error('등록되지 않은 도구입니다.')
    if(p.action==='external'){if(!isPrivate)await shell.openExternal(TOOL_SITES[id]);return true}
    if(p.action==='reload'){external.get(slotFor(id))?.webContents.reload();return true}
    const rect=p.rect; const window=main(); if(!window || !rect || !['x','y','width','height'].every(k=>Number.isFinite(rect[k])))return false
    hide()
    if(active!==id && privateView)closePrivate()
    active=id
    let view: WebContentsView
    if(isPrivate){
      if(!privateView){
        privateKind=id;caseUnlocked=false
        const ses=session.fromPartition('local-private-'+Date.now(),{cache:false})
        ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:/^(https?|wss?):/.test(details.url) && !(process.env.ELECTRON_RENDERER_URL && details.url.startsWith(process.env.ELECTRON_RENDERER_URL))}))
        ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false))
        privateView=new WebContentsView({webPreferences:{session:ses,preload:join(__dirname,'../preload/private.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}})
        view=privateView;window.contentView.addChildView(view)
        view.webContents.setWindowOpenHandler(()=>({action:'deny'}))
        view.webContents.on('will-navigate',event=>event.preventDefault())
        if(process.env.ELECTRON_RENDERER_URL)await view.webContents.loadURL(process.env.ELECTRON_RENDERER_URL+'/private.html?kind='+id)
        else await view.webContents.loadFile(join(__dirname,'../renderer/private.html'),{query:{kind:id}})
      }
      view=privateView!
    }else{
      const slot=slotFor(id)
      if(!external.has(slot)){
        const ses=session.fromPartition('persist:tool-'+(id.startsWith('mandatory_training_')?'mandatory_training':id))
        ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false))
        view=new WebContentsView({webPreferences:{session:ses,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}})
        external.set(slot,view);loadedSites.set(slot,id);window.contentView.addChildView(view)
        view.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))void shell.openExternal(url);return{action:'deny'}})
        void view.webContents.loadURL(TOOL_SITES[id]).catch(()=>undefined)
      }
      view=external.get(slot)!
      if(loadedSites.get(slot)!==id){loadedSites.set(slot,id);void view.webContents.loadURL(TOOL_SITES[id]).catch(()=>undefined)}
    }
    if(active!==id)return false
    const z=window.webContents.getZoomFactor();const bounds=window.getContentBounds()
    const x=Math.max(0,Math.round(rect.x*z)), y=Math.max(0,Math.round(rect.y*z))
    view.setBounds({x,y,width:Math.max(1,Math.min(Math.round(rect.width*z),bounds.width-x)),height:Math.max(1,Math.min(Math.round(rect.height*z),bounds.height-y))});view.setVisible(true)
    return true
  })
  ipcMain.handle('private:call',async(e,action:string,args:any={})=>{
    if(!privateView || e.sender!==privateView.webContents || e.senderFrame!==e.sender.mainFrame || !auth.snapshot().authenticated)throw new Error('열람 권한이 없습니다.')
    const generation=epoch
    const isCases=privateKind==='admission_success_cases';const scope=isCases?'admission-cases':'average-grade'
    if(action==='unlock'){if(!isCases || args.password!=='0000')throw new Error('비밀번호를 확인해 주세요.');caseUnlocked=true;return true}
    if(isCases && !caseUnlocked)throw new Error('우수사례 비밀번호를 입력해 주세요.')
    if(action==='load')return { ...(load(scope,'data') || { rows: [] }), epoch }
    if(action==='gradeSource'){
      if(isCases||!/^[a-f0-9]{64}$/.test(String(args.id)))throw new Error('원문 ID를 확인해 주세요.')
      return load(scope,'source-'+args.id)
    }
    if(action==='save'){
      if(isCases || args.epoch !== epoch)throw new Error('취소되었거나 오래된 저장 요청입니다.')
      if(!Array.isArray(args.rows) || args.rows.length>100000)throw new Error('저장 자료 범위를 확인해 주세요.')
      const previous=load(scope,'data');if(previous&&previous.schemaVersion!==2)save(scope,'migration-backup',previous)
      save(scope,'data',{...args,schemaVersion:2});return true
    }
    if(action==='wipe'){
      terminate()
      const dir=root(scope);const confirmed=resolve(dir)
      for(const name of readdirSync(dir)){const file=resolve(dir,name);if(!file.startsWith(confirmed+require('path').sep))throw new Error('자료 경로 오류');unlinkSync(file)}
      return { epoch }
    }
    if(action==='importGrades'){
      if(isCases)throw new Error('허용되지 않은 요청입니다.')
      const choice=await dialog.showOpenDialog(main()!,{properties:['openFile','multiSelections'],filters:[{name:args.format==='pdf'?'학생부 PDF':'나이스 XLSX DATA',extensions:[args.format==='pdf'?'pdf':'xlsx']}]})
      if(choice.canceled)return { rows: [], epoch }
      if(choice.filePaths.length>10)throw new Error('한 번에 10개까지 선택해 주세요.')
      const result:any[]=[]
      for(const path of choice.filePaths){const b=readFileSync(path);if(b.length>100*1024*1024)throw new Error('파일이 너무 큽니다.');const parsed=await parse(new Uint8Array(b),args.format==='pdf'?'grade':'xlsx',basename(path));if(epoch!==generation)throw new Error('작업이 취소되었습니다.');if(args.format==='pdf'&&parsed.length)save(scope,'source-'+createHash('sha256').update(b).digest('hex'),{id:createHash('sha256').update(b).digest('hex'),bytes:b.toString('base64'),title:basename(path)});result.push(...parsed)}
      if(epoch!==generation)throw new Error('작업이 취소되었습니다.');return { rows: result, epoch }
    }
    if(action==='casePrefs'){
      if(!isCases || args.epoch!==epoch || !Array.isArray(args.favorites) || args.favorites.length>1000 || args.favorites.some((id:unknown)=>typeof id!=='string'||!/[a-z0-9_-]+:\d+$/.test(id)))throw new Error('관심 자료 저장을 확인해 주세요.')
      save(scope,'data',{favorites:args.favorites,lastBook:String(args.lastBook||''),lastPage:Number(args.lastPage)||1});return true
    }
    if(action==='library')return auth.request({action:'caseLibrary'})
    if(action==='getCaseBook'){
      const id=String(args.id||'');if(!/^[a-z0-9_-]{1,60}$/.test(id))throw new Error('자료 ID 오류')
      const name='book-'+id; const cached=load(scope,name)
      if(cached && cached.revision===args.revision){if(cached.parserVersion===2)return cached;const parsed=await parse(new Uint8Array(Buffer.from(cached.bytes,'base64')),'cases',cached.title);if(epoch!==generation)throw new Error('작업이 취소되었습니다.');const data={...cached,...parsed};save(scope,name,data);return data}
      const response=await auth.request({action:'caseDocument',id})
      if(epoch!==generation)throw new Error('작업이 취소되었습니다.')
      const bytes=Buffer.from(response.data,'base64');const parsed=await parse(new Uint8Array(bytes),'cases',response.title)
      if(epoch!==generation)throw new Error('작업이 취소되었습니다.')
      const data={...parsed,bytes:response.data,revision:response.revision,id};save(scope,name,data);return data
    }
    throw new Error('지원되지 않는 요청입니다.')
  })
  return { close:()=>{hide();closePrivate();external.forEach(v=>v.webContents.close());external.clear()}, privateRoot:localRoot }
}
