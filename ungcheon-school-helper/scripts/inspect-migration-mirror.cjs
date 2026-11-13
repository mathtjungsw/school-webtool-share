'use strict'
// Fixed, read-only metadata inspection. Never requests row payloads or credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root='https://firestore.googleapis.com/v1/projects/ungcheon-school-helper/databases/(default)/documents/schools/ungcheon/'
async function main(){
  const auth=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.clasprc.json'),'utf8')).tokens.default
  const refreshed=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'})})
  if(!refreshed.ok)throw Error('Token refresh failed')
  const token=(await refreshed.json()).access_token
  async function list(collection,fields){
    const query=new URLSearchParams({pageSize:'100'});fields.forEach(field=>query.append('mask.fieldPaths',field))
    const response=await fetch(root+collection+'?'+query,{headers:{Authorization:`Bearer ${token}`}})
    if(!response.ok)throw Error('Metadata inspection HTTP '+response.status)
    const result=await response.json();if(result.nextPageToken)throw Error('Metadata page exceeds inspection limit')
    return (result.documents||[]).map(doc=>({id:doc.name.split('/').pop(),fields:doc.fields||{},updateTime:doc.updateTime}))
  }
  function scalar(value){if(!value)return null;if('integerValue'in value)return Number(value.integerValue);return value.stringValue??value.booleanValue??null}
  function summary(doc){const f=doc.fields;return {id:doc.id,phase:scalar(f.phase),sourceOfTruth:scalar(f.sourceOfTruth),baseRevision:scalar(f.baseRevision),appliedRevision:scalar(f.appliedRevision),updateTime:doc.updateTime}}
  const archives=await list('replicaEpochs',['phase','sourceOfTruth','baseRevision','appliedRevision']),serving=await list('servingEpochs',['phase','sourceOfTruth','baseRevision','appliedRevision']),runs=[]
  for(const epoch of archives){
    if(!/^[a-f0-9]{64}$/.test(epoch.id))throw Error('Unexpected epoch identity')
    const documents=await list('replicaEpochs/'+epoch.id+'/operations',['phase','nextPage','verifiedPages','descriptor.revision','descriptor.pageHashes'])
    for(const doc of documents){const f=doc.fields,d=f.descriptor?.mapValue?.fields||{};runs.push({baselineRef:epoch.id,id:doc.id,phase:scalar(f.phase),revision:scalar(d.revision),staged:scalar(f.nextPage),verified:scalar(f.verifiedPages),pages:d.pageHashes?.arrayValue?.values?.length||0})}
  }
  const primaryDocuments=await list('primaryEpochs',['phase','sourceOfTruth','baseRevision','revision','activatedAt']),primary=[]
  for(const epoch of primaryDocuments){
    if(!/^[a-f0-9]{64}$/.test(epoch.id))throw Error('Unexpected primary identity')
    const backups=await list('primaryEpochs/'+epoch.id+'/sheetBackups',['verifiedRevision','verifiedAt'])
    primary.push({...summary(epoch),revision:scalar(epoch.fields.revision),activatedAt:scalar(epoch.fields.activatedAt),backups:backups.map(doc=>({id:doc.id,verifiedRevision:scalar(doc.fields.verifiedRevision),verifiedAt:scalar(doc.fields.verifiedAt)}))})
  }
  const report={checkedAt:new Date().toISOString(),readOnly:true,archives:archives.map(summary),serving:serving.map(summary),runs,primary}
  fs.writeFileSync(path.join(__dirname,'../out/migration-mirror-status.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}
main().catch(error=>{console.error(String(error.message));process.exitCode=1})
