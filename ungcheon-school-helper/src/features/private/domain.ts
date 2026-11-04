import {curriculumGroup} from './curriculum2022'
export type StudentInfo={id:string;name:string;studentNumber:string;currentGrade:string;className:string;number:string;schoolYear:string}
export type GradeRow = { id:string;student:string;year:string;semester:string;group:string;groupOverride?:boolean;subject:string;credit:number|null;rank:number|null;scale:number|null;source:string;studentInfo?:StudentInfo;sourceId?:string;page?:number;bounds?:{x:number;y:number;width:number;height:number};readState?:'parsed'|'unranked'|'review';issues?:string[];reviewed?:boolean;original?:Record<string,unknown> }
export function normalizeGroup(group:string){const g=group.replace(/\s/g,'');return g.startsWith('사회(')?'사회':g}
export function subjectGroup(row:GradeRow){const manual=row.groupOverride||(row.original&&'group' in row.original&&row.group!==row.original.group);return manual?normalizeGroup(row.group):curriculumGroup(row.subject)||normalizeGroup(row.group)}
export function gradeResult(rows:GradeRow[],mainOnly:boolean,scale:number){
  let numerator=0n,denominator=0n;const included:GradeRow[]=[],excluded:GradeRow[]=[],pending:GradeRow[]=[]
  for(const row of rows){
    if(row.readState==='review'&&!row.reviewed){pending.push(row);continue}
    if(row.rank===null){excluded.push(row);continue}
    if(!Number.isInteger(row.rank)||row.rank<1||row.rank>scale||row.credit===null||!Number.isFinite(row.credit)||row.credit<=0){pending.push(row);continue}
    const group=subjectGroup(row)
    if(mainOnly&&!['국어','영어','수학','과학','사회'].includes(group)){if(!group||group==='한국사'||!/(체육|예술|기술|가정|외국어|한문|교양)/.test(group))pending.push(row);else excluded.push(row);continue}
    const credit=BigInt(Math.round(row.credit*1000000));numerator+=credit*BigInt(row.rank);denominator+=credit;included.push(row)
  }
  const rounded=denominator?(numerator*100n+denominator/2n)/denominator:null
  return {average:rounded===null?null:(Number(rounded)/100).toFixed(2),credits:Number(denominator)/1000000,included,excluded,pending}
}
export function parseStudentNumber(value:string){
  if(!/^[1-3]\d{3,4}$/.test(value))return null
  const currentGrade=value[0],className=String(Number(value.slice(1,-2))),number=String(Number(value.slice(-2)))
  return Number(className)>0&&Number(number)>0?{currentGrade,className,number}:null
}
export function formatStudentNumber(s:Pick<StudentInfo,'currentGrade'|'className'|'number'>,digits:4|5){
  if(!/^[1-3]$/.test(s.currentGrade)||!/^\d{1,2}$/.test(s.className)||!/^\d{1,2}$/.test(s.number))return ''
  const c=Number(s.className),n=Number(s.number);if(c<1||n<1||digits===4&&c>9)return ''
  return s.currentGrade+String(c).padStart(digits===5?2:1,'0')+String(n).padStart(2,'0')
}
export function studentNumberAliases(s:StudentInfo){
  const parsed=parseStudentNumber(s.studentNumber),identity=parsed||(!s.studentNumber?s:null)
  return [...new Set([s.studentNumber,...(identity?[formatStudentNumber(identity,5),formatStudentNumber(identity,4)]:[])].filter(Boolean))]
}
export function studentsFromRows(rows:GradeRow[]):StudentInfo[]{const map=new Map<string,StudentInfo>();for(const r of rows)if(!map.has(r.student)){const s=r.studentInfo||{id:r.student,name:r.student,studentNumber:'',currentGrade:'',className:'',number:'',schoolYear:''},p=parseStudentNumber(s.studentNumber);map.set(r.student,{...s,currentGrade:s.currentGrade||p?.currentGrade||'',className:s.className||p?.className||'',number:s.number||p?.number||''})}return [...map.values()]}
export function filterStudents(students:StudentInfo[],query:string,grade:string,cls:string,number:string){const q=query.replace(/\s/g,'').toLowerCase(),full=!!parseStudentNumber(q),eq=(a:string,b:string)=>!b||Number(a)===Number(b);return students.filter(s=>eq(s.currentGrade,grade)&&eq(s.className,cls)&&eq(s.number,number)&&(!q||s.name.replace(/\s/g,'').toLowerCase().includes(q)||studentNumberAliases(s).some(v=>full?v===q:v.includes(q)))).sort((a,b)=>Number(studentNumberAliases(b).includes(q))-Number(studentNumberAliases(a).includes(q))||a.currentGrade.localeCompare(b.currentGrade,'ko',{numeric:true})||a.className.localeCompare(b.className,'ko',{numeric:true})||a.number.localeCompare(b.number,'ko',{numeric:true})||a.name.localeCompare(b.name,'ko'))}
export function matchingApplication(a:any,university:string,department:string,type:string,result:string){
  const clean=(v:unknown)=>String(v??'').replace(/\s/g,'').toLowerCase()
  const matchesResult=()=>{const q=clean(result),v=clean(a.result);if(!q)return true;if(['합','합격'].includes(q))return /합/.test(v)&&!/불|예비|미합/.test(v);if(['불','불합','불합격'].includes(q))return /불/.test(v);return v.includes(q)}
  return [[a.university,university],[a.department,department],[a.type,type]].every(([v,q])=>!q||clean(v).includes(clean(q)))&&matchesResult()
}
