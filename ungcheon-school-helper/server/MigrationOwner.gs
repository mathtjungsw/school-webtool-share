/** Owner/editor entry points, never routed by doGet/doPost. Sheets stays primary. */
function migrationProductionIdentity_() {
  var scriptId='1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb';
  if (ScriptApp.getScriptId()!==scriptId) throw migrationError_('MIGRATION_PRODUCTION_PROJECT_REQUIRED');
  var book=SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId()!=='12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4') throw migrationError_('MIGRATION_SOURCE_MISMATCH');
  return {scriptId:scriptId,book:book,deploymentId:'AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w'};
}
// Rotated with each production migration release. The guarded deployment tool
// records this ID only after checking main, exact immutable source, HEAD and URL.
function migrationOwnerReleaseId_() {return 'migration-service67-backend-v2';}
function migrationOwnerEvidence_(identity) {
  var doc=migrationOperationsRepository_({projectId:'ungcheon-school-helper',schoolId:'ungcheon'}).get('migrationChecks/deployment');
  var record=doc && doc.data;
  if (!record || record.schemaVersion!==1 || record.scriptId!==identity.scriptId || record.deploymentId!==identity.deploymentId ||
      record.serviceVersion!==MOBILE_SERVICE_VERSION || record.releaseId!==migrationOwnerReleaseId_() || record.headMatchesDeployment!==true ||
      !Number.isSafeInteger(record.deploymentVersion) || record.deploymentVersion<1 || !/^[a-f0-9]{64}$/.test(record.sourceFingerprint || '') ||
      !Number.isSafeInteger(record.verifiedAt) || record.verifiedAt>Date.now()+30000 || Date.now()-record.verifiedAt>3600000) throw migrationError_('MIGRATION_INVALID_DEPLOYMENT_RECORD');
  var response=UrlFetchApp.fetch('https://script.google.com/macros/s/'+identity.deploymentId+'/exec',{muteHttpExceptions:true}),health;
  try {health=JSON.parse(response.getContentText());}catch(_){throw migrationError_('MIGRATION_DEPLOYMENT_HEALTH_FAILED');}
  if (response.getResponseCode()!==200 || !health.ok || !health.data || health.data.service!=='UngcheonSchoolHub' || health.data.version!==MOBILE_SERVICE_VERSION) throw migrationError_('MIGRATION_DEPLOYMENT_HEALTH_FAILED');
  return {projectId:'ungcheon-school-helper',schoolId:'ungcheon',deploymentVersion:record.deploymentVersion,sourceFingerprint:record.sourceFingerprint};
}
// Run this in staged HEAD to grant the explicit scopes before the live update.
// Reads access only; does not initialize migration properties or source tables.
function authorizeMigrationConnection() {
  var identity=migrationProductionIdentity_();
  migrationOperationsRepository_({projectId:'ungcheon-school-helper',schoolId:'ungcheon'}).get('migrationChecks/access');
  var result={ok:true,firestoreAccess:true,ownedTriggerCount:ScriptApp.getProjectTriggers().length,sourceOfTruth:'SHEETS',sourceChanged:false};
  console.log(JSON.stringify(result));return result;
}
function prepareMigrationProduction() {
  var identity=migrationProductionIdentity_(),evidence=migrationOwnerEvidence_(identity);
  var result=migrationPrepareOperations_(identity.book,evidence);
  console.log(JSON.stringify({ok:true,phase:'DRAINING',notBefore:new Date(result.notBefore).toISOString(),deploymentVersion:evidence.deploymentVersion,sourceOfTruth:'SHEETS'}));return result;
}
function refreshMigrationPreparedDeployment() {
  var identity=migrationProductionIdentity_(),evidence=migrationOwnerEvidence_(identity);
  return migrationWithSourceLock_(function(){
    var config=migrationOperationsConfig_();
    if(!config || migrationTrackingConfig_() || config.baselineRef || config.sourceBookId!==identity.book.getId() || config.projectId!==evidence.projectId || config.schoolId!==evidence.schoolId || migrationOperationsState_().invalidated)throw migrationError_('MIGRATION_REFRESH_NOT_ALLOWED');
    if(config.deploymentVersion!==evidence.deploymentVersion || config.sourceFingerprint!==evidence.sourceFingerprint){
      config.deploymentVersion=evidence.deploymentVersion;config.sourceFingerprint=evidence.sourceFingerprint;config.preparedAt=Date.now();config.notBefore=config.preparedAt+600000;migrationOperationsSaveConfig_(config);
    }
    var result={ok:true,phase:'DRAINING',notBefore:new Date(config.notBefore).toISOString(),deploymentVersion:config.deploymentVersion,sourceOfTruth:'SHEETS'};
    console.log(JSON.stringify(result));return result;
  });
}
function primeMigrationSchema() {
  var identity=migrationProductionIdentity_(),tracking=migrationTrackingConfig_();
  function initialize(){ensureSheets_();return json_({ok:true,data:{schemaPrepared:true}});}
  var result=migrationWithSourceLock_(function(){
    return tracking?migrationTrackedRoute_({action:'migrationPrimeSchema',operationId:'owner-schema-service-'+MOBILE_SERVICE_VERSION},{name:'owner:migration-schema'},initialize,tracking,identity.book):initialize();
  });
  if(!JSON.parse(result.getContent()).ok)throw migrationError_('MIGRATION_SCHEMA_PREPARATION_FAILED');
  console.log(JSON.stringify({ok:true,schemaPrepared:true,serviceVersion:MOBILE_SERVICE_VERSION,sourceOfTruth:'SHEETS'}));
}
function activateMigrationProduction() {
  var identity=migrationProductionIdentity_(),evidence=migrationOwnerEvidence_(identity),config=migrationOperationsConfig_();
  if (!config || config.deploymentVersion!==evidence.deploymentVersion || config.sourceFingerprint!==evidence.sourceFingerprint) throw migrationError_('MIGRATION_DEPLOYMENT_CODE_DIFFERS');
  var result=migrationActivatePreparedTracking_();console.log(JSON.stringify({ok:true,tracking:result,sourceOfTruth:'SHEETS'}));return result;
}
function installMigrationReplicationTrigger() {
  migrationProductionIdentity_();migrationOperationsContext_();
  var matches=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='migrationReplicationTick';});
  if (matches.length>1) throw migrationError_('MIGRATION_DUPLICATE_TRIGGER');
  if (!matches.length) ScriptApp.newTrigger('migrationReplicationTick').timeBased().everyMinutes(5).create();
  console.log(JSON.stringify({ok:true,handler:'migrationReplicationTick',intervalMinutes:5,duplicate:!!matches.length,sourceOfTruth:'SHEETS'}));
}
function migrationReplicationTick() {
  migrationProductionIdentity_();
  var ctx=migrationOperationsContext_(),state=migrationOperationsState_(),start=Date.now(),result;
  if (state.paused) {console.log(JSON.stringify({status:'PAUSED'}));return;}
  if (!ctx.config.baselineRef) {
    return migrationBaselineBatch_();
  }
  result=migrationRunConfiguredReplica_(16,40000);
  if(result.status==='IDLE')result.serving=migrationServingStep_(migrationOperationsRepository_(ctx.config),ctx.config.baselineRef);
  console.log(JSON.stringify({phase:'REPLICATION',elapsedMillis:Date.now()-start,result:result}));return result;
}
function migrationBaselineBatch_() {
  var lease=migrationWithSourceLock_(function(){
    var state=migrationOperationsState_();
    if(state.paused || state.invalidated)return null;
    if(state.lease && state.lease.expiresAt>Date.now())return null;
    state.lease={id:Utilities.getUuid(),expiresAt:Date.now()+600000};migrationOperationsSaveState_(state);return state.lease.id;
  });
  if(!lease){console.log(JSON.stringify({phase:'BASELINE',status:'BUSY_OR_PAUSED'}));return {status:'BUSY_OR_PAUSED'};}
  var start=Date.now(),steps=0,result;
  try{
    do{
      result=migrationFreezeConfiguredBaseline_();steps++;
      // Let an already waiting interactive writer acquire the source lock.
      if(result.status!=='COMPLETE' && typeof Utilities.sleep==='function')Utilities.sleep(200);
    }while(result.status!=='COMPLETE' && Date.now()-start<40000 && steps<8);
    console.log(JSON.stringify({phase:'BASELINE',steps:steps,elapsedMillis:Date.now()-start,progress:result}));return result;
  }finally{
    migrationWithSourceLock_(function(){var state=migrationOperationsState_();if(state.lease && state.lease.id===lease){state.lease=null;migrationOperationsSaveState_(state);}});
  }
}
function inspectMigrationProduction() {
  migrationProductionIdentity_();var status=migrationOperationsStatus_();console.log(JSON.stringify(status));return status;
}
function verifyMigrationProductionResource() {
  migrationProductionIdentity_();
  var ctx=migrationOperationsContext_(),repo=migrationOperationsRepository_(ctx.config),reader=migrationServingReader_(repo,ctx.config.baselineRef);
  var props=PropertiesService.getScriptProperties(),key='UNG_MIGRATION_VERIFICATION_V1',signature=migrationHash_([ctx.config.baselineRef,reader.revision,MOBILE_SERVICE_VERSION]);
  var text=props.getProperty(key),job=text?JSON.parse(text):null;
  if(!job || job.signature!==signature)job={schemaVersion:1,signature:signature,revision:reader.revision,checks:[]};
  var catalog=migrationCatalog_().slice().sort(function(a,b){return a.resource.localeCompare(b.resource);}),item=catalog[job.checks.length];
  if(!item){console.log(JSON.stringify({ok:true,status:'COMPLETE',revision:job.revision,resources:job.checks,sourceOfTruth:'SHEETS'}));return job;}
  var mirror=reader.resource(item.resource),start=Date.now();
  var check=migrationWithSourceLock_(function(){
    var store=migrationSheetsStore_(ctx.book),status=store.status();
    if(status.highWater!==reader.revision || status.pendingCount || status.reviewCount)throw migrationError_('MIGRATION_VERIFICATION_WAIT_FOR_REPLICA');
    var source=migrationCaptureResource_(ctx.book,store,item.resource),digest=migrationHash_(source);
    if(digest!==migrationHash_(mirror))throw migrationError_('MIGRATION_VERIFICATION_MISMATCH');
    var formulas=0,dates=0;source.records.forEach(function(row){var payload=migrationDecode_(row.payload);payload.formulas.forEach(function(v){if(v)formulas++;});payload.cells.forEach(function(v){if(v instanceof Date)dates++;});});
    return {resource:item.resource,count:source.records.length,digest:digest,formulaCells:formulas,dateCells:dates};
  });
  job.checks.push(check);props.setProperty(key,JSON.stringify(job));
  var result={ok:true,status:job.checks.length===catalog.length?'COMPLETE':'PROGRESS',revision:job.revision,checkedResources:job.checks.length,totalResources:catalog.length,check:check,elapsedMillis:Date.now()-start,sourceOfTruth:'SHEETS'};
  console.log(JSON.stringify(result));return result;
}
function verifyMigrationProductionRead() {
  migrationProductionIdentity_();var ctx=migrationOperationsContext_(),repo=migrationOperationsRepository_(ctx.config),reader=migrationServingReader_(repo,ctx.config.baselineRef);
  var names=['listLinks','listNotices','listFeatureRequests','getTimetable','getStudentTimetable','getStaffRoster','getStudentRoster','listStaffChecklists','listCommitteeState','listTimetableChanges','getTimetableOverrides','getNeisSnapshot','getSyncManifest'];
  var props=PropertiesService.getScriptProperties(),key='UNG_MIGRATION_READ_PARITY_V1',signature=migrationHash_([ctx.config.baselineRef,reader.revision,MOBILE_SERVICE_VERSION]),text=props.getProperty(key),job=text?JSON.parse(text):null;
  if(!job || job.signature!==signature)job={schemaVersion:1,signature:signature,revision:reader.revision,checks:[]};
  var action=names[job.checks.length];if(!action){console.log(JSON.stringify({ok:true,status:'COMPLETE',revision:reader.revision,checks:job.checks,authenticatedTransportTest:false,sourceOfTruth:'SHEETS'}));return job;}
  var functions={listLinks:listLinks_,listNotices:listNotices_,listFeatureRequests:listFeatureRequests_,getTimetable:getTimetable_,getStudentTimetable:getStudentTimetable_,getStaffRoster:getStaffRoster_,getStudentRoster:getStudentRoster_,listStaffChecklists:listStaffChecklists_,listCommitteeState:listCommitteeState_,listTimetableChanges:listTimetableChanges_,getTimetableOverrides:listTimetableOverrides_,getNeisSnapshot:getNeisSnapshot_,getSyncManifest:getSyncManifest_};
  var staff=reader.resource('staff'),nameColumn=staff.headers.indexOf('name'),viewer=staff.records.length?String(migrationDecode_(staff.records[0].payload).cells[nameColumn]):'';
  var body={viewerName:viewer,fromDate:'2026-01-01',toDate:'2026-12-31',includeSchool:true,includeInactive:true};
  function invoke(){return functions[action](body);}
  function digest(value){return migrationHash_(JSON.parse(JSON.stringify(value,function(key,v){return key==='generatedAt'?'<request-time>':v;})));}
  var check=migrationWithSourceLock_(function(){
    var status=migrationSheetsStore_(ctx.book).status();if(status.highWater!==reader.revision || status.pendingCount || status.reviewCount)throw migrationError_('MIGRATION_VERIFICATION_WAIT_FOR_REPLICA');
    var start=Date.now(),original=invoke(),sourceMillis=Date.now()-start;start=Date.now();
    var preview=migrationWithBackend_(reader,ctx.book.getId(),false,invoke),mirrorMillis=Date.now()-start;
    if(digest(original)!==digest(preview.response))throw migrationError_('MIGRATION_RESPONSE_MISMATCH');
    return {action:action,digest:digest(original),sourceMillis:sourceMillis,mirrorMillis:mirrorMillis,resourcesRead:preview.loaded};
  });
  job.checks.push(check);props.setProperty(key,JSON.stringify(job));console.log(JSON.stringify({ok:true,status:job.checks.length===names.length?'COMPLETE':'PROGRESS',revision:reader.revision,checkedActions:job.checks.length,totalActions:names.length,check:check,authenticatedTransportTest:false,sourceOfTruth:'SHEETS'}));return job;
}
