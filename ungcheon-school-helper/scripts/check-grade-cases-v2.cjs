const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript'),crypto=require('crypto')
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file)
const {parseGradePdf}=require('../electron/main/grade-pdf.ts'),{applicationTable,structuredPage}=require('../electron/main/case-layout.ts'),{parseXlsx}=require('../electron/main/privacy-parser.ts'),{gradeResult,filterStudents}=require('../src/features/private/domain.ts')
const cell=(x,y,text,w=15)=>({x,y,text,w}),line=(y)=>({x1:10,x2:500,y1:y,y2:y})
const p={page:1,width:595,height:842,text:'교과학습발달상황 [1학년]',cells:[cell(0,30,'교과학습발달상황 [1학년]'),cell(20,60,'학기'),cell(75,60,'교과'),cell(150,60,'과목'),cell(245,60,'학점'),cell(440,55,'석차'),cell(440,65,'등급'),cell(20,100,'1'),cell(75,100,'영어'),cell(130,93,'영어 독해와'),cell(130,107,'작문'),cell(245,100,'3'),cell(440,100,'2'),cell(130,140,'과목명 확인 필요'),cell(245,140,'2'),cell(440,140,'?')],segments:[line(75),line(120),line(160)]}
const rows=parseGradePdf([p],'synthetic','hash');assert.ok(rows.some(r=>r.subject==='영어독해와작문'&&r.credit===3&&r.rank===2));assert.equal(new Set(rows.map(r=>r.id)).size,rows.length)
const review={...rows[0],readState:'review',rank:null};assert.equal(gradeResult([review],false,9).pending.length,1)
const roster=[{id:'1',name:'가상학생',studentNumber:'00101',currentGrade:'2',className:'1',number:'1'},{id:'2',name:'가상학생',studentNumber:'20201',currentGrade:'2',className:'2',number:'1'}]
assert.equal(filterStudents(roster,'00101','','','')[0].id,'1');assert.equal(filterStudents(roster,'가상','2','2','1')[0].id,'2');assert.equal(filterStudents(roster,'','1','','').length,0)
const table={page:1,width:600,height:800,text:'',cells:[cell(20,50,'지원대학',45),cell(120,50,'지원학과',45),cell(240,50,'전형유형',45),cell(360,50,'내신등급',45),cell(475,50,'합/불',25),cell(20,90,'가상대',35),cell(120,82,'가상'),cell(120,97,'학과'),cell(240,90,'종합'),cell(475,90,'합'),cell(20,125,'예시대',35),cell(120,125,'예시학과'),cell(240,125,'교과'),cell(360,125,'3.1'),cell(475,125,'불'),cell(10,160,'학년별성적추이',90)],segments:[line(70),line(108),line(148),{x1:10,x2:10,y1:70,y2:148},{x1:100,x2:100,y1:70,y2:148},{x1:500,x2:500,y1:70,y2:148}]}
const apps=applicationTable(table);assert.equal(apps.length,2);assert.equal(apps[0].grade,'');assert.equal(apps[0].department.replace(/\s/g,''),'가상학과');assert.ok(structuredPage(table).some(b=>b.kind==='table'))
console.log('PASS multiline subject cell, row IDs, missing-rank review, leading-zero identity, homonyms, AND filters, blank-grade application row and table blocks')
if(process.argv.includes('--samples')||process.argv.includes('--grade-samples'))(async()=>{
 const {readPdf}=require('../electron/main/pdf-layout.ts'),{parseCases}=require('../electron/main/privacy-parser.ts')
 for(const [name,expected] of [['4세대 나이스 시스템.pdf',63],['4세대 나이스 시스템(1).pdf',18]]){
  const bytes=fs.readFileSync('C:/MYBOX/검토중/'+name),pages=await readPdf(new Uint8Array(bytes)),result=parseGradePdf(pages,'private-source',crypto.createHash('sha256').update(bytes).digest('hex'))
  // The provided rank-column form spans >300pt from subject to rank; unranked forms do not.
  assert.equal(result.filter(r=>r.bounds.width>300).length,expected);assert.equal(result.filter(r=>!r.semester).length,0);assert.equal(new Set(result.map(r=>r.student)).size,3);assert.ok(result.every(r=>r.studentInfo.name&&r.studentInfo.currentGrade&&r.studentInfo.className&&r.studentInfo.number))
  if(expected===63)for(const subject of ['영어독해와작문','현대사회와윤리','윤리문제탐구'])assert.ok(result.some(r=>r.subject===subject))
  console.log('PASS local PDF shape:',expected,'rank-table subject rows; all student identity fields except absent student-number and all semesters captured; personal values omitted')
 }
 for(const [name,count] of [['1학년.xlsx',32],['2학년.xlsx',27]]){const r=parseXlsx(new Uint8Array(fs.readFileSync('C:/MYBOX/검토중/'+name)),name);assert.equal(new Set(r.map(r=>r.student)).size,count);assert.ok(r.every(r=>r.studentInfo.name&&r.studentInfo.currentGrade&&r.studentInfo.className&&r.studentInfo.number));console.log('PASS local XLSX identity groups:',count)}
 if(process.argv.includes('--grade-samples'))return
 const config=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'Codex/ungcheon-preview/server-config.json'),'utf8'))
 for(const doc of config.documents){const book=parseCases(await readPdf(new Uint8Array(fs.readFileSync(doc.path))),doc.title);assert.equal(book.cases.length,39);assert.ok(book.cases.reduce((n,c)=>n+c.applications.length,0)>=200);const blocks=book.cases.flatMap(c=>c.pages.flatMap(p=>p.blocks));assert.ok(blocks.some(b=>b.kind==='table'));assert.ok(blocks.some(b=>b.kind==='heading'));console.log('PASS local casebook:',book.cases.length,'cases;',book.cases.reduce((n,c)=>n+c.applications.length,0),'support rows;',blocks.filter(b=>b.kind==='table').length,'table blocks; no original text logged')}
})().catch(error=>{console.error(error.message);process.exitCode=1})
const {curriculum2022,curriculumGroup}=require('../src/features/private/curriculum2022.ts')
const {subjectGroup,parseStudentNumber,formatStudentNumber,studentNumberAliases,studentsFromRows}=require('../src/features/private/domain.ts')
for(const [g,list] of Object.entries(curriculum2022))for(const subject of list){assert.equal(curriculumGroup(subject),g);assert.equal(curriculumGroup(subject.replace(/ /g,'').replace(/Ⅰ/g,'1').replace(/Ⅱ/g,'2')),g)}
assert.equal(curriculumGroup('한국사 1'),'사회');assert.equal(curriculumGroup('현대 사회와 윤리'),'사회');assert.equal(curriculumGroup('미적분 II'),'수학');assert.equal(curriculumGroup('음악과 문화'),'예술');assert.equal(curriculumGroup('정보과학'),'기술·가정/정보');assert.equal(curriculumGroup('가상 과학 과목'),'')
const course=(subject,group,credit,rank)=>({subject,group,credit,rank})
const courses=[course('한국사1','한국사',2,3),course('공통국어1','수학',3,2),course('정보','',2,1),course('공통영어1','영어',1,4)]
assert.equal(gradeResult(courses,true,5).average,'2.67');assert.equal(gradeResult(courses,false,5).average,'2.25');assert.equal(gradeResult(courses,true,5).excluded.length,1);assert.equal(subjectGroup({...courses[0],groupOverride:true,group:'교양'}),'교양')
const one={id:'a',name:'가상학생',studentNumber:'10102',currentGrade:'1',className:'1',number:'2',schoolYear:'2026'}
assert.deepEqual(parseStudentNumber('1102'),{currentGrade:'1',className:'1',number:'2'});assert.deepEqual(studentNumberAliases(one),['10102','1102']);assert.equal(formatStudentNumber(one,4),'1102');assert.equal(formatStudentNumber(one,5),'10102')
for(const value of ['10102','1102'])assert.equal(filterStudents([one],value,'1','01','02').length,1)
assert.equal(filterStudents([{...one,studentNumber:'1102'}],'10102','','','').length,1);assert.equal(filterStudents([{...one,studentNumber:''}],'1102','','','').length,1)
assert.equal(filterStudents([{...one,studentNumber:'11102',className:'11'}],'1102','','','').length,0)
assert.equal(formatStudentNumber({...one,className:'11'},4),'');assert.equal(parseStudentNumber('10000'),null);assert.equal(parseStudentNumber('0000'),null)
assert.equal(studentsFromRows([{student:'x',studentInfo:{...one,studentNumber:'1102',currentGrade:'',className:'',number:''}}])[0].className,'1')
assert.equal(filterStudents([one,{...one,id:'b',studentNumber:'20102',currentGrade:'2'}],'가상학생','1','','').length,1)
console.log('PASS attachment curriculum groups, Roman/space aliases, weighted core scope, explicit override, 4/5-digit equivalents, no class-11 substring collision, inferred metadata and preserved source IDs')
