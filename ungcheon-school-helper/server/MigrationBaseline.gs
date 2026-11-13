/** Resumable R0 capture. Each invocation holds the writer lock for one resource
 * capture or one bounded page, never for the entire school workbook. */
function migrationBaselineStep_(book, jobKey) {
  return migrationWithSourceLock_(function() {
    migrationAssertTrackedSource_(book);
    var props=PropertiesService.getScriptProperties(), store=migrationSheetsStore_(book);
    var ref=props.getProperty(jobKey), job=ref ? store.readBlob(ref) : null;
    function save() {props.setProperty(jobKey,store.putBlob(job));}
    if (!job) {
      var status=store.status();
      if (status.pendingCount || status.reviewCount) throw migrationError_('MIGRATION_SOURCE_REVIEW_REQUIRED');
      job={schemaVersion:1,kind:'BASELINE_JOB',sourceBookHash:migrationHash_(book.getId()),revision:status.highWater,
        names:migrationCatalog_().map(function(x){return x.resource;}).sort(),captures:[],heads:[],pages:[],resourceIndex:0,rowIndex:0,baselineRef:null};
      save();return {status:'STARTED',baseRevision:job.revision};
    }
    if (job.schemaVersion!==1 || job.kind!=='BASELINE_JOB' || job.sourceBookHash!==migrationHash_(book.getId())) throw migrationError_('MIGRATION_BASELINE_JOB_CORRUPT');
    if (job.baselineRef) return {status:'COMPLETE',baseRevision:job.revision,baselineRef:job.baselineRef};
    if (job.captures.length<job.names.length) {
      var name=job.names[job.captures.length], high=store.highWater(), snapshot=null;
      if (high-job.revision>1000) throw migrationError_('MIGRATION_BASELINE_WINDOW_TOO_LARGE');
      // The first later touch contains the state at R0, even if that later
      // operation is still PREPARED. Never capture a mixture of live revisions.
      for (var r=job.revision+1;r<=high;r++) {
        var record=store.readRevision(r);
        var touch=record && record.touched.filter(function(x){return x.resource===name;})[0];
        if (touch) {snapshot=store.readBlob(touch.beforeRef);break;}
      }
      snapshot=migrationAssertCapture_(snapshot || migrationCaptureResource_(book,store,name));
      if (snapshot.resource!==name) throw migrationError_('MIGRATION_BASELINE_JOB_CORRUPT');
      job.captures.push(store.putBlob(snapshot));
      job.heads.push({resource:name,beforeDigest:null,afterDigest:migrationHash_(snapshot),present:snapshot.present,headers:snapshot.headers,count:snapshot.records.length});
      save();return {status:'CAPTURING',baseRevision:job.revision,completedResources:job.captures.length,totalResources:job.names.length};
    }
    if (job.resourceIndex<job.names.length) {
      // readBlob verifies the immutable capture's content hash. Its row schema
      // was already checked before this exact ref entered the job; do not repeat
      // thousands of per-row codec/hash calls for every 50-row page.
      var capture=store.readBlob(job.captures[job.resourceIndex]);
      if (!capture || capture.resource!==job.names[job.resourceIndex] || migrationHash_(capture)!==job.heads[job.resourceIndex].afterDigest) throw migrationError_('MIGRATION_BASELINE_JOB_CORRUPT');
      var entries=[],bytes=1024,index=job.rowIndex;
      while (index<capture.records.length && entries.length<50) {
        var entry={resource:capture.resource,record:capture.records[index]};
        var size=Utilities.newBlob(JSON.stringify(migrationEncode_(entry))).getBytes().length+32;
        if (size>210000) throw migrationError_('MIGRATION_REPLICA_ENTRY_TOO_LARGE');
        if (bytes+size>220000) break;
        entries.push(entry);bytes+=size;index++;
      }
      if (entries.length) job.pages.push({ref:store.putBlob({entries:entries}),hash:migrationHash_(entries),count:entries.length});
      if (job.pages.length>1024) throw migrationError_('MIGRATION_REPLICA_PLAN_TOO_LARGE');
      job.rowIndex=index;
      if (index===capture.records.length) {job.resourceIndex++;job.rowIndex=0;}
      save();return {status:'PAGING',baseRevision:job.revision,completedResources:job.resourceIndex,totalResources:job.names.length,pages:job.pages.length};
    }
    var descriptor={schemaVersion:1,kind:'BASELINE',revision:job.revision,sourceBookHash:job.sourceBookHash,operationKey:null,resources:job.heads,
      pageHashes:job.pages.map(function(p){return p.hash;}),pageCounts:job.pages.map(function(p){return p.count;})};
    job.baselineRef=store.putBlob({schemaVersion:1,descriptor:descriptor,planHash:migrationHash_(descriptor),pageRefs:job.pages.map(function(p){return p.ref;})});
    save();return {status:'COMPLETE',baseRevision:job.revision,baselineRef:job.baselineRef};
  });
}
