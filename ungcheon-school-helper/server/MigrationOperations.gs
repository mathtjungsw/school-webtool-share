/** Owner setup and authenticated manual operations. No automatic activation/trigger.
 * Deployment evidence is supplied by the owner after the fixed deployment check;
 * the elapsed barrier alone does NOT attest to what code is actually deployed.
 */
function migrationOperationsConfig_() {
  var text=PropertiesService.getScriptProperties().getProperty('UNG_MIGRATION_OPERATIONS_V1');
  if (!text) return null;
  var c; try { c=JSON.parse(text); } catch (_) { throw migrationError_('MIGRATION_INVALID_OPERATIONS_CONFIG'); }
  if (c.schemaVersion!==1 || !/^[\w-]+$/.test(c.sourceBookId || '') || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.projectId || '') ||
      !/^[a-z0-9-]{1,64}$/.test(c.schoolId || '') || !Number.isSafeInteger(c.preparedAt) || !Number.isSafeInteger(c.notBefore) || c.notBefore<c.preparedAt+600000 ||
      !Number.isSafeInteger(c.deploymentVersion) || c.deploymentVersion<1 || !/^[a-f0-9]{64}$/.test(c.sourceFingerprint || '') ||
      (c.baselineRef!==null && !/^[a-f0-9]{64}$/.test(c.baselineRef || ''))) throw migrationError_('MIGRATION_INVALID_OPERATIONS_CONFIG');
  return c;
}
function migrationOperationsBook_(config) {
  var book=SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId()!==config.sourceBookId) throw migrationError_('MIGRATION_SOURCE_MISMATCH');
  return book;
}
function migrationOperationsSaveConfig_(config) {
  PropertiesService.getScriptProperties().setProperty('UNG_MIGRATION_OPERATIONS_V1',JSON.stringify(config));
  if (migrationHash_(migrationOperationsConfig_())!==migrationHash_(config)) throw migrationError_('MIGRATION_CONFIG_NOT_CONFIRMED');
}
function migrationOperationsState_() {
  var text=PropertiesService.getScriptProperties().getProperty('UNG_MIGRATION_REPLICA_STATE_V1');
  if (!text) return {schemaVersion:1,paused:false,invalidated:false,lease:null,lastRun:null};
  var state; try {state=JSON.parse(text);} catch (_) {throw migrationError_('MIGRATION_STATE_CORRUPT');}
  if (state.schemaVersion!==1 || typeof state.paused!=='boolean' || (state.invalidated!==undefined && typeof state.invalidated!=='boolean') || (state.lease &&
      (typeof state.lease.id!=='string' || !Number.isSafeInteger(state.lease.expiresAt)))) throw migrationError_('MIGRATION_STATE_CORRUPT');
  return state;
}
function migrationOperationsSaveState_(state) {
  PropertiesService.getScriptProperties().setProperty('UNG_MIGRATION_REPLICA_STATE_V1',JSON.stringify(state));
  if (migrationHash_(migrationOperationsState_())!==migrationHash_(state)) throw migrationError_('MIGRATION_STATE_NOT_CONFIRMED');
}
// Owner-only: run only AFTER reviewing/verifying the new fixed deployment and
// all writer routes. No HTTP endpoint accepts project, workbook or release IDs.
function migrationPrepareOperations_(book, deployment) {
  return migrationWithSourceLock_(function() {
    var existing=migrationOperationsConfig_();
    if (existing) {
      if (existing.sourceBookId!==book.getId() || existing.projectId!==deployment.projectId || existing.schoolId!==deployment.schoolId ||
          existing.deploymentVersion!==deployment.deploymentVersion || existing.sourceFingerprint!==deployment.sourceFingerprint) throw migrationError_('MIGRATION_SETUP_CONFLICT');
      return {prepared:true,notBefore:existing.notBefore,duplicate:true};
    }
    var now=Date.now(), config={schemaVersion:1,sourceBookId:book.getId(),projectId:deployment.projectId,schoolId:deployment.schoolId,
      deploymentVersion:deployment.deploymentVersion,sourceFingerprint:deployment.sourceFingerprint,preparedAt:now,notBefore:now+600000,baselineRef:null};
    // Validate before persisting; repository construction does not call the network.
    if (!Number.isSafeInteger(config.deploymentVersion) || config.deploymentVersion<1 || !/^[a-f0-9]{64}$/.test(config.sourceFingerprint || '')) throw migrationError_('MIGRATION_INVALID_DEPLOYMENT_RECORD');
    migrationRepository_({enabled:true,projectId:config.projectId,schoolId:config.schoolId,environment:'MIRROR',sourceOfTruth:'SHEETS'});
    if (migrationTrackingConfig_()) throw migrationError_('MIGRATION_EXISTING_TRACKING_REQUIRES_REVIEW');
    // A missing document is fine; missing Firestore OAuth/IAM is not. Fail before
    // staging the write gate when the production execution identity lacks access.
    migrationOperationsRepository_(config).get('migrationChecks/access');
    migrationOperationsSaveConfig_(config);
    return {prepared:true,notBefore:config.notBefore,duplicate:false};
  });
}
function migrationActivatePreparedTracking_() {
  return migrationWithSourceLock_(function() {
    if (migrationOperationsState_().invalidated) throw migrationError_('MIGRATION_REPLICA_REBASE_REQUIRED');
    var config=migrationOperationsConfig_();
    if (!config) throw migrationError_('MIGRATION_SETUP_REQUIRED');
    var book=migrationOperationsBook_(config), tracking=migrationTrackingConfig_();
    if (tracking) {migrationAssertTrackedSource_(book);return {activated:true,duplicate:true};}
    if (Date.now()<config.notBefore) throw migrationError_('MIGRATION_DRAIN_NOT_FINISHED');
    migrationInitializeStore_(book);
    PropertiesService.getScriptProperties().setProperty('UNG_MIGRATION_TRACKING_V1',JSON.stringify({schemaVersion:1,enabled:true,sourceBookId:book.getId()}));
    migrationAssertTrackedSource_(book);
    return {activated:true,duplicate:false};
  });
}
// Owner-only, resumable: one bounded capture/page per invocation.
function migrationFreezeConfiguredBaseline_() {
  return migrationWithSourceLock_(function() {
    if (migrationOperationsState_().invalidated) throw migrationError_('MIGRATION_REPLICA_REBASE_REQUIRED');
    var config=migrationOperationsConfig_();
    if (!config) throw migrationError_('MIGRATION_SETUP_REQUIRED');
    var book=migrationOperationsBook_(config); migrationAssertTrackedSource_(book);
    if (!config.baselineRef) {
      var progress=migrationBaselineStep_(book,'UNG_MIGRATION_BASELINE_JOB_V1');
      if (progress.status!=='COMPLETE') return progress;
      config.baselineRef=progress.baselineRef;migrationOperationsSaveConfig_(config);
    }
    var base=migrationReplicaSource_(book,config.baselineRef).baseline();
    return {status:'COMPLETE',baselineRef:config.baselineRef,baseRevision:base.descriptor.revision};
  });
}
function migrationWriteGateEnabled_() {
  return !!migrationTrackingConfig_() || !!migrationOperationsConfig_();
}
function migrationGatedRoute_(body, session, callback) {
  return migrationWithSourceLock_(function() {
    if(typeof migrationPrimaryConfig_==='function'){
      var primary=migrationPrimaryConfig_();
      if(primary&&primary.phase==='DRAINING')throw migrationPrimaryMaintenance_();
      if(migrationPrimaryServing_(primary))return migrationPrimaryDispatch_(body,callback);
    }
    // Re-read activation INSIDE the common lock: a request queued before activation
    // must not use its earlier disabled decision after activation has completed.
    var tracking=migrationTrackingConfig_();
    if (tracking) return migrationTrackedRoute_(body,session,callback,tracking);
    migrationRouteActive_=true;
    try {return callback();} finally {migrationRouteActive_=false;}
  });
}
function migrationOperationsContext_() {
  var config=migrationOperationsConfig_();
  if (!config) throw migrationError_('MIGRATION_SETUP_REQUIRED');
  if (migrationOperationsState_().invalidated) throw migrationError_('MIGRATION_REPLICA_REBASE_REQUIRED');
  var book=migrationOperationsBook_(config);migrationAssertTrackedSource_(book);
  return {config:config,book:book};
}
function migrationOperationsRepository_(config) {
  return migrationRepository_({enabled:true,projectId:config.projectId,schoolId:config.schoolId,environment:'MIRROR',sourceOfTruth:'SHEETS'});
}
// Owner-only, BEFORE a rollback to code without tracking, or after an untracked
// writer is discovered. Never erase history or silently reuse the old epoch.
function migrationInvalidateReplica_() {
  return migrationWithSourceLock_(function(){
    var config=migrationOperationsConfig_();if (!config) throw migrationError_('MIGRATION_SETUP_REQUIRED');
    migrationOperationsBook_(config);
    var state=migrationOperationsState_();state.invalidated=true;state.paused=true;
    migrationOperationsSaveState_(state);
    return {paused:true,rebaseRequired:true,trackingUnchanged:true};
  });
}
function migrationOperationsStatus_() {
  if(typeof migrationPrimaryConfig_==='function' && migrationPrimaryConfig_())return migrationPrimaryStatus_();
  var config=migrationOperationsConfig_();
  if (!config) return null;
  var book=migrationOperationsBook_(config), tracking=migrationTrackingConfig_(), state=migrationOperationsState_();
  var base=null, control=null;
  if (tracking) migrationAssertTrackedSource_(book);
  if (config.baselineRef) {
    var source=migrationReplicaSource_(book,config.baselineRef);base=source.baseline();
    var document=migrationOperationsRepository_(config).get('replicaEpochs/'+config.baselineRef);
    if (document) {control=document.data;migrationAssertReplicaControl_(control,config.baselineRef,base);}
  }
  var measured=tracking ? migrationWithSourceLock_(function(){return migrationSheetsStore_(book).status();}) : null;
  if (control && control.appliedRevision!==null && control.appliedRevision>measured.highWater) throw migrationError_('MIGRATION_SOURCE_REVISION_REVERSED');
  var applied=control ? control.appliedRevision : null;
  var working=!!(state.lease && state.lease.expiresAt>Date.now());
  return {phase:state.invalidated?'REBASE_REQUIRED':!tracking?'DRAINING':!base?'TRACKING':state.paused?'PAUSED':applied===null?'COPYING_BASELINE':measured.pendingCount+measured.reviewCount?'NEEDS_REVIEW':'MIRRORING',
    replicaConnected:!!control,liveTrackingEnabled:!!tracking,baselinePrepared:!!base,replicaPaused:state.paused,workerBusy:working,
    activationNotBefore:new Date(config.notBefore).toISOString(),canRun:!!base && !state.paused && !state.invalidated && !working,
    recordedRevision:measured?measured.highWater:null,verifiedRevision:applied,baseRevision:base?base.descriptor.revision:null,
    pendingCount:measured && base ? measured.highWater-(applied===null?base.descriptor.revision:applied) : null,
    errorCount:measured?measured.pendingCount+measured.reviewCount:null,blockedRevision:measured?measured.firstUnresolvedRevision:null,
    resolvedCount:measured?measured.resolvedCount:null,lastRun:state.lastRun,
    resources:migrationCatalog_().map(function(item){
      var head=control && control.resources.filter(function(x){return x.resource===item.resource;})[0];
      return {resource:item.resource,sheetName:item.sheetName,identity:item.identity,status:head?'REPLICA_PUBLISHED':tracking?'TRACKING_PRE_COPY':'NOT_INSPECTED',replicaCount:head?head.count:null};
    })};
}
function migrationAdminRunReplica_(body) {
  requireAdmin_(body.adminPassword);
  return migrationRunConfiguredReplica_(2,8000);
}
function migrationRunConfiguredReplica_(maxSteps,maxMillis) {
  var lease=migrationWithSourceLock_(function(){
    var ctx=migrationOperationsContext_(), state=migrationOperationsState_();
    if (!ctx.config.baselineRef) throw migrationError_('MIGRATION_BASELINE_REQUIRED');
    if (state.paused) return {status:'PAUSED'};
    if (state.lease && state.lease.expiresAt>Date.now()) return {status:'BUSY'};
    state.lease={id:Utilities.getUuid(),expiresAt:Date.now()+600000};migrationOperationsSaveState_(state);
    return {id:state.lease.id,ctx:ctx};
  });
  if (!lease.id) return {status:lease.status,steps:0};
  var result;
  try {
    var source=migrationReplicaSource_(lease.ctx.book,lease.ctx.config.baselineRef), baseline=source.baseline;
    source.baseline=function(){
      var state=migrationOperationsState_();
      if (state.paused) throw migrationError_('MIGRATION_REPLICA_PAUSED');
      if (!state.lease || state.lease.id!==lease.id || state.lease.expiresAt<=Date.now()) throw migrationError_('MIGRATION_WORKER_LEASE_LOST');
      return baseline();
    };
    // Fixed server budget. Client-supplied project, paths, time and step limits ignored.
    result=migrationRunReplica_(migrationOperationsRepository_(lease.ctx.config),source,lease.ctx.config.baselineRef,{maxSteps:maxSteps,maxMillis:maxMillis});
  } catch(error) {
    result={status:error && error.code==='MIGRATION_REPLICA_PAUSED'?'PAUSED':'ERROR',steps:0,
      code:error && /^MIGRATION_[A-Z0-9_]+$/.test(error.code || '')?error.code:'MIGRATION_OPERATION_FAILED'};
  } finally {
    migrationWithSourceLock_(function(){
      var state=migrationOperationsState_();
      if (state.lease && state.lease.id===lease.id) {
        state.lease=null;state.lastRun={completedAt:new Date().toISOString(),result:result || {status:'ERROR',code:'MIGRATION_OPERATION_FAILED'}};
        migrationOperationsSaveState_(state);
      }
    });
  }
  return result;
}
function migrationAdminPauseReplica_(body) {
  requireAdmin_(body.adminPassword);
  if (typeof body.paused!=='boolean') throw migrationError_('MIGRATION_INVALID_PAUSE');
  return migrationWithSourceLock_(function(){
    migrationOperationsContext_();var state=migrationOperationsState_();state.paused=body.paused;migrationOperationsSaveState_(state);
    return {paused:state.paused,trackingContinues:true};
  });
}
function migrationAdminPrepareReview_(body,session) {
  requireAdmin_(body.adminPassword);
  if (!session || !session.name || !Number.isSafeInteger(body.revision) || body.revision<1) throw migrationError_('MIGRATION_INVALID_REVIEW_REQUEST');
  return migrationWithSourceLock_(function(){
    var ctx=migrationOperationsContext_(), plan=migrationReviewPlan_(ctx.book,body.revision), expiresAt=Date.now()+600000;
    var challenge=migrationSheetsStore_(ctx.book).putBlob({schemaVersion:1,kind:'ADMIN_REVIEW',planRef:plan.planRef,reviewerHash:migrationHash_(session.name),expiresAt:expiresAt,revision:body.revision});
    return {challengeRef:challenge,revision:plan.revision,expiresAt:new Date(expiresAt).toISOString(),changes:plan.changes.map(function(change){
      return {resource:change.resource,sheetName:migrationCatalog_().filter(function(x){return x.resource===change.resource;})[0].sheetName,
        count:change.count,putCount:change.putCount,deleteCount:change.deleteCount,source:change.source};
    })};
  });
}
function migrationAdminConfirmReview_(body,session) {
  requireAdmin_(body.adminPassword);
  if (!session || !session.name || body.decision!=='ACCEPT_OBSERVED_SOURCE' || body.sourceChecked!==true || !/^[a-f0-9]{64}$/.test(body.challengeRef || '')) throw migrationError_('MIGRATION_EXPLICIT_REVIEW_REQUIRED');
  return migrationWithSourceLock_(function(){
    var ctx=migrationOperationsContext_(), challenge=migrationSheetsStore_(ctx.book).readBlob(body.challengeRef);
    if (!challenge || challenge.kind!=='ADMIN_REVIEW' || challenge.schemaVersion!==1 || challenge.reviewerHash!==migrationHash_(session.name)) throw migrationError_('MIGRATION_REVIEW_FORBIDDEN');
    if (!Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt<Date.now()) throw migrationError_('MIGRATION_REVIEW_EXPIRED');
    return migrationConfirmReview_(ctx.book,challenge.planRef,body.decision,challenge.reviewerHash);
  });
}
