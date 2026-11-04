import {compact,lines,textIn,horizontalBounds,type Page,type Cell} from './pdf-layout'
import type {GradeRow,StudentInfo} from '../../src/features/private/domain'
const number=(v:string)=>/^\d+(\.\d+)?$/.test(compact(v))?Number(compact(v)):null
function identity(page:Page,id:string):StudentInfo{
 const text=page.text,top=text.split(/1\s*\.\s*인적|인적.?학적.?사항/)[0]
 const academic=lines(page.cells.filter(c=>c.y<270)).map(l=>l.text.match(/^\s*([1-3])\s+(?:[가-힣]+\s+)?(\d{1,2})\s+(\d{1,2})\s+/)).filter(Boolean) as RegExpMatchArray[]
 const last=academic.sort((a,b)=>Number(a[1])-Number(b[1])).at(-1)
 const name=text.match(/(?:성명|이름)\s*[:：]\s*([가-힣·A-Za-z]+)/)?.[1]||''
 const explicit=text.match(/(?:학번|학생번호)\s*[:：]\s*(\d{4,12})/)?.[1]||''
 const footer=text.match(/반\s*(\d{1,2})\s*번호\s*(\d{1,2})\s*성명/)
 return{id,name,studentNumber:explicit,currentGrade:last?.[1]||'',className:last?.[2]||footer?.[1]||'',number:last?.[3]||footer?.[2]||'',schoolYear:top.match(/(20\d{2})\s*학년도/)?.[1]||''}
}
export function parseGradePdf(pages:Page[],source:string,sourceId=source):GradeRow[]{
 const out:GradeRow[]=[];let n=0,info:StudentInfo|undefined,year='',active=false
 for(const page of pages){
  if(/인적.?학적.?사항/.test(compact(page.text))){n++;info=identity(page,sourceId+':student:'+n);year='';active=false}
  if(!info)info=identity(page,sourceId+':student:1')
  const ls=lines(page.cells)
  for(let li=0;li<ls.length;li++){
   const line=ls[li],flat=compact(line.text)
   if(/교과학습발달상황/.test(flat))active=true
   const ym=flat.match(/\[([1-3])학년\]/);if(ym)year=ym[1]
   if(!active)continue
   if(/독서활동상황|행동특성/.test(flat))active=false
   if(!/학기/.test(flat)||!/과목/.test(flat))continue
   const header=page.cells.filter(c=>c.y>line.y-20&&c.y<line.y+22)
   const find=(re:RegExp)=>header.find(c=>re.test(compact(c.text)))
   const subject=find(/^과목$/),credit=find(/^(학점|단위수|이수단위)$/),group=find(/^교과(?:\(군\))?$/),semester=find(/^학기$/),rank=find(/^(석차등급|석차)$/)
   if(!subject||!credit||!group||!semester)continue
   const cx=credit.x+credit.w/2,rx=rank?rank.x+rank.w/2:Infinity,gx=group.x+group.w/2,sx=subject.x+subject.w/2,semx=semester.x+semester.w/2
   const left=(gx+sx)/2,right=(sx+cx)/2
   const end=ls.find(l=>l.y>line.y+15&&/이수학점합계|이수단위합계|세부능력.{0,4}특기사항|성취도.*비율|과목.*학점|독서활동상황|행동특성/.test(compact(l.text)))?.y||page.height-55
   const anchors=page.cells.filter(c=>c.y>line.y+12&&c.y<end&&Math.abs(c.x+c.w/2-cx)<13&&number(c.text)!==null).sort((a,b)=>a.y-b.y)
   const borders=[...new Set((page.segments||[]).filter(s=>Math.abs(s.y1-s.y2)<1&&Math.min(s.x1,s.x2)<sx&&Math.max(s.x1,s.x2)>sx).map(s=>Math.round(s.y1*10)/10))].sort((a,b)=>a-b)
   for(let i=0;i+1<borders.length;i++){
    const a=borders[i],b=borders[i+1];if(a<line.y+10||b>end||b-a<9||anchors.some(c=>c.y>=a&&c.y<b))continue
    const title=textIn(page,left,right,a,b)
    if(/[가-힣]/.test(title)&&!/(과목|학점|합계)/.test(title))anchors.push({x:cx,y:(a+b)/2,w:0,text:''})
   }
   anchors.sort((a,b)=>a.y-b.y)
   const unique=anchors.filter((c,i)=>!i||Math.abs(c.y-anchors[i-1].y)>3)
   const top=line.y+12
   const mergedValue=(x:number,y:number,re:RegExp)=>{
    const range=horizontalBounds(page,x,y,top,end)
    return page.cells.filter(c=>Math.abs(c.x+c.w/2-x)<25&&c.y>=range.top&&c.y<range.bottom&&re.test(compact(c.text))).sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y))[0]?.text||''
   }
   unique.forEach((anchor,i)=>{
    const fallbackTop=i?(unique[i-1].y+anchor.y)/2:top,fallbackBottom=i+1<unique.length?(anchor.y+unique[i+1].y)/2:end
    const cell=horizontalBounds(page,sx,anchor.y,fallbackTop,fallbackBottom)
    // Cell borders override text-line midpoints only when the same row is bounded.
    const subjectText=textIn(page,left,right,cell.top,cell.bottom).replace(/\n/g,' ').trim()
    const rankText=rank?compact(textIn(page,rx-18,rx+18,cell.top,cell.bottom)):''
    const rankValue=rank&&/^[1-9]$/.test(rankText)?Number(rankText):null
    const issues:string[]=[]
    if(number(anchor.text)===null)issues.push('학점 판독 필요')
    if(!subjectText)issues.push('과목명 판독 필요')
    if(rank&&!/^(?:[1-9]|[-·ㆍ.]|)$/.test(rankText))issues.push('석차등급 판독 필요')
    if(rank&&!rankText)issues.push('석차등급 공란 원문 확인')
    let subjectName=compact(subjectText)||'과목명 확인 필요'
    if(/합계|과목|학점/.test(subjectName)&&subjectText)return
    const groupText=mergedValue(gx,anchor.y,/[가-힣]/).trim(),sem=compact(mergedValue(semx,anchor.y,/^[12]$/))
    out.push({id:sourceId+':'+page.page+':'+li+':'+i,student:info!.id,studentInfo:{...info!},sourceId,page:page.page,year,semester:sem,group:groupText,subject:subjectName,credit:number(anchor.text),rank:rankValue,scale:null,source:source+' '+page.page+'쪽',readState:issues.length?'review':rankValue===null?'unranked':'parsed',issues,bounds:{x:Math.max(0,left-5),y:Math.max(0,cell.top-8),width:Math.min(page.width-left+5,rx===Infinity?cx-left+30:rx-left+30),height:cell.bottom-cell.top+12}})
   })
  }
 }
 return out
}
