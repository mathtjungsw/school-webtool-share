'use strict'
function repoFixture(ctx){
  const docs=new Map(),metrics={gets:0,writes:0,commits:0};let clock=0,fault=null
  const clone=x=>ctx.migrationDecode_(ctx.migrationEncode_(x))
  const repo={docs,metrics,setFault:f=>{fault=f},get(path){metrics.gets++;if(fault)fault('get',path);const d=docs.get(path);return d?{data:clone(d.data),updateTime:d.updateTime}:null},
    batchGet(paths){return paths.map(path=>repo.get(path))},
    list(){throw Error('Worker must never list or download the full database')},
    commit(writes){
      if(fault)fault('before',writes)
      for(const w of writes){const d=docs.get(w.path);if((w.createOnly&&d)||(w.updateTime&&d?.updateTime!==w.updateTime))throw ctx.migrationError_('MIGRATION_FIRESTORE_CONFLICT')}
      for(const w of writes)docs.set(w.path,{data:clone(w.data),updateTime:String(++clock)})
      metrics.writes+=writes.length;metrics.commits++;if(fault)fault('after',writes)
    }}
  return repo
}
module.exports={repoFixture}
