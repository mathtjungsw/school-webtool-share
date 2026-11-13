'use strict'
// Redacted owner-execution evidence only; never opens school source data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const output=path.join(__dirname,'../out')
function records(kind){return fs.readFileSync(path.join(output,'production-'+kind+'-verification.txt'),'utf8').split(/\r?\n/).filter(line=>line.includes('\t정보\t{')).map(line=>JSON.parse(line.slice(line.indexOf('{'))))}
const resources=records('resource'),reads=records('read'),revision=Math.max(...resources.map(x=>x.revision))
function latest(rows,key,count){const selected=rows.filter(x=>x.revision===revision),map=new Map();selected.forEach(x=>{if(x.ok&&x.check)map.set(x.check[key],x.check)});assert.equal(map.size,count,'Incomplete verification evidence');assert.ok(selected.some(x=>x.status==='COMPLETE'),'Missing completion evidence');return [...map.values()]}
const data=latest(resources,'resource',22),actions=latest(reads,'action',13)
const report={checkedAt:new Date().toISOString(),revision,sourceOfTruth:'SHEETS',authenticatedTransportTest:false,resources:data,totalRows:data.reduce((n,x)=>n+x.count,0),formulaCells:data.reduce((n,x)=>n+x.formulaCells,0),dateCells:data.reduce((n,x)=>n+x.dateCells,0),actions}
fs.writeFileSync(path.join(output,'production-verification-summary.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({revision,resources:data.length,rows:report.totalRows,actions:actions.length,formulaCells:report.formulaCells,dateCells:report.dateCells,sourceOfTruth:report.sourceOfTruth,authenticatedTransportTest:false}))
