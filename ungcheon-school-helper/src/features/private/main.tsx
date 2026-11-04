import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import Grades from './Grades'
import CaseLibrary from './CaseLibrary'
import * as pdfjs from 'pdfjs-dist-v3'
import workerUrl from 'pdfjs-dist-v3/build/pdf.worker.min.js?url'
import './private.css'

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl
const api=window.privateTool
function App(){
 const cases=new URLSearchParams(location.search).get('kind')==='admission_success_cases'
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[locked,setLocked]=useState(cases),[pin,setPin]=useState('')
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setProgress(0);try{await fn()}catch(e){setError(e instanceof Error?e.message:'처리하지 못했습니다.')}finally{setBusy(false)}}
 useEffect(()=>api.progress(setProgress),[])
 if(locked)return <main className="unlock"><div className="lock-icon">🔒</div><small>진학·대입 · 보호 자료</small><h1>수시모집 우수사례</h1><p>자료를 열람하려면 추가 비밀번호를 입력하세요.</p><form onSubmit={e=>{e.preventDefault();void run(async()=>{await api.call('unlock',{password:pin});setPin('');setLocked(false)})}}><input autoFocus type="password" aria-label="우수사례 비밀번호" value={pin} onChange={e=>setPin(e.target.value)} placeholder="비밀번호"/><button disabled={busy}>자료 열람하기</button></form>{error&&<p role="alert" className="error">{error}</p>}<p className="muted">다른 메뉴로 이동하면 다시 잠깁니다.</p></main>
 return <main className="private-page"><header><div><small>진학·대입 · 개인 자료 보호</small><h1>{cases?'수시모집 우수사례':'평균내신등급 산출기'}</h1><p>{cases?'로그인한 교직원에게 제공되는 자료집을 검색하고 원문으로 확인하세요.':'파일 읽기·계산·저장은 이 PC에서 처리합니다. 외부 AI에 전송하지 않습니다.'}</p></div></header>{error&&<div className="error" role="alert">{error}</div>}{busy&&<div className="progress"><span>자료 처리 중 · {Math.round(progress*100)}%</span><progress max={1} value={progress}/></div>}{cases?<CaseLibrary run={run} busy={busy}/>:<Grades run={run} busy={busy}/>}</main>
}

createRoot(document.getElementById('root')!).render(<App/>)
