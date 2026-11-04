export type Cell = { x:number; y:number; w:number; h?:number; text:string }
export type Segment = { x1:number;y1:number;x2:number;y2:number }
export type Page = { page:number;width:number;height:number;cells:Cell[];text:string;segments?:Segment[] }
export const compact=(v:unknown)=>String(v??'').replace(/\s+/g,'')
export function lines(cells:Cell[],x1=0,x2=Infinity){
 const groups:Cell[][]=[]
 for(const c of [...cells].filter(c=>c.x>=x1&&c.x<x2).sort((a,b)=>a.y-b.y||a.x-b.x)){
  const last=groups.at(-1);if(last&&Math.abs(last[0].y-c.y)<3)last.push(c);else groups.push([c])
 }
 return groups.map(items=>({y:items[0].y,items:items.sort((a,b)=>a.x-b.x),text:items.map(c=>c.text).join(' ')}))
}
export function textIn(page:Page,x1:number,x2:number,y1:number,y2:number){return lines(page.cells.filter(c=>c.x+c.w/2>=x1&&c.x+c.w/2<x2&&c.y>=y1&&c.y<y2)).map(l=>l.text).join('\n').trim()}
export function horizontalBounds(page:Page,x:number,y:number,fallbackTop:number,fallbackBottom:number){
 const ys=(page.segments||[]).filter(s=>Math.abs(s.y1-s.y2)<1&&Math.min(s.x1,s.x2)<x&&Math.max(s.x1,s.x2)>x).map(s=>s.y1)
 return {top:Math.max(fallbackTop,...ys.filter(v=>v<y-1)),bottom:Math.min(fallbackBottom,...ys.filter(v=>v>y+1))}
}
export async function readPdf(bytes:Uint8Array,progress?:(n:number)=>void):Promise<Page[]>{
 const pdfjs=await import('pdfjs-dist-v3/legacy/build/pdf.js') as any,api=pdfjs.default||pdfjs
 const doc=await api.getDocument({data:bytes,disableFontFace:true,isEvalSupported:false,useSystemFonts:true,verbosity:0}).promise
 if(doc.numPages>1000){await doc.destroy();throw Error('PDF는 1,000쪽 이하로 나눠 주세요.')}
 const pages:Page[]=[]
 try{for(let n=1;n<=doc.numPages;n++){
  const page=await doc.getPage(n),vp=page.getViewport({scale:1}),tc=await page.getTextContent(),ops=await page.getOperatorList()
  const cells:Cell[]=tc.items.filter((i:any)=>i.str?.trim()).map((i:any)=>{const m=api.Util.transform(vp.transform,i.transform);return{x:m[4],y:m[5],w:i.width,h:i.height,text:i.str}})
  let matrix=[1,0,0,1,0,0],stack:number[][]=[],pending:Segment[]=[],segments:Segment[]=[]
  const point=(x:number,y:number)=>{const a=api.Util.applyTransform([x,y],matrix);return vp.convertToViewportPoint(a[0],a[1])}
  const edge=(x1:number,y1:number,x2:number,y2:number)=>{const a=point(x1,y1),b=point(x2,y2);if(Math.abs(a[0]-b[0])<1||Math.abs(a[1]-b[1])<1)pending.push({x1:a[0],y1:a[1],x2:b[0],y2:b[1]})}
  for(let i=0;i<ops.fnArray.length;i++){
   const fn=ops.fnArray[i],args=ops.argsArray[i],O=api.OPS
   if(fn===O.save)stack.push([...matrix]);else if(fn===O.restore)matrix=stack.pop()||[1,0,0,1,0,0]
   else if(fn===O.transform)matrix=api.Util.transform(matrix,args)
   else if(fn===O.constructPath){let k=0,x=0,y=0,sx=0,sy=0;const [codes,values]=args;for(const code of codes){
    if(code===O.moveTo){x=values[k++];y=values[k++];sx=x;sy=y}
    else if(code===O.lineTo){const nx=values[k++],ny=values[k++];edge(x,y,nx,ny);x=nx;y=ny}
    else if(code===O.rectangle){const xx=values[k++],yy=values[k++],w=values[k++],h=values[k++];edge(xx,yy,xx+w,yy);edge(xx+w,yy,xx+w,yy+h);edge(xx+w,yy+h,xx,yy+h);edge(xx,yy+h,xx,yy)}
    else if(code===O.closePath){edge(x,y,sx,sy);x=sx;y=sy}
    else k+=code===O.curveTo?6:code===O.curveTo2||code===O.curveTo3?4:0
   }}else if([O.stroke,O.closeStroke,O.fillStroke,O.eoFillStroke,O.closeFillStroke,O.closeEOFillStroke].includes(fn)){segments.push(...pending);pending=[]}
   else if([O.endPath,O.fill,O.eoFill].includes(fn))pending=[]
  }
  pages.push({page:n,width:vp.width,height:vp.height,cells,text:lines(cells).map(l=>l.text).join('\n'),segments})
  progress?.(n/doc.numPages)
 }}finally{await doc.destroy()}
 return pages
}
