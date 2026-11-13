/** Owner/editor entry points, never routed by doGet/doPost. Sheets stays primary. */
function migrationProductionIdentity_() {
  var scriptId='1rLmGrYBAeMUHxGr9CSeT1DUtTUoDbmNpydp1rGe5DL-RzDlyoZCleLnb';
  if (ScriptApp.getScriptId()!==scriptId) throw migrationError_('MIGRATION_PRODUCTION_PROJECT_REQUIRED');
  var book=SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId()!=='12HhlpO5xjhp0JlKNlf6UVd1Dlz8ZgThFYJ9j4jM0nf4') throw migrationError_('MIGRATION_SOURCE_MISMATCH');
  return {scriptId:scriptId,book:book,deploymentId:'AKfycbwFiXk0fxkJSy2Mk17BPKblEARQZYdAUzP6JDtpbV_Qj203xHGWqxnBqSaWaWJYDOyu4w'};
}
function migrationOwnerApi_(identity,path) {
  var response;
  try {response=UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/'+identity.scriptId+path,
    {headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});}
  catch (_) {throw migrationError_('MIGRATION_DEPLOYMENT_READ_FAILED');}
  if (response.getResponseCode()!==200) {
    var reason='UNKNOWN';
    try {
      var payload=JSON.parse(response.getContentText());
      var detail=(payload.error && payload.error.details || []).filter(function(x){return x['@type']==='type.googleapis.com/google.rpc.ErrorInfo';})[0];
      if (detail && /^[A-Z_]{1,80}$/.test(detail.reason || '')) reason=detail.reason;
    } catch (_) {}
    throw migrationError_('MIGRATION_DEPLOYMENT_READ_HTTP_'+response.getResponseCode()+'_'+reason);
  }
  try {return JSON.parse(response.getContentText());}catch(_){throw migrationError_('MIGRATION_DEPLOYMENT_READ_FAILED');}
}
function migrationOwnerContentHash_(content) {
  return migrationHash_(content.files.map(function(file){return {name:file.name,type:file.type,source:file.source.replace(/\r\n/g,'\n').trimEnd()};})
    .sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:0;}));
}
function migrationOwnerEvidence_(identity) {
  var deployment=migrationOwnerApi_(identity,'/deployments/'+identity.deploymentId), version=deployment.deploymentConfig.versionNumber;
  if (deployment.deploymentId!==identity.deploymentId || !Number.isSafeInteger(version) || version<1) throw migrationError_('MIGRATION_INVALID_DEPLOYMENT_RECORD');
  var deployed=migrationOwnerApi_(identity,'/content?versionNumber='+version), head=migrationOwnerApi_(identity,'/content');
  var fingerprint=migrationOwnerContentHash_(deployed);
  if (fingerprint!==migrationOwnerContentHash_(head)) throw migrationError_('MIGRATION_DEPLOYMENT_HEAD_DIFFERS');
  var code=deployed.files.filter(function(file){return file.name==='Code' && file.type==='SERVER_JS';})[0];
  if (!code || !new RegExp('const MOBILE_SERVICE_VERSION = '+MOBILE_SERVICE_VERSION+';').test(code.source) ||
    !deployed.files.some(function(file){return file.name==='MigrationOwner';})) throw migrationError_('MIGRATION_DEPLOYMENT_CODE_DIFFERS');
  return {projectId:'ungcheon-school-helper',schoolId:'ungcheon',deploymentVersion:version,sourceFingerprint:fingerprint};
}
// Run this in staged HEAD to grant the explicit scopes before the live update.
// Reads access only; does not initialize migration properties or source tables.
function authorizeMigrationConnection() {
  var identity=migrationProductionIdentity_();
  migrationOperationsRepository_({projectId:'ungcheon-school-helper',schoolId:'ungcheon'}).get('migrationChecks/access');
  migrationOwnerApi_(identity,'/deployments/'+identity.deploymentId);
  var result={ok:true,firestoreAccess:true,deploymentReadAccess:true,ownedTriggerCount:ScriptApp.getProjectTriggers().length,sourceOfTruth:'SHEETS',sourceChanged:false};
  console.log(JSON.stringify(result));return result;
}
function prepareMigrationProduction() {
  var identity=migrationProductionIdentity_(),evidence=migrationOwnerEvidence_(identity);
  var result=migrationPrepareOperations_(identity.book,evidence);
  console.log(JSON.stringify({ok:true,phase:'DRAINING',notBefore:new Date(result.notBefore).toISOString(),deploymentVersion:evidence.deploymentVersion,sourceOfTruth:'SHEETS'}));return result;
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
