/** Content-addressed serving snapshots. Publishing this mirror never switches the
 * application's backend. Readers pin one root and fetch only requested resources. */
function migrationGetMany_(repo,paths) {
  var result=[];
  for (var i=0;i<paths.length;i+=100) result=result.concat(repo.batchGet(paths.slice(i,i+100)));
  return result;
}
function migrationServingPlan_(capture) {
  migrationAssertCapture_(capture);
  var chunks=[],records=[],bytes=1024;
  function finish(){if(records.length){var data={schemaVersion:1,resource:capture.resource,records:records};chunks.push({ref:migrationHash_(data),data:data});records=[];bytes=1024;}}
  capture.records.forEach(function(row){
    var size=Utilities.newBlob(JSON.stringify(migrationEncode_(row))).getBytes().length+32;
    if(size>210000)throw migrationError_('MIGRATION_SERVING_ROW_TOO_LARGE');
    if(records.length>=50 || bytes+size>220000)finish();records.push(row);bytes+=size;
  });finish();
  var digest=migrationHash_(capture);
  return {digest:digest,chunks:chunks,manifest:{schemaVersion:1,resource:capture.resource,present:capture.present,headers:capture.headers,count:capture.records.length,digest:digest,chunkRefs:chunks.map(function(x){return x.ref;})}};
}
function migrationStageServing_(repo,capture) {
  var plan=migrationServingPlan_(capture),path='servingResources/'+plan.digest,manifest=repo.get(path);
  if(manifest){
    if(migrationHash_(manifest.data)!==migrationHash_(plan.manifest))throw migrationError_('MIGRATION_SERVING_CONFLICT');
    return plan.digest;
  }
  var paths=plan.chunks.map(function(x){return 'servingChunks/'+x.ref;}),saved=migrationGetMany_(repo,paths),missing=[];
  plan.chunks.forEach(function(chunk,i){
    if(saved[i]){if(migrationHash_(saved[i].data)!==chunk.ref)throw migrationError_('MIGRATION_SERVING_CORRUPT');}
    else missing.push({path:paths[i],data:chunk.data,createOnly:true});
  });
  for(var start=0;start<missing.length;start+=25)repo.commit(missing.slice(start,start+25));
  var verified=migrationGetMany_(repo,missing.map(function(x){return x.path;}));
  verified.forEach(function(doc,i){if(!doc || migrationHash_(doc.data)!==missing[i].path.split('/')[1])throw migrationError_('MIGRATION_SERVING_CORRUPT');});
  repo.commit([{path:path,data:plan.manifest,createOnly:true}]);
  var confirmed=repo.get(path);
  if(!confirmed || migrationHash_(confirmed.data)!==migrationHash_(plan.manifest))throw migrationError_('MIGRATION_SERVING_CORRUPT');
  return plan.digest;
}
function migrationReadServingResource_(repo,head) {
  if(!head || !/^[a-f0-9]{64}$/.test(head.digest || ''))throw migrationError_('MIGRATION_SERVING_NOT_READY');
  var document=repo.get('servingResources/'+head.digest),m=document && document.data;
  if(!m || m.schemaVersion!==1 || m.resource!==head.resource || m.digest!==head.digest || !Array.isArray(m.chunkRefs) || m.chunkRefs.length>1024 ||
    m.chunkRefs.some(function(ref,i){return !/^[a-f0-9]{64}$/.test(ref) || m.chunkRefs.indexOf(ref)!==i;}))throw migrationError_('MIGRATION_SERVING_CORRUPT');
  var rows=[],chunks=migrationGetMany_(repo,m.chunkRefs.map(function(ref){return 'servingChunks/'+ref;}));
  chunks.forEach(function(doc,i){
    if(!doc || migrationHash_(doc.data)!==m.chunkRefs[i] || doc.data.schemaVersion!==1 || doc.data.resource!==head.resource || !Array.isArray(doc.data.records))throw migrationError_('MIGRATION_SERVING_CORRUPT');
    rows=rows.concat(doc.data.records);
  });
  var capture=migrationAssertCapture_({schemaVersion:1,resource:m.resource,present:m.present,headers:m.headers,records:rows});
  if(rows.length!==m.count || migrationHash_(capture)!==head.digest || (head.count!==undefined && head.count!==m.count))throw migrationError_('MIGRATION_SERVING_CORRUPT');
  return capture;
}
function migrationServingStep_(repo,baselineRef) {
  if(!/^[a-f0-9]{64}$/.test(baselineRef || ''))throw migrationError_('MIGRATION_INVALID_BASELINE');
  var archivePath='replicaEpochs/'+baselineRef,archive=repo.get(archivePath);
  if(!archive || archive.data.phase!=='MIRRORING')return {status:'WAITING_FOR_ARCHIVE'};
  var target=archive.data,root='servingEpochs/'+baselineRef,existing=repo.get(root),current=existing && existing.data;
  if(current && (current.schemaVersion!==1 || current.phase!=='SHADOW' || current.sourceOfTruth!=='SHEETS' || current.baselineRef!==baselineRef ||
    current.sourceBookHash!==target.sourceBookHash || current.baseRevision!==target.baseRevision || !Number.isSafeInteger(current.appliedRevision) ||
    current.appliedRevision<target.baseRevision || current.appliedRevision>target.appliedRevision))throw migrationError_('MIGRATION_SERVING_ROOT_CORRUPT');
  if(current && current.appliedRevision===target.appliedRevision){
    if(current.chainHash!==target.chainHash || migrationHash_(current.resources)!==migrationHash_(target.resources))throw migrationError_('MIGRATION_SERVING_CHAIN_MISMATCH');
    return {status:'IDLE',appliedRevision:current.appliedRevision};
  }
  var revision=current?current.appliedRevision+1:target.baseRevision,runPath=archivePath+'/operations/r'+revision,document=repo.get(runPath),run=document && document.data;
  if(!run || run.phase!=='PUBLISHED' || run.planHash!==migrationHash_(run.descriptor))throw migrationError_('MIGRATION_REPLICA_NOT_PUBLISHED');
  var d=run.descriptor;
  if(d.revision!==revision || d.sourceBookHash!==target.sourceBookHash || !Array.isArray(d.pageHashes) || d.pageHashes.length>1024 ||
    run.nextPage!==d.pageHashes.length || run.verifiedPages!==d.pageHashes.length ||
    (current?['DELTA','RECONCILED','GAP'].indexOf(d.kind)<0:d.kind!=='BASELINE' || run.planHash!==target.baselinePlanHash))throw migrationError_('MIGRATION_REPLICA_RUN_CORRUPT');
  var pages=migrationGetMany_(repo,d.pageHashes.map(function(_,i){return runPath+'/pages/p'+i;})),entries=[];
  pages.forEach(function(page,i){
    if(!page || page.data.index!==i || page.data.hash!==d.pageHashes[i] || !Array.isArray(page.data.entries) || page.data.entries.length!==d.pageCounts[i] || migrationHash_(page.data.entries)!==d.pageHashes[i])throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT');
    entries=entries.concat(page.data.entries);
  });
  var previous=current?current.resources:[],heads=migrationReplicaHeads_({resources:previous},d),permitted=Object.create(null);
  d.resources.forEach(function(meta){
    if(permitted[meta.resource])throw migrationError_('MIGRATION_SERVING_CORRUPT');permitted[meta.resource]=true;
    var head=previous.filter(function(x){return x.resource===meta.resource;})[0],rows=Object.create(null),changed=Object.create(null);
    if(current)migrationReadServingResource_(repo,head).records.forEach(function(row){rows[row.sourceId]=row;});
    entries.filter(function(x){return x.resource===meta.resource;}).forEach(function(entry){
      var row=entry.record;
      if(changed[row.sourceId])throw migrationError_('MIGRATION_SERVING_CORRUPT');changed[row.sourceId]=true;
      if(row.isDeleted){if(!rows[row.sourceId])throw migrationError_('MIGRATION_SERVING_CHAIN_MISMATCH');delete rows[row.sourceId];}
      else rows[row.sourceId]=row;
    });
    var capture=migrationAssertCapture_({schemaVersion:1,resource:meta.resource,present:meta.present,headers:meta.headers,
      records:Object.keys(rows).map(function(id){return rows[id];}).sort(function(a,b){return a.sortOrder-b.sortOrder;})});
    if(capture.records.length!==meta.count || migrationHash_(capture)!==meta.afterDigest)throw migrationError_('MIGRATION_SERVING_CHAIN_MISMATCH');
    migrationStageServing_(repo,capture);
  });
  if(entries.some(function(x){return !permitted[x.resource];}))throw migrationError_('MIGRATION_SERVING_CORRUPT');
  var next={schemaVersion:1,phase:'SHADOW',sourceOfTruth:'SHEETS',baselineRef:baselineRef,sourceBookHash:target.sourceBookHash,baseRevision:target.baseRevision,
    appliedRevision:revision,resources:heads,chainHash:migrationHash_([current?current.chainHash:migrationHash_(['epoch',baselineRef]),run.planHash])};
  if(revision===target.appliedRevision && (next.chainHash!==target.chainHash || migrationHash_(heads)!==migrationHash_(target.resources)))throw migrationError_('MIGRATION_SERVING_CHAIN_MISMATCH');
  repo.commit([{path:root,data:next,createOnly:!existing,updateTime:existing && existing.updateTime}]);
  return {status:'PROGRESS',appliedRevision:revision,resourcesChanged:d.resources.length};
}
function migrationServingReader_(repo,baselineRef) {
  if(!/^[a-f0-9]{64}$/.test(baselineRef || ''))throw migrationError_('MIGRATION_INVALID_BASELINE');
  var doc=repo.get('servingEpochs/'+baselineRef),root=doc && doc.data,cache=Object.create(null);
  if(!root || root.schemaVersion!==1 || root.phase!=='SHADOW' || root.sourceOfTruth!=='SHEETS' || root.baselineRef!==baselineRef || !Array.isArray(root.resources) || !Number.isSafeInteger(root.appliedRevision))throw migrationError_('MIGRATION_SERVING_NOT_READY');
  return {revision:root.appliedRevision,root:root,resource:function(name){
    var head=root.resources.filter(function(x){return x.resource===name;});
    if(head.length!==1)throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');
    if(!cache[name])cache[name]=migrationReadServingResource_(repo,head[0]);
    // Isolate caller edits; no remote write is implied by modifying a result.
    return migrationDecode_(migrationEncode_(cache[name]));
  }};
}
