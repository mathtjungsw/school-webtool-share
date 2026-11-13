/** Ordered, page-bounded replication archive. No triggers or live backend changes.
 * Only the atomic epoch control pointer publishes a fully read-back-verified run.
 * Apps must not read staging pages as current data. Serving indexes are separate.
 */
function migrationAssertCapture_(capture) {
  if (!capture || capture.schemaVersion !== 1 || !migrationResourceForSheet_(migrationCatalog_().filter(function(x) { return x.resource === capture.resource; }).map(function(x) { return x.sheetName; })[0]) ||
      typeof capture.present !== 'boolean' || !Array.isArray(capture.headers) || capture.headers.some(function(x) { return typeof x !== 'string'; }) ||
      !Array.isArray(capture.records) || capture.records.length > 10000 || (!capture.present && (capture.headers.length || capture.records.length))) throw migrationError_('MIGRATION_INVALID_CAPTURE');
  var ids = Object.create(null), last = -1;
  capture.records.forEach(function(row) {
    if (!row || typeof row.sourceId !== 'string' || !row.sourceId || row.sourceId.length > 512 || ids[row.sourceId] ||
        !Number.isSafeInteger(row.sortOrder) || row.sortOrder <= last || row.isDeleted !== false ||
        Object.keys(row).sort().join(',') !== 'isDeleted,payload,sortOrder,sourceId' ||
        migrationHash_(migrationEncode_(migrationDecode_(row.payload))) !== migrationHash_(row.payload)) throw migrationError_('MIGRATION_INVALID_CAPTURE');
    ids[row.sourceId] = true; last = row.sortOrder;
  });
  return capture;
}
function migrationDeltaAfter_(before, delta) {
  migrationAssertCapture_(before);
  if (!delta || delta.schemaVersion !== 1 || delta.resource !== before.resource || delta.beforeDigest !== migrationHash_(before) ||
      !Array.isArray(delta.puts) || !Array.isArray(delta.deletes)) throw migrationError_('MIGRATION_INVALID_DELTA');
  var rows = Object.create(null), seen = Object.create(null);
  before.records.forEach(function(row) { rows[row.sourceId] = row; });
  delta.deletes.forEach(function(row) {
    if (!row || !rows[row.sourceId] || seen[row.sourceId] || row.isDeleted !== true || row.sortOrder !== rows[row.sourceId].sortOrder) throw migrationError_('MIGRATION_INVALID_DELTA');
    seen[row.sourceId] = true; delete rows[row.sourceId];
  });
  delta.puts.forEach(function(row) {
    if (!row || seen[row.sourceId]) throw migrationError_('MIGRATION_INVALID_DELTA');
    seen[row.sourceId] = true; rows[row.sourceId] = row;
  });
  var after = migrationAssertCapture_({schemaVersion:1,resource:before.resource,present:delta.present,headers:delta.headers,
    records:Object.keys(rows).map(function(id) { return rows[id]; }).sort(function(a,b) { return a.sortOrder-b.sortOrder; })});
  if (migrationHash_(migrationResourceDelta_(before,after,delta.revision)) !== migrationHash_(delta)) throw migrationError_('MIGRATION_DELTA_VERIFICATION_FAILED');
  return after;
}
function migrationReplicaPlan_(store, descriptor, entries) {
  var pages = [], chunk = [], bytes = 1024;
  function finish() {
    if (!chunk.length) return;
    var payload = {entries:chunk};
    pages.push({ref:store.putBlob(payload),hash:migrationHash_(chunk),count:chunk.length}); chunk=[]; bytes=1024;
  }
  entries.forEach(function(entry) {
    var size = Utilities.newBlob(JSON.stringify(migrationEncode_(entry))).getBytes().length + 32;
    if (size > 210000) throw migrationError_('MIGRATION_REPLICA_ENTRY_TOO_LARGE');
    if (chunk.length >= 50 || bytes + size > 220000) finish();
    chunk.push(entry); bytes+=size;
  });
  finish();
  if (pages.length > 1024) throw migrationError_('MIGRATION_REPLICA_PLAN_TOO_LARGE');
  descriptor.pageHashes = pages.map(function(p) { return p.hash; });
  descriptor.pageCounts = pages.map(function(p) { return p.count; });
  var plan = {schemaVersion:1,descriptor:descriptor,planHash:migrationHash_(descriptor),pageRefs:pages.map(function(p) { return p.ref; })};
  return store.putBlob(plan);
}
function migrationAssertReplicaPlan_(plan) {
  if (!plan || plan.schemaVersion !== 1 || plan.planHash !== migrationHash_(plan.descriptor) ||
      !Array.isArray(plan.pageRefs) || plan.pageRefs.length !== plan.descriptor.pageHashes.length ||
      plan.pageRefs.length !== plan.descriptor.pageCounts.length || plan.pageRefs.some(function(ref) { return !/^[a-f0-9]{64}$/.test(ref); })) throw migrationError_('MIGRATION_REPLICA_PLAN_CORRUPT');
  return plan;
}
function migrationAssertTrackedSource_(book, suppliedConfig) {
  var config=suppliedConfig || migrationTrackingConfig_();
  if (!config || config.schemaVersion!==1 || config.enabled!==true || config.sourceBookId!==book.getId()) throw migrationError_('MIGRATION_TRACKING_REQUIRED');
}
function migrationFreezeBaseline_(book, resources, suppliedConfig) {
  return migrationWithSourceLock_(function() {
    migrationAssertTrackedSource_(book,suppliedConfig);
    var store=migrationSheetsStore_(book), status=store.status();
    if (status.pendingCount || status.reviewCount) throw migrationError_('MIGRATION_SOURCE_REVIEW_REQUIRED');
    var names=(resources || migrationCatalog_().map(function(x) { return x.resource; })).slice().sort();
    if (!names.length || names.some(function(name,i) { return names.indexOf(name)!==i || !migrationCatalog_().some(function(x) { return x.resource===name; }); })) throw migrationError_('MIGRATION_INVALID_RESOURCE');
    var heads=[], entries=[];
    names.forEach(function(resource) {
      var snapshot=migrationAssertCapture_(migrationCaptureResource_(book,store,resource));
      heads.push({resource:resource,beforeDigest:null,afterDigest:migrationHash_(snapshot),present:snapshot.present,headers:snapshot.headers,count:snapshot.records.length});
      snapshot.records.forEach(function(row) { entries.push({resource:resource,record:row}); });
    });
    // The frozen pages stay in the private source book; later ticks read one page,
    // not the live school workbook or all baseline row bodies again.
    return migrationReplicaPlan_(store,{schemaVersion:1,kind:'BASELINE',revision:status.highWater,sourceBookHash:migrationHash_(book.getId()),operationKey:null,resources:heads},entries);
  });
}
function migrationReplicaSource_(book, baselineRef, suppliedConfig) {
  var store=migrationSheetsStore_(book), frozen=null, readyPlans=Object.create(null);
  function locked(fn) { return migrationWithSourceLock_(fn); }
  function baseline() {
    migrationAssertTrackedSource_(book,suppliedConfig);
    // Immutable metadata can be reused within one bounded worker execution.
    // Activation is still checked each time; blocked/unreviewed plans are not cached.
    var plan=migrationAssertReplicaPlan_(frozen || store.readBlob(baselineRef));
    if (plan.descriptor.kind!=='BASELINE' || plan.descriptor.sourceBookHash!==migrationHash_(book.getId())) throw migrationError_('MIGRATION_SOURCE_MISMATCH');
    frozen=plan; return plan;
  }
  function planAt(revision) {
    if (readyPlans[revision]) return migrationAssertReplicaPlan_(readyPlans[revision]);
    return locked(function() {
      var base=baseline(), record=store.readRevision(revision), reviewRef=store.cachedRef(migrationHash_(['review',revision]));
      var review=reviewRef ? store.readBlob(reviewRef) : null;
      if (review && (!record || review.sourceRecordChecksum!==record.checksum || review.revision!==revision || review.decision!=='ACCEPT_OBSERVED_SOURCE')) throw migrationError_('MIGRATION_REVIEW_CORRUPT');
      if (record && record.phase!=='APPLIED' && !review) {
        if (record.phase!=='PREPARED' && record.phase!=='REVIEW_REQUIRED') throw migrationError_('MIGRATION_STORE_CORRUPT');
        return {blockedRevision:revision};
      }
      var cacheKey=migrationHash_(['replica-plan',baselineRef,revision,record ? record.checksum : 'GAP',reviewRef]);
      var cached=store.cachedRef(cacheKey);
      if (cached) {readyPlans[revision]=migrationAssertReplicaPlan_(store.readBlob(cached));return readyPlans[revision];}
      var resources=[], entries=[], evidence=review ? review.evidence : record ? record.evidence : [];
      var touched=record ? record.touched : [];
      if (migrationHash_(touched.map(function(x) {return x.resource;}).sort())!==migrationHash_(evidence.map(function(x) {return x.resource;}).sort())) throw migrationError_('MIGRATION_EVIDENCE_INCOMPLETE');
      touched.slice().sort(function(a,b) {return a.resource<b.resource?-1:1;}).forEach(function(item) {
        if (!base.descriptor.resources.some(function(x) {return x.resource===item.resource;})) throw migrationError_('MIGRATION_RESOURCE_OUTSIDE_BASELINE');
        var proof=evidence.filter(function(x) {return x.resource===item.resource;})[0];
        var before=store.readBlob(item.beforeRef), delta=store.readBlob(proof.deltaRef), after=migrationDeltaAfter_(before,delta);
        if (delta.revision!==revision || delta.afterDigest!==proof.digest || after.records.length!==proof.count) throw migrationError_('MIGRATION_EVIDENCE_MISMATCH');
        resources.push({resource:item.resource,beforeDigest:delta.beforeDigest,afterDigest:delta.afterDigest,present:after.present,headers:after.headers,count:after.records.length});
        delta.puts.concat(delta.deletes).forEach(function(row) {entries.push({resource:item.resource,record:row});});
      });
      var ref=migrationReplicaPlan_(store,{schemaVersion:1,kind:review?'RECONCILED':record?'DELTA':'GAP',revision:revision,sourceBookHash:base.descriptor.sourceBookHash,
        operationKey:record?record.intent.operationKey:null,sourceRecordChecksum:record?record.checksum:null,reviewRef:reviewRef,resources:resources},entries);
      store.remember(cacheKey,ref);
      readyPlans[revision]=migrationAssertReplicaPlan_(store.readBlob(ref));return readyPlans[revision];
    });
  }
  return {baseline: function() {return locked(baseline);}, planAt:planAt, highWater:function() {return locked(store.highWater);},
    page:function(plan,index) {return locked(function() {
      migrationAssertReplicaPlan_(plan); var page=store.readBlob(plan.pageRefs[index]);
      if (!page || migrationHash_(page.entries)!==plan.descriptor.pageHashes[index] || page.entries.length!==plan.descriptor.pageCounts[index]) throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT');
      return page.entries;
    });}};
}
function migrationReplicaControl_(baselineRef, base) {
  return {schemaVersion:1,sourceOfTruth:'SHEETS',baselineRef:baselineRef,baselinePlanHash:base.planHash,sourceBookHash:base.descriptor.sourceBookHash,
    baseRevision:base.descriptor.revision,appliedRevision:null,phase:'COPYING_BASELINE',chainHash:migrationHash_(['epoch',baselineRef]),resources:[]};
}
function migrationAssertReplicaControl_(control, baselineRef, base) {
  var initial=migrationReplicaControl_(baselineRef,base);
  ['schemaVersion','sourceOfTruth','baselineRef','baselinePlanHash','sourceBookHash','baseRevision'].forEach(function(key) {
    if (migrationHash_(control[key])!==migrationHash_(initial[key])) throw migrationError_('MIGRATION_REPLICA_CONTROL_MISMATCH');
  });
  if (!/^[a-f0-9]{64}$/.test(control.chainHash || '') || !Array.isArray(control.resources) ||
      (control.phase==='COPYING_BASELINE' ? migrationHash_(control)!==migrationHash_(initial) :
       control.phase!=='MIRRORING' || !Number.isSafeInteger(control.appliedRevision) || control.appliedRevision<control.baseRevision)) throw migrationError_('MIGRATION_REPLICA_CONTROL_CORRUPT');
  if (control.phase==='MIRRORING') {
    if (control.resources.length!==base.descriptor.resources.length) throw migrationError_('MIGRATION_REPLICA_CONTROL_CORRUPT');
    control.resources.forEach(function(head,i) {
      if (head.resource!==base.descriptor.resources[i].resource || !/^[a-f0-9]{64}$/.test(head.digest || '') ||
          !Number.isSafeInteger(head.revision) || head.revision<control.baseRevision || head.revision>control.appliedRevision ||
          !Number.isSafeInteger(head.count) || head.count<0 || typeof head.present!=='boolean' || !Array.isArray(head.headers)) throw migrationError_('MIGRATION_REPLICA_CONTROL_CORRUPT');
    });
  }
}
function migrationReplicaHeads_(control, descriptor) {
  var heads=Object.create(null);
  control.resources.forEach(function(head) {if (heads[head.resource]) throw migrationError_('MIGRATION_REPLICA_CONTROL_CORRUPT'); heads[head.resource]=head;});
  descriptor.resources.forEach(function(next) {
    var previous=heads[next.resource];
    if (descriptor.kind==='BASELINE' ? !!previous || next.beforeDigest!==null : !previous || previous.digest!==next.beforeDigest) throw migrationError_('MIGRATION_REPLICA_CHAIN_MISMATCH');
    heads[next.resource]={resource:next.resource,digest:next.afterDigest,present:next.present,headers:next.headers,count:next.count,revision:descriptor.revision};
  });
  return Object.keys(heads).sort().map(function(key) {return heads[key];});
}
function migrationReplicaStep_(repository, source, baselineRef) {
  if (!/^[a-f0-9]{64}$/.test(baselineRef || '')) throw migrationError_('MIGRATION_INVALID_BASELINE');
  var base=source.baseline(), root='replicaEpochs/'+baselineRef, controlDoc=repository.get(root);
  if (!controlDoc) { repository.commit([{path:root,data:migrationReplicaControl_(baselineRef,base),createOnly:true}]); return {status:'PROGRESS',stage:'INITIALIZED'}; }
  var control=controlDoc.data; migrationAssertReplicaControl_(control,baselineRef,base);
  var highWater=source.highWater();
  if (control.appliedRevision!==null && control.appliedRevision>highWater) throw migrationError_('MIGRATION_SOURCE_REVISION_REVERSED');
  if (control.phase==='MIRRORING' && control.appliedRevision===highWater) return {status:'IDLE',appliedRevision:control.appliedRevision};
  var plan=control.phase==='COPYING_BASELINE' ? base : source.planAt(control.appliedRevision+1);
  if (plan.blockedRevision) return {status:'NEEDS_REVIEW',blockedRevision:plan.blockedRevision,appliedRevision:control.appliedRevision};
  migrationAssertReplicaPlan_(plan);
  var descriptor=plan.descriptor, heads=migrationReplicaHeads_(control,descriptor), runPath=root+'/operations/r'+descriptor.revision;
  if (descriptor.sourceBookHash!==control.sourceBookHash || descriptor.revision!==(control.appliedRevision===null ? control.baseRevision : control.appliedRevision+1)) throw migrationError_('MIGRATION_REPLICA_REVISION_MISMATCH');
  var runDoc=repository.get(runPath);
  if (!runDoc) {
    repository.commit([{path:runPath,data:{schemaVersion:1,descriptor:descriptor,planHash:plan.planHash,nextPage:0,verifiedPages:0,phase:'STAGING'},createOnly:true}]);
    return {status:'PROGRESS',stage:'RUN_CREATED',revision:descriptor.revision};
  }
  var run=runDoc.data, count=descriptor.pageHashes.length;
  if (run.phase==='PUBLISHED' && run.planHash===plan.planHash) {
    // Another worker may have published between our control and run reads.
    var fresh=repository.get(root);
    if (fresh) {
      migrationAssertReplicaControl_(fresh.data,baselineRef,base);
      if (fresh.data.appliedRevision!==null && fresh.data.appliedRevision>=descriptor.revision) return {status:'PROGRESS',stage:'OBSERVED_PUBLICATION',revision:descriptor.revision};
    }
  }
  if (run.schemaVersion!==1 || run.planHash!==plan.planHash || migrationHash_(run.descriptor)!==plan.planHash || run.phase!=='STAGING' ||
      !Number.isSafeInteger(run.nextPage) || !Number.isSafeInteger(run.verifiedPages) || run.verifiedPages<0 || run.nextPage<run.verifiedPages || run.nextPage>count) throw migrationError_('MIGRATION_REPLICA_RUN_CORRUPT');
  if (run.verifiedPages<run.nextPage) {
    var index=run.verifiedPages, saved=repository.get(runPath+'/pages/p'+index);
    if (!saved || saved.data.schemaVersion!==1 || saved.data.index!==index || saved.data.hash!==descriptor.pageHashes[index] ||
        !Array.isArray(saved.data.entries) || saved.data.entries.length!==descriptor.pageCounts[index] || migrationHash_(saved.data.entries)!==saved.data.hash) throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT');
    run.verifiedPages++;
    repository.commit([{path:runPath,data:run,updateTime:runDoc.updateTime}]);
    return {status:'PROGRESS',stage:'PAGE_VERIFIED',revision:descriptor.revision,page:index};
  }
  if (run.nextPage<count) {
    var pageIndex=run.nextPage, entries=source.page(plan,pageIndex); run.nextPage++;
    repository.commit([{path:runPath+'/pages/p'+pageIndex,data:{schemaVersion:1,index:pageIndex,hash:descriptor.pageHashes[pageIndex],entries:entries},createOnly:true},
      {path:runPath,data:run,updateTime:runDoc.updateTime}]);
    return {status:'PROGRESS',stage:'PAGE_STAGED',revision:descriptor.revision,page:pageIndex};
  }
  run.phase='PUBLISHED';
  control.phase='MIRRORING'; control.appliedRevision=descriptor.revision; control.resources=heads; control.chainHash=migrationHash_([control.chainHash,plan.planHash]);
  repository.commit([{path:runPath,data:run,updateTime:runDoc.updateTime},{path:root,data:control,updateTime:controlDoc.updateTime}]);
  return {status:'PROGRESS',stage:'PUBLISHED',revision:descriptor.revision};
}
function migrationRunReplica_(repository,source,baselineRef,options) {
  options=options || {}; var steps=options.maxSteps===undefined?8:options.maxSteps, limit=options.maxMillis===undefined?45000:options.maxMillis;
  if (!Number.isInteger(steps) || steps<1 || steps>40 || !Number.isInteger(limit) || limit<1 || limit>180000) throw migrationError_('MIGRATION_INVALID_WORK_BUDGET');
  var started=Date.now(), result={status:'BUDGET_EXHAUSTED'}, completed=0;
  while (completed<steps && Date.now()-started<limit) {
    try { result=migrationReplicaStep_(repository,source,baselineRef); }
    catch(error) {
      if (error && (error.retryable || error.code==='MIGRATION_FIRESTORE_CONFLICT')) return {status:'RETRY_LATER',code:error.code,steps:completed};
      throw error;
    }
    completed++;
    if (result.status!=='PROGRESS') {result.steps=completed;return result;}
  }
  return {status:'BUDGET_EXHAUSTED',steps:completed,lastStage:result.stage || null};
}

/** Explicit full verification/readback; never called on ordinary app refreshes. */
function migrationReadReplica_(repository, baselineRef) {
  if (!/^[a-f0-9]{64}$/.test(baselineRef || '')) throw migrationError_('MIGRATION_INVALID_BASELINE');
  var root='replicaEpochs/'+baselineRef, document=repository.get(root);
  if (!document || document.data.phase!=='MIRRORING') throw migrationError_('MIGRATION_REPLICA_NOT_PUBLISHED');
  var target=document.data, captures=Object.create(null), tombstones=Object.create(null), chain=migrationHash_(['epoch',baselineRef]);
  if (!Number.isSafeInteger(target.baseRevision) || !Number.isSafeInteger(target.appliedRevision) || target.appliedRevision<target.baseRevision || target.appliedRevision-target.baseRevision>10000) throw migrationError_('MIGRATION_REPLICA_VERIFY_WINDOW');
  var heads=[];
  for (var revision=target.baseRevision;revision<=target.appliedRevision;revision++) {
    var runPath=root+'/operations/r'+revision, run=repository.get(runPath), entries=[];
    if (!run || run.data.phase!=='PUBLISHED' || run.data.planHash!==migrationHash_(run.data.descriptor)) throw migrationError_('MIGRATION_REPLICA_NOT_PUBLISHED');
    var descriptor=run.data.descriptor;
    if (descriptor.revision!==revision || descriptor.sourceBookHash!==target.sourceBookHash ||
        (revision===target.baseRevision ? descriptor.kind!=='BASELINE' || run.data.planHash!==target.baselinePlanHash : ['DELTA','GAP','RECONCILED'].indexOf(descriptor.kind)<0) ||
        run.data.nextPage!==descriptor.pageHashes.length || run.data.verifiedPages!==descriptor.pageHashes.length) throw migrationError_('MIGRATION_REPLICA_RUN_CORRUPT');
    for (var index=0;index<descriptor.pageHashes.length;index++) {
      var page=repository.get(runPath+'/pages/p'+index);
      if (!page || page.data.index!==index || page.data.hash!==descriptor.pageHashes[index] || page.data.entries.length!==descriptor.pageCounts[index] ||
          migrationHash_(page.data.entries)!==page.data.hash) throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT');
      entries=entries.concat(page.data.entries);
    }
    var permitted=Object.create(null);
    descriptor.resources.forEach(function(meta) {
      if (permitted[meta.resource]) throw migrationError_('MIGRATION_REPLICA_RUN_CORRUPT'); permitted[meta.resource]=true;
      var before=captures[meta.resource];
      if (descriptor.kind==='BASELINE' ? !!before || meta.beforeDigest!==null : !before || migrationHash_(before)!==meta.beforeDigest) throw migrationError_('MIGRATION_REPLICA_CHAIN_MISMATCH');
      var rows=Object.create(null), changed=Object.create(null);
      if (before) before.records.forEach(function(row){rows[row.sourceId]=row;});
      if (!tombstones[meta.resource]) tombstones[meta.resource]=Object.create(null);
      entries.filter(function(entry){return entry.resource===meta.resource;}).forEach(function(entry) {
        var row=entry.record;
        if (changed[row.sourceId]) throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT'); changed[row.sourceId]=true;
        if (row.isDeleted) {
          if (!rows[row.sourceId]) throw migrationError_('MIGRATION_REPLICA_CHAIN_MISMATCH');
          delete rows[row.sourceId]; tombstones[meta.resource][row.sourceId]=revision;
        } else { rows[row.sourceId]=row; delete tombstones[meta.resource][row.sourceId]; }
      });
      var after=migrationAssertCapture_({schemaVersion:1,resource:meta.resource,present:meta.present,headers:meta.headers,
        records:Object.keys(rows).map(function(id){return rows[id];}).sort(function(a,b){return a.sortOrder-b.sortOrder;})});
      if (after.records.length!==meta.count || migrationHash_(after)!==meta.afterDigest) throw migrationError_('MIGRATION_REPLICA_CONTENT_MISMATCH');
      captures[meta.resource]=after;
    });
    if (entries.some(function(entry){return !permitted[entry.resource];})) throw migrationError_('MIGRATION_REPLICA_PAGE_CORRUPT');
    heads=migrationReplicaHeads_({resources:heads},descriptor); chain=migrationHash_([chain,run.data.planHash]);
  }
  if (chain!==target.chainHash || migrationHash_(heads)!==migrationHash_(target.resources)) throw migrationError_('MIGRATION_REPLICA_CHAIN_MISMATCH');
  return {appliedRevision:target.appliedRevision,resources:captures,tombstones:tombstones,chainHash:chain};
}
