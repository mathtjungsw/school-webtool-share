/** Owner/admin recovery primitives; not exposed as HTTP actions or run by a timer.
 * Accepting observed state does not assert business success and never replays the
 * source request, manufactures a receipt, or overwrites its original journal row.
 */
function migrationReviewPlan_(book, revision) {
  return migrationWithSourceLock_(function() {
    var store=migrationSheetsStore_(book), record=store.readRevision(revision), highWater=store.highWater();
    if (!record || ['PREPARED','REVIEW_REQUIRED'].indexOf(record.phase)<0) throw migrationError_('MIGRATION_REVIEW_NOT_REQUIRED');
    if (store.cachedRef(migrationHash_(['review',revision]))) throw migrationError_('MIGRATION_ALREADY_REVIEWED');
    if (highWater-revision>1000) throw migrationError_('MIGRATION_REVIEW_WINDOW_TOO_LARGE');
    var nextBefore=Object.create(null);
    for (var i=revision+1;i<=highWater;i++) {
      var later=store.readRevision(i);
      if (!later) continue;
      later.touched.forEach(function(touch) {
        if (!nextBefore[touch.resource]) nextBefore[touch.resource]={ref:touch.beforeRef,revision:i,recordChecksum:later.checksum};
      });
    }
    var evidence=[], origins=[], changes=[];
    record.touched.forEach(function(item) {
      var before=migrationAssertCapture_(store.readBlob(item.beforeRef)), next=nextBefore[item.resource];
      var after=migrationAssertCapture_(next ? store.readBlob(next.ref) : migrationCaptureResource_(book,store,item.resource));
      var delta=migrationResourceDelta_(before,after,revision);
      migrationDeltaAfter_(before,delta);
      evidence.push({resource:item.resource,deltaRef:store.putBlob(delta),digest:delta.afterDigest,count:delta.count});
      origins.push({resource:item.resource,fromRevision:next?next.revision:null,fromRecordChecksum:next?next.recordChecksum:null,
        afterRef:store.putBlob(after),afterDigest:delta.afterDigest});
      changes.push({resource:item.resource,beforeDigest:delta.beforeDigest,afterDigest:delta.afterDigest,count:delta.count,
        putCount:delta.puts.length,deleteCount:delta.deletes.length,source:next?'NEXT_BEFORE_IMAGE':'CURRENT_SOURCE'});
    });
    var plan={schemaVersion:1,kind:'REVIEW_PLAN',revision:revision,sourceBookHash:migrationHash_(book.getId()),sourceRecordChecksum:record.checksum,
      observedHighWater:highWater,evidence:evidence,origins:origins};
    return {planRef:store.putBlob(plan),revision:revision,sourceRecordChecksum:record.checksum,observedHighWater:highWater,changes:changes};
  });
}
function migrationConfirmReview_(book, planRef, decision, reviewerHash) {
  if (decision!=='ACCEPT_OBSERVED_SOURCE' || !/^[a-f0-9]{64}$/.test(reviewerHash || '')) throw migrationError_('MIGRATION_EXPLICIT_REVIEW_REQUIRED');
  return migrationWithSourceLock_(function() {
    var store=migrationSheetsStore_(book), plan=store.readBlob(planRef);
    if (!plan || plan.schemaVersion!==1 || plan.kind!=='REVIEW_PLAN' || plan.sourceBookHash!==migrationHash_(book.getId())) throw migrationError_('MIGRATION_REVIEW_CORRUPT');
    var record=store.readRevision(plan.revision), key=migrationHash_(['review',plan.revision]), existingRef=store.cachedRef(key);
    if (!record || record.checksum!==plan.sourceRecordChecksum || ['PREPARED','REVIEW_REQUIRED'].indexOf(record.phase)<0) throw migrationError_('MIGRATION_REVIEW_STALE');
    if (existingRef) {
      var existing=store.readBlob(existingRef);
      if (existing.planRef!==planRef || existing.decision!==decision || existing.reviewerHash!==reviewerHash) throw migrationError_('MIGRATION_REVIEW_CONFLICT');
      return {accepted:true,duplicate:true,revision:plan.revision};
    }
    if (store.highWater()!==plan.observedHighWater) throw migrationError_('MIGRATION_REVIEW_STALE');
    if (migrationHash_(record.touched.map(function(x){return x.resource;}).sort())!==migrationHash_(plan.origins.map(function(x){return x.resource;}).sort())) throw migrationError_('MIGRATION_REVIEW_CORRUPT');
    plan.origins.forEach(function(origin) {
      var actual;
      if (origin.fromRevision!==null) {
        var later=store.readRevision(origin.fromRevision);
        if (!later || later.checksum!==origin.fromRecordChecksum) throw migrationError_('MIGRATION_REVIEW_STALE');
        var touch=later.touched.filter(function(x){return x.resource===origin.resource;})[0];
        if (!touch) throw migrationError_('MIGRATION_REVIEW_STALE');
        actual=store.readBlob(touch.beforeRef);
      } else actual=migrationCaptureResource_(book,store,origin.resource);
      if (migrationHash_(actual)!==origin.afterDigest || migrationHash_(store.readBlob(origin.afterRef))!==origin.afterDigest) throw migrationError_('MIGRATION_REVIEW_STALE');
    });
    var resolution={schemaVersion:1,revision:plan.revision,sourceBookHash:plan.sourceBookHash,sourceRecordChecksum:record.checksum,
      planRef:planRef,decision:decision,reviewerHash:reviewerHash,evidence:plan.evidence};
    store.remember(key,store.putBlob(resolution));
    return {accepted:true,duplicate:false,revision:plan.revision};
  });
}
