export type GradeRow = { id:string;student:string;year:string;semester:string;group:string;subject:string;credit:number|null;rank:number|null;scale:number|null;source:string }
export function normalizeGroup(group:string){const g=group.replace(/\s/g,'');return g.startsWith('사회(')?'사회':g}
export function gradeResult(rows:GradeRow[],mainOnly:boolean,scale:number){
  let numerator=0n,denominator=0n;const included:GradeRow[]=[],excluded:GradeRow[]=[],pending:GradeRow[]=[]
  for(const row of rows){
    if(row.rank===null){excluded.push(row);continue}
    if(!Number.isInteger(row.rank)||row.rank<1||row.rank>scale||row.credit===null||!Number.isFinite(row.credit)||row.credit<=0){pending.push(row);continue}
    const group=normalizeGroup(row.group)
    if(mainOnly&&!['국어','영어','수학','과학','사회'].includes(group)){if(!group||group==='한국사'||!/(체육|예술|기술|가정|외국어|한문|교양)/.test(group))pending.push(row);else excluded.push(row);continue}
    const credit=BigInt(Math.round(row.credit*1000000));numerator+=credit*BigInt(row.rank);denominator+=credit;included.push(row)
  }
  const rounded=denominator?(numerator*100n+denominator/2n)/denominator:null
  return {average:rounded===null?null:(Number(rounded)/100).toFixed(2),credits:Number(denominator)/1000000,included,excluded,pending}
}
export function matchingApplication(a:any,university:string,department:string,type:string,result:string){
  const clean=(v:unknown)=>String(v??'').replace(/\s/g,'').toLowerCase()
  return [[a.university,university],[a.department,department],[a.type,type],[a.result,result]].every(([v,q])=>!q||clean(v).includes(clean(q)))
}
