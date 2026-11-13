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
function migrationOwnerReleaseId_() {return 'migration-service65-rollout-v3';}
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
    var steps=0;
    do {result=migrationFreezeConfiguredBaseline_();steps++;} while(result.status!=='COMPLETE' && Date.now()-start<40000 && steps<8);
    console.log(JSON.stringify({phase:'BASELINE',steps:steps,elapsedMillis:Date.now()-start,progress:result}));return result;
  }
  result=migrationRunConfiguredReplica_(16,40000);
  console.log(JSON.stringify({phase:'REPLICATION',elapsedMillis:Date.now()-start,result:result}));return result;
}
function inspectMigrationProduction() {
  migrationProductionIdentity_();var status=migrationOperationsStatus_();console.log(JSON.stringify(status));return status;
}
