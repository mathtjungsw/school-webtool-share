import {compact,lines,textIn,type Page,type Cell} from './pdf-layout'
export const CASE_PARSER_VERSION=2
const unique=(values:number[])=>[...values].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>2)
export function structuredPage(p:Page){
 const headingYs=lines(p.cells).filter(l=>/학년별성적추이|과목선택|학교생활기록부주요|출결상황|창의적체험|세부능력|면접|후기|조언/.test(compact(l.text))&&l.text.length<95).map(l=>l.y)
 const horizontal=(p.segments||[]).filter(s=>Math.abs(s.y1-s.y2)<1&&Math.abs(s.x2-s.x1)>p.width*.35)
 const ys=unique(horizontal.map(s=>s.y1)).filter(y=>y>35&&y<p.height-30)
 const groups:number[][]=[]
 for(const y of ys){const last=groups.at(-1);if(last&&y-last.at(-1)!<100&&!headingYs.some(h=>h>last.at(-1)!+2&&h<y))last.push(y);else groups.push([y])}
 const blocks:any[]=[];const regions:{top:number;bottom:number}[]=[]
 for(const group of groups){if(group.length<3)continue;const top=group[0],bottom=group.at(-1)!
  const vertical=(p.segments||[]).filter(s=>Math.abs(s.x1-s.x2)<1&&s.y1!==s.y2&&Math.min(s.y1,s.y2)<bottom-2&&Math.max(s.y1,s.y2)>top+2)
  const xs=unique(vertical.map(s=>s.x1));if(xs.length<3)continue
  const rows=group.slice(0,-1).map((y,i)=>{const middle=(y+group[i+1])/2,columns=unique(vertical.filter(s=>Math.min(s.y1,s.y2)<middle&&Math.max(s.y1,s.y2)>middle).map(s=>s.x1));return columns.slice(0,-1).map((x,j)=>textIn(p,x,columns[j+1],y,group[i+1]))})
  if(rows.filter(r=>r.some(Boolean)).length<2)continue
  blocks.push({kind:'table',page:p.page,top,title:'원문 표',rows:rows.filter(r=>r.some(Boolean)),review:true});regions.push({top,bottom})
 }
 let paragraph:string[]=[];let top=0
 const flush=()=>{if(paragraph.length){blocks.push({kind:'paragraph',page:p.page,top,text:paragraph.join('\n')});paragraph=[]}}
 for(const l of lines(p.cells)){
  if(l.y<30||l.y>p.height-25||regions.some(r=>l.y>=r.top&&l.y<r.bottom))continue
  if(/수시모집.*지원분석|학년별성적추이|과목선택|학교생활기록부주요|출결상황|창의적체험|세부능력|면접|합격.*후기|조언|독서활동/.test(compact(l.text))&&l.text.length<95){flush();blocks.push({kind:'heading',page:p.page,top:l.y,text:l.text})}
  else{if(paragraph.length>0&&l.y-top>24){flush()}if(!paragraph.length)top=l.y;paragraph.push(l.text);top=l.y}
 }
 flush();blocks.sort((a,b)=>a.top-b.top)
 return blocks
}
export function applicationTable(first:Page){
 const header=first.cells.filter(c=>/지원대학|지원학과|전형유형|내신등급|합\/불|^합$/.test(compact(c.text)))
 const points=['지원대학','지원학과','전형유형','내신등급','합/불'].map(k=>header.find(c=>compact(c.text).includes(k)||(k==='합/불'&&compact(c.text)==='합')))
 if(!points.every(Boolean))return []
 const cs=points as Cell[],centres=cs.map(c=>c.x+c.w/2),top=Math.max(...cs.map(c=>c.y))+4
 const bottom=first.cells.find(c=>compact(c.text).includes('학년별성적추이'))?.y||top+180
 const horizontal=(first.segments||[]).filter(s=>Math.abs(s.y1-s.y2)<1&&Math.min(s.x1,s.x2)<centres[3]&&Math.max(s.x1,s.x2)>centres[3]).map(s=>s.y1)
 let borders=unique(horizontal.filter(y=>y>top-2&&y<bottom))
 if(borders.length<2)return []
 const rows=[]
 for(let i=0;i<borders.length-1;i++){
  const y1=borders[i],y2=borders[i+1];if(y2-y1<8)continue
  const values=centres.map((x,k)=>textIn(first,k?(centres[k-1]+x)/2:0,k+1<centres.length?(x+centres[k+1])/2:x+35,y1,y2))
  if(!values[0]&&!values[1])continue
  rows.push({university:values[0],department:values[1],type:values[2],grade:values[3],result:values[4],page:first.page,review:true})
 }
 return rows
}
