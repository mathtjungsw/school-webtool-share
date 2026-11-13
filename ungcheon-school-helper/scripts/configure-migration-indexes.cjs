'use strict'
// Only the named migration payload fields; preserves rules, TTL and other indexes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const project='ungcheon-school-helper',prefix=`projects/${project}/databases/(default)`,api='https://firestore.googleapis.com/v1/'
async function main(){
  const auth=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.clasprc.json'),'utf8')).tokens.default
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'})})
  if(!tokenResponse.ok)throw Error('Token refresh failed')
  const token=(await tokenResponse.json()).access_token
  async function call(name,method='GET',body){
    const response=await fetch(api+name,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body&&JSON.stringify(body)})
    if(!response.ok)throw Error(`Firestore configuration HTTP ${response.status}`)
    return response.json()
  }
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../firebase/firestore.indexes.json'),'utf8')),results=[]
  for(const field of config.fieldOverrides){
    if(!/^(records|pages|operations|replicaEpochs|servingChunks|servingResources|servingEpochs|rehearsalEpochs|rehearsalReceipts|primaryEpochs|primaryCommits|primaryReceipts|sheetBackups)$/.test(field.collectionGroup)||!/^\w+$/.test(field.fieldPath)||field.indexes.length)throw Error('Unexpected field configuration')
    const name=`${prefix}/collectionGroups/${field.collectionGroup}/fields/${field.fieldPath}`
    let current=await call(name),changed=false
    // Protobuf JSON omits false booleans. An explicit empty indexConfig is the
    // stored exemption; only a true inherited/reverting flag means otherwise.
    if(!current.indexConfig || current.indexConfig.usesAncestorConfig===true || current.indexConfig.reverting===true || (current.indexConfig.indexes||[]).length){
      if(process.argv.includes('--verify'))throw Error('Index exemption not applied')
      const operation=await call(name+'?updateMask=indexConfig','PATCH',{name,indexConfig:{indexes:[]}})
      if(operation.error)throw Error('Index operation failed')
      changed=true
    }
    current=await call(name)
    if(!current.indexConfig || current.indexConfig.usesAncestorConfig===true || current.indexConfig.reverting===true || (current.indexConfig.indexes||[]).length)throw Error('Index exemption readback failed')
    results.push({collectionGroup:field.collectionGroup,fieldPath:field.fieldPath,changed,exempt:true})
  }
  const report={project,checkedAt:new Date().toISOString(),rulesChanged:false,dataChanged:false,fields:results}
  fs.writeFileSync(path.join(__dirname,'../out/migration-index-exemptions.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
}
main().catch(error=>{console.error(String(error.message));process.exitCode=1})
