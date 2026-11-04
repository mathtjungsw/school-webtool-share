import {useEffect,useRef,useState} from 'react'
const sites=[['snu','서울대'],['skku','성균관대'],['korea','고려대'],['hanyang','한양대'],['ajou','아주대'],['dankook','단국대'],['erica','한양대 ERICA'],['knu','경북대'],['pusan','부산대'],['jnu','전남대']]
let lastCollege='snu'
const trainingScreens=[['mandatory_training_submit','이수증 제출 웹앱'],['mandatory_training_excel','이수증 엑셀 내려받기 웹앱']]
export function FeatureSurface({id}:{id:string}){
 const ref=useRef<HTMLDivElement>(null);const [error,setError]=useState('')
 useEffect(()=>{
  let alive=true;let frame=0
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!alive||!ref.current)return;const r=ref.current.getBoundingClientRect();const modal=document.querySelector('[aria-modal="true"], .fixed.inset-0');if(modal){void window.preview.view({action:'hide'});return}void window.preview.view({action:'show',id,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}).catch(()=>{if(alive)setError('화면을 열지 못했습니다. 다시 선택하거나 외부 브라우저에서 열어 주세요.')})})}
  const observer=new ResizeObserver(update);if(ref.current)observer.observe(ref.current)
  const mutation=new MutationObserver(update);mutation.observe(document.body,{childList:true,subtree:true})
  window.addEventListener('resize',update);window.addEventListener('feature:refresh',update);update()
  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();mutation.disconnect();window.removeEventListener('resize',update);window.removeEventListener('feature:refresh',update);void window.preview.view({action:'leave'})}
 },[id])
 return <div ref={ref} className="relative flex-1 min-h-[300px]">{error&&<p className="p-4 text-red-700">{error}</p>}</div>
}
export default function ExternalToolPage({kind}:{kind:string}){
 const [selected,setSelected]=useState(lastCollege)
 const [trainingScreen,setTrainingScreen]=useState('mandatory_training_submit')
 useEffect(()=>{lastCollege=selected},[selected])
 const webzines=kind==='university_webzines',training=kind==='mandatory_training'
 const id=webzines?selected:training?trainingScreen:kind
 const title=training?'법정의무연수':webzines?'대학 웹진(아로리)':kind==='ungcheon_library'?'웅천 서가':'웅천고 생기부 생성 도우미'
 const category=training?'업무·학교운영':kind==='ungcheon_library'?'독서교육':'진학·대입'
 return <div className="flex h-full flex-col">
  <div className="border-b border-emerald-100 bg-white px-6 py-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="text-xs font-bold text-emerald-700">{category}</p><h1 className="text-xl font-black text-slate-950">{title}</h1></div>
    <div className="flex gap-2">
     <button className="btn-secondary" onClick={()=>{if(confirm('입력한 내용과 진행 중인 작업을 확인한 뒤 새로고침하세요. 계속할까요?'))void window.preview.view({action:'reload',id})}}>새로고침</button>
     <button className="btn-primary" onClick={()=>void window.preview.view({action:'external',id})}>기본 브라우저로 열기 ↗</button>
    </div>
   </div>
   {training&&<div role="group" aria-label="법정의무연수 웹앱 선택" className="mt-3 flex flex-wrap gap-2">{trainingScreens.map(([key,label])=><button key={key} aria-pressed={trainingScreen===key} className={trainingScreen===key?'btn-primary':'btn-secondary'} onClick={()=>setTrainingScreen(key)}>{label}</button>)}</div>}
   {webzines?<div className="mt-3 flex flex-wrap gap-2">{sites.map(([key,name])=><button key={key} aria-pressed={selected===key} className={selected===key?'btn-primary':'btn-secondary'} onClick={()=>setSelected(key)}>{name}</button>)}</div>:<p className="mt-2 text-xs text-slate-600">{training?'상단 버튼으로 제출·엑셀 내려받기 화면을 전환하세요. ':''}외부 사이트의 원래 통신·저장 정책을 따릅니다.{kind==='saenggibu_generator'?' API 키의 로컬 보관과 공식 AI 서비스 인증 전송은 별개입니다.':''}</p>}
  </div><FeatureSurface id={id}/>
 </div>
}
