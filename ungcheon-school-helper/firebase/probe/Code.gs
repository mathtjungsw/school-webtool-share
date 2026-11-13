/** Run only in a separate standalone Apps Script project, never in the live app. */
function probeFirestoreConnection() {
  var root = 'projects/ungcheon-school-helper/databases/(default)/documents';
  var name = root + '/migrationChecks/appsScriptOAuth';
  function request(method, suffix, body) {
    var options = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    var response = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + root + suffix, options);
    var status = response.getResponseCode();
    if (status === 404) return null;
    if (status < 200 || status >= 300) throw new Error('FIRESTORE_PROBE_HTTP_' + status);
    return JSON.parse(response.getContentText());
  }
  var existing = request('get', '/migrationChecks/appsScriptOAuth');
  if (!existing) {
    request('post', ':commit', { writes: [{ update: {
      name: name,
      fields: { marker: { stringValue: 'synthetic-connection-check-v1' }, schemaVersion: { integerValue: '1' } }
    }, currentDocument: { exists: false } }] });
    existing = request('get', '/migrationChecks/appsScriptOAuth');
  }
  if (!existing || existing.fields.marker.stringValue !== 'synthetic-connection-check-v1' || existing.fields.schemaVersion.integerValue !== '1') throw new Error('FIRESTORE_PROBE_CONTENT_MISMATCH');
  var result = { ok: true, projectId: 'ungcheon-school-helper', dataset: 'SYNTHETIC_ONLY', productionScriptChanged: false };
  console.log(JSON.stringify(result));
  return result;
}

/** Exercises the actual replica adapter in an isolated synthetic school scope. */
function probeFirestoreReplica() {
  var repository = migrationRepository_({ enabled: true, projectId: 'ungcheon-school-helper', schoolId: 'migration-probe', environment: 'MIRROR', sourceOfTruth: 'SHEETS' });
  var first = migrationSnapshot_('snapshotProtocolV1', 1, [
    { sourceId: 'synthetic-001', sortOrder: 1, isDeleted: false, payload: { studentId: '00123', empty: '', zero: 0, flag: false, nullable: null, at: new Date('2026-11-13T00:00:00.000Z') } },
    { sourceId: 'synthetic-002', sortOrder: 0, isDeleted: false, payload: { status: 'pending' } }
  ]);
  var second = migrationSnapshot_('snapshotProtocolV1', 2, [
    { sourceId: 'synthetic-001', sortOrder: 1, isDeleted: true, payload: {} },
    { sourceId: 'synthetic-002', sortOrder: 0, isDeleted: false, payload: { status: 'approved' } }
  ]);
  [first, second].forEach(function(snapshot) {
    var descriptor = migrationBeginSnapshot_(repository, snapshot, 1);
    for (var index = 0; index < descriptor.pageCount; index++) migrationStagePage_(repository, snapshot, index);
    if (!migrationStagePage_(repository, snapshot, 0).skipped) throw new Error('PROBE_RETRY_FAILED');
    migrationVerifySnapshot_(repository, snapshot);
  });
  var current = repository.get('resourceManifests/snapshotProtocolV1');
  if (!current) migrationPublishSnapshot_(repository, first);
  migrationPublishSnapshot_(repository, second);
  var rejected = false;
  try { migrationPublishSnapshot_(repository, first); }
  catch (error) { if (error.code !== 'MIGRATION_STALE_REVISION') throw error; rejected = true; }
  if (!rejected || !migrationPublishSnapshot_(repository, second).duplicate) throw new Error('PROBE_REVISION_GUARD_FAILED');
  var finalHead = repository.get('resourceManifests/snapshotProtocolV1').data;
  if (finalHead.deletedCount !== 1 || finalHead.sourceRevision !== 2) throw new Error('PROBE_DELETE_FAILED');
  var result = { ok: true, dataset: 'SYNTHETIC_ONLY', checks: ['typedCopy', 'resume', 'fullVerification', 'tombstone', 'staleRejection', 'idempotentPublication'], successfulRequests: repository.metrics.requests, decodedDocuments: repository.metrics.documentsRead, acknowledgedWrites: repository.metrics.documentsWritten, productionScriptChanged: false };
  console.log(JSON.stringify(result));
  return result;
}

/** Creates/reuses one private synthetic workbook. Never opens the school source. */
function probeSheetsChangeTracking() {
  if (ScriptApp.getScriptId() !== '16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  // Preserve the failed v1 journal for diagnosis. Never automatically replay its
  // uncertain operation. This fixed v2 dataset is reused on every subsequent run.
  var properties = PropertiesService.getScriptProperties(), key = 'SYNTHETIC_TRACKING_BOOK_V2';
  var id = properties.getProperty(key), title = '웅천고 이전 시험 - 합성 변경 기록 전용 v2';
  if (id === '12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4' || id === '1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ') throw new Error('PROBE_SOURCE_FORBIDDEN');
  var book;
  if (!id) { book = SpreadsheetApp.create(title); id = book.getId(); properties.setProperty(key, id); }
  else { book = SpreadsheetApp.openById(id); if (book.getName() !== title) throw new Error('PROBE_BOOK_MISMATCH'); }
  var sheet = book.getSheetByName('공유링크');
  if (!sheet) { sheet = book.insertSheet('공유링크'); sheet.appendRow(['id','department','title','url','description','registeredBy','createdAt']); }
  migrationInitializeStore_(book);
  var config = {schemaVersion:1, enabled:true, sourceBookId:id}, writes = 0;
  function run(action, operationId, titleValue, callback) {
    return migrationTrackedRoute_({action:action, operationId:operationId, title:titleValue}, {name:'Synthetic Probe'}, callback, config, book);
  }
  function result() { return ContentService.createTextOutput(JSON.stringify({ok:true,data:{id:'synthetic-link-1'}})).setMimeType(ContentService.MimeType.JSON); }
  run('probeCreate','synthetic-create-v1','Synthetic',function() {
    migrationSourceBook_().getSheetByName('공유링크').appendRow(['synthetic-link-1','Test','Synthetic','https://example.com','','Synthetic','2026-11-13']); writes++; return result();
  });
  var firstWrites = writes;
  run('probeCreate','synthetic-create-v1','Synthetic',function() { throw new Error('PROBE_DUPLICATE_REPLAY'); });
  if (writes !== firstWrites) throw new Error('PROBE_DUPLICATE_WRITE');
  var conflict = false;
  try { run('probeCreate','synthetic-create-v1','Changed',function() { throw new Error('PROBE_CONFLICT_WRITE'); }); }
  catch (error) { if (error.code !== 'MIGRATION_OPERATION_CONFLICT') throw error; conflict = true; }
  if (!conflict) throw new Error('PROBE_CONFLICT_NOT_REJECTED');
  run('probeUpdate','synthetic-update-v1','Updated',function() {
    var lock = migrationCompatibleLock_(); lock.waitLock(10000);
    try { migrationSourceBook_().getSheetByName('공유링크').getRange(2,3).setValue('Updated'); writes++; return result(); }
    finally { lock.releaseLock(); }
  });
  run('probeDelete','synthetic-delete-v1','Deleted',function() {
    migrationSourceBook_().getSheetByName('공유링크').deleteRow(2); writes++; return result();
  });
  var store = migrationSheetsStore_(book), status = store.status();
  if (sheet.getLastRow() !== 1 || status.appliedCount < 3 || status.pendingCount || status.reviewCount) throw new Error('PROBE_JOURNAL_VERIFICATION_FAILED');
  var deleteIntent = migrationOperationIntent_({actorHash:migrationHash_('Synthetic Probe'),action:'probeDelete',requestHash:migrationHash_({action:'probeDelete',title:'Deleted'}),operationId:'synthetic-delete-v1',resources:migrationCatalog_().map(function(item){return item.resource;})});
  var deletion = store.load(deleteIntent.operationKey), delta = store.readBlob(deletion.evidence[0].deltaRef);
  if (delta.deletes.length !== 1 || delta.puts.length !== 0) throw new Error('PROBE_TOMBSTONE_FAILED');
  var output = {ok:true,dataset:'SYNTHETIC_ONLY',checks:['durableJournal','beforeImage','delta','nestedLock','duplicate','payloadConflict','tombstone','completionReadback'],sourceWritesThisExecution:writes,appliedOperations:status.appliedCount,spreadsheetId:id,spreadsheetUrl:book.getUrl(),productionScriptChanged:false};
  console.log(JSON.stringify(output)); return output;
}

/** Read-only diagnosis of the preserved synthetic v1 failure and native codec. */
function probeSheetsStorageReadback() {
  if (ScriptApp.getScriptId() !== '16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  var text = JSON.stringify({marker:'synthetic-codec-check',empty:'',zero:0});
  var gzip = Utilities.gzip(Utilities.newBlob(text,'application/json'));
  var bytes = Utilities.base64Decode(Utilities.base64Encode(gzip.getBytes()));
  var untypedReadback = false;
  try { untypedReadback = Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString('UTF-8') === text; } catch (_) {}
  var typedReadback = Utilities.ungzip(Utilities.newBlob(bytes,'application/x-gzip')).getDataAsString('UTF-8') === text;
  if (!typedReadback) throw new Error('PROBE_TYPED_CODEC_FAILED');
  var id = PropertiesService.getScriptProperties().getProperty('SYNTHETIC_TRACKING_BOOK_V1');
  if (!id || id === '12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4' || id === '1OBt8XHMYH8uNAfuozbjc8iON954FjBSmojf4y2c74GQ') throw new Error('PROBE_SOURCE_FORBIDDEN');
  var book = SpreadsheetApp.openById(id);
  if (book.getName() !== '웅천고 이전 시험 - 합성 변경 기록 전용') throw new Error('PROBE_BOOK_MISMATCH');
  var store = migrationSheetsStore_(book), status = store.status();
  var intent = migrationOperationIntent_({actorHash:migrationHash_('Synthetic Probe'),action:'probeCreate',requestHash:migrationHash_({action:'probeCreate',title:'Synthetic'}),operationId:'synthetic-create-v1',resources:migrationCatalog_().map(function(item){return item.resource;})});
  var record = store.load(intent.operationKey);
  var before = store.readBlob(migrationHash_({schemaVersion:1,resource:'links',present:true,headers:['id','department','title','url','description','registeredBy','createdAt'],records:[]}));
  var noSourceWrite = book.getSheetByName('공유링크').getLastRow() === 1;
  if (!record || record.phase !== 'PREPARED' || record.touched.length || !before || !noSourceWrite) throw new Error('PROBE_FAILURE_BOUNDARY_MISMATCH');
  var output = {ok:true,dataset:'SYNTHETIC_ONLY',untypedReadback:untypedReadback,typedReadback:typedReadback,preservedBeforeImageVerified:true,sourceRows:0,preservedPendingOperations:status.pendingCount,spreadsheetId:id,productionScriptChanged:false};
  console.log(JSON.stringify(output)); return output;
}

/** End-to-end synthetic Sheets journal -> Firestore archive, including recovery. */
function probeJournalReplication() {
  if (ScriptApp.getScriptId() !== '16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  var properties=PropertiesService.getScriptProperties(), id=properties.getProperty('SYNTHETIC_TRACKING_BOOK_V2');
  if (id!=='1Mab0-2RIeA68lk6ZlhB5yL1eKI7DLY8kpTl6pNjidfI') throw new Error('PROBE_BOOK_MISMATCH');
  var book=SpreadsheetApp.openById(id);
  if (book.getName()!=='웅천고 이전 시험 - 합성 변경 기록 전용 v2') throw new Error('PROBE_BOOK_MISMATCH');
  var store=migrationSheetsStore_(book), config={schemaVersion:1,enabled:true,sourceBookId:id};
  var key='SYNTHETIC_REPLICA_BASELINE_V1', baselineRef=properties.getProperty(key);
  if (!baselineRef) {
    if (store.highWater()!==3) throw new Error('PROBE_BASELINE_BOUNDARY_MISMATCH');
    baselineRef=migrationFreezeBaseline_(book,['links'],config); properties.setProperty(key,baselineRef);
  }
  var source=migrationReplicaSource_(book,baselineRef,config), base=source.baseline(), writes=0;
  if (base.descriptor.revision!==3) throw new Error('PROBE_BASELINE_BOUNDARY_MISMATCH');
  function body(action) {return {action:action,operationId:'synthetic-replica-'+action+'-v1'};}
  function intent(action) {return migrationOperationIntent_({actorHash:migrationHash_('Synthetic Replica Probe'),action:action,requestHash:migrationHash_(migrationBusinessRequest_(body(action))),operationId:body(action).operationId,resources:migrationCatalog_().map(function(x){return x.resource;})});}
  function response() {return ContentService.createTextOutput(JSON.stringify({ok:true,data:{id:'synthetic-replica-link-1'}})).setMimeType(ContentService.MimeType.JSON);}
  function run(action,callback) {return migrationTrackedRoute_(body(action),{name:'Synthetic Replica Probe'},callback,config,book);}
  run('replicaCreate',function(){migrationSourceBook_().getSheetByName('공유링크').appendRow(['synthetic-replica-link-1','Test','Created','https://example.com/replica','','Synthetic','2026-11-13']);writes++;return response();});
  var uncertain=store.load(intent('replicaUpdate').operationKey);
  if (!uncertain) {
    var capture=migrationCaptureResource_, captures=0;
    try {
      migrationCaptureResource_=function(){captures++;if(captures===2)throw migrationError_('SYNTHETIC_AFTER_SAVE_FAILURE');return capture.apply(null,arguments);};
      run('replicaUpdate',function(){migrationSourceBook_().getSheetByName('공유링크').getRange(2,3).setValue('Updated before delete');writes++;return response();});
    } finally {migrationCaptureResource_=capture;}
    uncertain=store.load(intent('replicaUpdate').operationKey);
  }
  if (!uncertain || uncertain.phase!=='PREPARED' || uncertain.revision!==5) throw new Error('PROBE_UNCERTAIN_BOUNDARY_MISMATCH');
  run('replicaDelete',function(){migrationSourceBook_().getSheetByName('공유링크').deleteRow(2);writes++;return response();});
  var repository=migrationRepository_({enabled:true,projectId:'ungcheon-school-helper',schoolId:'migration-probe-tracking-v1',environment:'MIRROR',sourceOfTruth:'SHEETS'});
  var before=migrationRunReplica_(repository,source,baselineRef,{maxSteps:40,maxMillis:150000}), reviewedNow=false;
  if (!store.cachedRef(migrationHash_(['review',5]))) {
    if (before.status!=='NEEDS_REVIEW' || before.blockedRevision!==5) throw new Error('PROBE_REVIEW_GATE_FAILED');
    var prior=migrationReadReplica_(repository,baselineRef);
    if (prior.appliedRevision!==4 || prior.resources.links.records.length!==1) throw new Error('PROBE_PREMATURE_PUBLICATION');
    var review=migrationReviewPlan_(book,5);
    if (review.changes.length!==1 || review.changes[0].source!=='NEXT_BEFORE_IMAGE' || review.changes[0].count!==1) throw new Error('PROBE_HISTORICAL_RECOVERY_FAILED');
    migrationConfirmReview_(book,review.planRef,'ACCEPT_OBSERVED_SOURCE',migrationHash_('Synthetic Probe Admin')); reviewedNow=true;
  }
  var completed=migrationRunReplica_(repository,source,baselineRef,{maxSteps:40,maxMillis:150000});
  if (completed.status!=='IDLE' || completed.appliedRevision!==6) throw new Error('PROBE_REPLICA_NOT_COMPLETE');
  var replica=migrationReadReplica_(repository,baselineRef), status=store.status();
  var current=migrationWithSourceLock_(function(){return migrationCaptureResource_(book,store,'links');});
  if (migrationHash_(replica.resources.links)!==migrationHash_(current) || replica.resources.links.records.length || replica.tombstones.links['synthetic-replica-link-1']!==6 || status.pendingCount || status.reviewCount || status.resolvedCount!==1) throw new Error('PROBE_REPLICA_MISMATCH');
  var written=repository.metrics.documentsWritten;
  if (migrationRunReplica_(repository,source,baselineRef,{maxSteps:1}).status!=='IDLE' || repository.metrics.documentsWritten!==written) throw new Error('PROBE_IDLE_REWROTE_DATA');
  var output={ok:true,dataset:'SYNTHETIC_ONLY',checks:['frozenBaseline','orderedDeltas','verifiedPages','uncertainWriteGate','historicalBeforeImageRecovery','sourceNotReplayed','tombstone','fullReplicaReadback','idleNoWrites'],
    sourceWritesThisExecution:writes,reviewedThisExecution:reviewedNow,mirroredRevision:replica.appliedRevision,pendingOperations:status.pendingCount+status.reviewCount,resolvedOperations:status.resolvedCount,
    acknowledgedFirestoreWrites:repository.metrics.documentsWritten,successfulRequests:repository.metrics.requests,baselineRef:baselineRef,productionScriptChanged:false};
  console.log(JSON.stringify(output));return output;
}

/** Native management smoke check: reuse the completed synthetic epoch, never source rows. */
function probeMigrationOperations() {
  if (ScriptApp.getScriptId()!=='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9') throw new Error('PROBE_PROJECT_MISMATCH');
  var properties=PropertiesService.getScriptProperties(),id=properties.getProperty('SYNTHETIC_TRACKING_BOOK_V2');
  if (id!=='1Mab0-2RIeA68lk6ZlhB5yL1eKI7DLY8kpTl6pNjidfI') throw new Error('PROBE_BOOK_MISMATCH');
  var book=SpreadsheetApp.openById(id),ref=properties.getProperty('SYNTHETIC_REPLICA_BASELINE_V1');
  if (book.getName()!=='웅천고 이전 시험 - 합성 변경 기록 전용 v2' || !/^[a-f0-9]{64}$/.test(ref || '')) throw new Error('PROBE_BOOK_MISMATCH');
  var keys=['UNG_MIGRATION_OPERATIONS_V1','UNG_MIGRATION_TRACKING_V1','UNG_MIGRATION_REPLICA_STATE_V1'],restoreKey='SYNTHETIC_OPS_RESTORE_V1';
  function restore(saved) {keys.forEach(function(key){if(saved[key]===null)properties.deleteProperty(key);else properties.setProperty(key,saved[key]);});}
  var prior=properties.getProperty(restoreKey);
  if (prior) {restore(JSON.parse(prior));properties.deleteProperty(restoreKey);}
  var saved={};keys.forEach(function(key){saved[key]=properties.getProperty(key);});properties.setProperty(restoreKey,JSON.stringify(saved));
  var originalBook=migrationOperationsBook_, originalRepository=migrationOperationsRepository_, counters={requests:0,writes:0},output;
  try {
    keys.forEach(function(key){properties.deleteProperty(key);});
    migrationOperationsBook_=function(config){if(config.sourceBookId!==id)throw new Error('PROBE_BOOK_MISMATCH');return book;};
    migrationOperationsRepository_=function(config){
      if(config.projectId!=='ungcheon-school-helper'||config.schoolId!=='migration-probe-tracking-v1')throw new Error('PROBE_TARGET_MISMATCH');
      var repository=originalRepository(config),get=repository.get,commit=repository.commit;
      repository.get=function(path){counters.requests++;return get(path);};
      repository.commit=function(writes){var result=commit(writes);counters.requests++;counters.writes+=writes.length;return result;};
      return repository;
    };
    migrationPrepareOperations_(book,{projectId:'ungcheon-school-helper',schoolId:'migration-probe-tracking-v1',deploymentVersion:999,sourceFingerprint:migrationHash_('SYNTHETIC_DEPLOYMENT_RECORD_ONLY')});
    var blocked=false;try{migrationActivatePreparedTracking_();}catch(error){if(error.code==='MIGRATION_DRAIN_NOT_FINISHED')blocked=true;else throw error;}
    if(!blocked)throw new Error('PROBE_DRAIN_GATE_FAILED');
    // This is a synthetic completed-epoch fixture, not evidence that ten real minutes elapsed.
    properties.setProperty('UNG_MIGRATION_TRACKING_V1',JSON.stringify({schemaVersion:1,enabled:true,sourceBookId:id}));
    var config=migrationOperationsConfig_();config.baselineRef=ref;migrationOperationsSaveConfig_(config);
    var denied=false;try{migrationAdminRunReplica_({adminPassword:'DENIED_SYNTHETIC'});}catch(error){if(error.message==='SYNTHETIC_ADMIN_REQUIRED')denied=true;else throw error;}
    var admin={adminPassword:'SYNTHETIC_ADMIN_ONLY'},status=migrationAdminStatus_(admin),before=migrationSheetsStore_(book).status().highWater;
    if(!denied||status.verifiedRevision!==6||status.pendingCount!==0||status.activeBackend!=='SHEETS'||status.cutoverReady)throw new Error('PROBE_STATUS_FAILED');
    if(migrationAdminRunReplica_(admin).status!=='IDLE')throw new Error('PROBE_RUN_FAILED');
    migrationAdminPauseReplica_({adminPassword:admin.adminPassword,paused:true});
    if(migrationAdminRunReplica_(admin).status!=='PAUSED')throw new Error('PROBE_PAUSE_FAILED');
    migrationAdminPauseReplica_({adminPassword:admin.adminPassword,paused:false});
    migrationWithSourceLock_(function(){var state=migrationOperationsState_();state.lease={id:'synthetic-competing-worker',expiresAt:Date.now()+600000};migrationOperationsSaveState_(state);});
    if(migrationAdminRunReplica_(admin).status!=='BUSY')throw new Error('PROBE_LEASE_FAILED');
    migrationWithSourceLock_(function(){var state=migrationOperationsState_();state.lease=null;migrationOperationsSaveState_(state);});
    if(migrationAdminRunReplica_(admin).status!=='IDLE'||migrationSheetsStore_(book).status().highWater!==before||counters.writes!==0)throw new Error('PROBE_MANAGEMENT_REWROTE_DATA');
    migrationInvalidateReplica_();
    if(migrationAdminStatus_(admin).phase!=='REBASE_REQUIRED'||!migrationTrackingConfig_().enabled)throw new Error('PROBE_INVALIDATION_FAILED');
    var resumeDenied=false;try{migrationAdminPauseReplica_({adminPassword:admin.adminPassword,paused:false});}catch(error){if(error.code==='MIGRATION_REPLICA_REBASE_REQUIRED')resumeDenied=true;else throw error;}
    if(!resumeDenied)throw new Error('PROBE_INVALIDATED_RESUME_ALLOWED');
    output={ok:true,dataset:'SYNTHETIC_ONLY',checks:['targetAccess','earlyActivationRejected','adminDenied','aggregateStatus','manualIdle','pauseResume','overlappingWorkerRejected','rollbackInvalidatesReplica','unchangedSourceRevision','zeroFirestoreWrites','settingsRestored'],mirroredRevision:6,sourceRevisionBefore:before,sourceRevisionAfter:before,acknowledgedFirestoreWrites:counters.writes,requests:counters.requests,productionScriptChanged:false,realDrainWaitPerformed:false};
  } finally {
    migrationOperationsBook_=originalBook;migrationOperationsRepository_=originalRepository;restore(saved);
    keys.forEach(function(key){if(properties.getProperty(key)!==saved[key])throw new Error('PROBE_SETTINGS_RESTORE_FAILED');});properties.deleteProperty(restoreKey);
  }
  console.log(JSON.stringify(output));return output;
}
// This stand-alone probe has no production Code.gs; synthetic authorization only.
function requireAdmin_(password) {
  if(ScriptApp.getScriptId()!=='16HGqhZ9mL-qtcvj9x0lIUrJ49l33xmB8PZgbB-af9BX5HEgonPcp9_x9'||password!=='SYNTHETIC_ADMIN_ONLY')throw new Error('SYNTHETIC_ADMIN_REQUIRED');
}
